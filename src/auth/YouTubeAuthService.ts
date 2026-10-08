import {randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { OAuth2Client, type Credentials} from "google-auth-library";
import type { YouTubeConfig} from "../config/env.js";
import { logger } from "../logger.js";
import { YouTubeTokenStore } from "./YouTubeTokenStore.js";

export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

const AUTHORIZATION_TIMEOUT_MS = 10 * 60 * 1000;

export type YouTubeOAuthState = "unconfigured" | "disconnected" | "authorizing" | "authorized" | "error";

export interface YouTubeOAuthStatus { state: YouTubeOAuthState; details: string; expiresAt?: string;}

export interface YouTubeAuthorizationStart { authorizationUrl: string; expiresAt: string; instructions: string []}

export interface YouTubeAuthPort { getStatus(): Promise<YouTubeOAuthStatus>; getAuthorizedClient(): Promise<OAuth2Client>}

interface PendingAuthorization { state: string, expiresAt: number; server: Server; timeout: NodeJS.Timeout;}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isLoopbackHost(hostname: string): boolean {
    return (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1");
}

export function buildYouTubeAuthorizationUrl(client: OAuth2Client, state: string) : string {
    return client.generateAuthUrl({access_type: "offline", prompt: "consent", include_granted_scopes: true, scope: [...YOUTUBE_OAUTH_SCOPES], state})
}

export class YouTubeAuthService implements YouTubeAuthPort {
    private readonly tokenStore: YouTubeTokenStore;
    private pending: PendingAuthorization | undefined;
    private lastError: string | undefined;

    constructor(private readonly config: YouTubeConfig){
        this.tokenStore = new YouTubeTokenStore(config.tokenPath);
        this.validateRedirectUri();
    }

    private isConfigured(): boolean {
        return Boolean(this.config.clientId && this.config.clientSecret);
    }

    private assertConfigured(): void {
        if(!this.isConfigured()){
            throw new Error("YouTube OAuth is not configured. Please provide clientId and clientSecret in the configuration.");
        }
    }

    private validateRedirectUri(): void {
        const redirect = new URL(this.config.redirectUri);

        if(redirect.protocol !== "http:"){
            throw new Error(`Invalid redirectUri: ${this.config.redirectUri}. Only http protocol is supported for local development.`);
        }

        if(!isLoopbackHost(redirect.hostname)){
            throw new Error("YouTube OAuth callback must bind only to localhost or another loopback address.")
        }

        if(!redirect.port){
            throw new Error("YouTube OAuth callback must specify a port number in the redirectUri.");
        }
    }

    private createOAuthClient(): OAuth2Client {
        this.assertConfigured();
        const clientId = this.config.clientId;
        const clientSecret = this.config.clientSecret;
        const redirectUri = this.config.redirectUri;

        if(!clientId || !clientSecret){
            throw new Error("YouTube OAuth is not configured. Please provide clientId and clientSecret in the configuration.")
        }
        return new OAuth2Client({clientId, clientSecret, redirectUri});
    }

    async startAuthorization(): Promise<YouTubeAuthorizationStart>{
        this.assertConfigured();

        if(this.pending){
            throw new Error("Authorization is already in progress")
        }

        this.lastError = undefined;

        const redirect = new URL(this.config.redirectUri);
        const state = randomBytes(32).toString("hex");
        const expiresAt = Date.now() + AUTHORIZATION_TIMEOUT_MS;
        const oauthClient = this.createOAuthClient();

        const server = createServer((request, response) => {
            void this.handleCallback(request, response, state, oauthClient);
        })

        await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
            server.off("listening", onListening);
            reject(error);
        };

        const onListening = () => {
            server.off("error", onError);
            resolve();
        };

        server.once("error", onError);
        server.once("listening", onListening);

        server.listen(Number(redirect.port), redirect.hostname)});

        const timeout = setTimeout(() => {
            this.lastError = "YouTube OAuth authorization timed out.";
            this.closePendingAuthorization();
        }, AUTHORIZATION_TIMEOUT_MS);

        timeout.unref();

        this.pending = {state, expiresAt, server, timeout};

        server.on("error", (error) => {
        logger.error({ message: error.message }, "YouTube OAuth callback server error")});

        const authorizationUrl = buildYouTubeAuthorizationUrl(oauthClient, state);

        logger.info({ expiresAt: new Date(expiresAt).toISOString() }, "YouTube OAuth authorization started");

        return { authorizationUrl, expiresAt: new Date(expiresAt).toISOString(),
        instructions: [
            "Open the authorization URL in your browser.",
            "Choose the exact YouTube channel that UpCont should upload to.",
            "Approve the requested upload and read-only permissions.",
            "Wait for the local success page, then call youtube_oauth_status.",
        ]};
    }

    private async handleCallback(request: IncomingMessage, response: ServerResponse, expectedState: string, oauthClient: OAuth2Client): Promise<void> {
        const redirect = new URL(this.config.redirectUri);
        const requestUrl = new URL(request.url ?? "/", redirect.origin);

        if (requestUrl.pathname !== redirect.pathname){
            response.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
            response.end("Not found.");
            return;
        }

        const returnedState = requestUrl.searchParams.get("state");

        if(!returnedState || !safeEqual(returnedState, expectedState)){
            response.writeHead(400, {"Content-Type": "text/plain; charset=utf-8"});
            response.end("OAuth state validation failed. Return to the MCP client and start again.");
            return;
        }

        const oauthError = requestUrl.searchParams.get("error");

        if (oauthError) {
        this.lastError = "Google authorization was denied or cancelled.";

        response.writeHead(400, {"Content-Type": "text/plain; charset=utf-8"});
        response.end(
            "Authorization was not completed. You can close this tab.",
        );

        this.closePendingAuthorization();
        return;
        }

        const code = requestUrl.searchParams.get("code");

        if (!code) {
        response.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Authorization code is missing.");
        return;
        }

        try {
            const { tokens } = await oauthClient.getToken(code);
            
            const grantedScopes = (tokens.scope ?? "").split(" ");
            const missingScopes = YOUTUBE_OAUTH_SCOPES.filter((scope) => !grantedScopes.includes(scope));

            if (missingScopes.length > 0) {
                this.lastError = "Required YouTube permissions were not granted. Tick every permission on the Google consent screen and reconnect.";

                response.writeHead(400, {"Content-Type": "text/plain; charset=utf-8"});
                response.end("Required permissions were not granted. Return to your MCP client and try again.");
                return;
            }

            
            const existing = await this.tokenStore.load();

            const merged: Credentials = {...(existing ?? {}), ...tokens};

            const refreshToken = tokens.refresh_token ?? existing?.refresh_token;

            if(refreshToken !== undefined){
                merged.refresh_token = refreshToken;
            }

            await this.tokenStore.save(merged);
            this.lastError = undefined;

            response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});

            response.end(`
                <!doctype html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <title>UpCont YouTube authorization</title>
                </head>
                <body>
                    <main>
                    <h1>YouTube connected</h1>
                    <p>You can close this tab and return to your MCP client.</p>
                    </main>
                </body>
                </html>
            `);

            logger.info("YouTube OAuth authorization completed");
        } catch {
            this.lastError = "Google authorization code exchange failed.";

            response.writeHead(500, {"Content-Type": "text/plain; charset=utf-8"});

            response.end("Authorization failed. Return to the MCP client and try again.");
        } finally {
            this.closePendingAuthorization();
        }
    }

    private closePendingAuthorization(): void {
        const pending = this.pending;

        if (!pending) {
        return;
        }

        clearTimeout(pending.timeout);
        this.pending = undefined;

        if (pending.server.listening) {
            pending.server.close();
        }
    }

    async getAuthorizedClient(): Promise<OAuth2Client> {
        this.assertConfigured();

        const credentials = await this.tokenStore.load();

        if (!credentials?.refresh_token) {
            throw new Error("YouTube is not connected. Complete OAuth authorization first.");
        }

        const client = this.createOAuthClient();
        client.setCredentials(credentials);

        client.on("tokens", (tokens) => {
        void this.tokenStore.mergeAndSave(tokens).catch((error: unknown) => {
            logger.error({message: error instanceof Error ? error.message : "Unknown token persistence error"}, "Failed to persist refreshed YouTube credentials")});
        });

        return client;
    }

    async getStatus(): Promise<YouTubeOAuthStatus> {
        if (!this.isConfigured()) {
            return {state: "unconfigured", details: "YouTube OAuth client ID or client secret is missing."};
        }

        if (this.pending) {
            return {state: "authorizing", details: "Waiting for the browser authorization callback.", expiresAt: new Date(this.pending.expiresAt).toISOString()};
        }

        if (this.lastError) {
            return {state: "error", details: this.lastError};
        }

        const stored = await this.tokenStore.load();

        if (!stored?.refresh_token) {
            return {state: "disconnected", details: "No stored YouTube authorization was found."};
        }

        try {
            const client = await this.getAuthorizedClient();
            await client.getAccessToken();

            return { state: "authorized", details: "Stored YouTube authorization is valid."};
        } catch {
            return {state: "error", details: "Stored YouTube authorization is expired, revoked, or invalid. Reconnect YouTube."};
        }
    }

    async disconnect(revokeRemote: boolean): Promise<{ disconnected: true; remoteRevoked: boolean }> {
        const credentials = await this.tokenStore.load();

        if (!credentials) {
            return {disconnected: true, remoteRevoked: false};
        }

        let remoteRevoked = false;

        if (revokeRemote) {
            const token = credentials.refresh_token ?? credentials.access_token;

            if (!token) {
                throw new Error("No token is available for remote revocation.");
            }

            const client = this.createOAuthClient();
            await client.revokeToken(token);
            remoteRevoked = true;
        }

        await this.tokenStore.clear();
        this.lastError = undefined;

        return { disconnected: true, remoteRevoked};
    }

    dispose(): void {
        this.closePendingAuthorization();
    }
}
