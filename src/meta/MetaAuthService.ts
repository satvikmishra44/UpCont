import {randomBytes, timingSafeEqual} from "node:crypto";
import { type IncomingMessage, type ServerResponse} from "node:http";
import { createServer, type Server } from "node:https";

import type { MetaConfig } from "../config/env.js";
import { logger } from "../logger.js";
import type { MetaGraphPort } from "./MetaGraphClient.js";
import { MetaTokenStore, type StoredMetaAuthorization } from "./MetaTokenStore.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const META_PERMISSIONS = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "publish_video",
    "instagram_basic",
    "instagram_content_publish",
    "business_management",
] as const;

const AUTHORIZATION_TIMEOUT_MS = 10 * 60 * 1000;

interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface MetaProfileResponse {
  id: string;
  name?: string;
}

interface PendingAuthorization {
  state: string;
  expiresAt: number;
  server: Server;
  timeout: NodeJS.Timeout;
}

export interface MetaAuthorizationStart {
  authorizationUrl: string;
  expiresAt: string;
  instructions: string[];
}

export interface MetaAuthorizationStatus {
  state: "unconfigured" | "disconnected" | "authorizing" | "authorized" | "error";
  details: string;
  expiresAt?: string | undefined;
}

export interface MetaAuthPort {
    getStatus(): Promise<MetaAuthorizationStatus>;
    getUserAccessToken(): Promise<string>;
}

function safeEqual(left: string, right: string): boolean{
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

export function buildMetaAuthorizationUrl(config: Pick<MetaConfig, "appId" | "redirectUri" | "graphVersion" | "loginConfigId">, state: string) : string{
    if(!config.appId){
        throw new Error("META_APP_ID is missing");
    }

    const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);

    url.searchParams.set("client_id", config.appId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    if (config.loginConfigId) {
        url.searchParams.set("config_id", config.loginConfigId);
    } else {
        url.searchParams.set("scope", META_PERMISSIONS.join(","));
    }

    return url.toString();
}

export class MetaAuthService implements MetaAuthPort{
    private readonly tokenStore: MetaTokenStore;
    private pending?: PendingAuthorization | undefined;
    private lastError?: string | undefined;

    constructor(private readonly config: MetaConfig, private readonly graph: MetaGraphPort){
        this.tokenStore = new MetaTokenStore(config.tokenPath);
        this.validateRedirectUri();
    }

    private isConfigured(): boolean{
        return Boolean(this.config.appId && this.config.appSecret);
    }

    private assertConfigured(): void{
        if(!this.isConfigured){
            throw new Error("Meta OAuth is not configured. Set the environment variables.")
        }
    }

    private validateRedirectUri(): void{
        const redirect = new URL(this.config.redirectUri);

        if(redirect.protocol !== "https:"){
            throw new Error("Meta OAuth callback must use HTTPS.");
        }

        if(!isLoopbackHost(redirect.hostname)){
            throw new Error("Meta OAuth callback must use a loopback hostname")
        }

        if (!redirect.port) {
          throw new Error("Meta OAuth callback requires an explicit local port.")
        }

        if(redirect.username || redirect.password || redirect.search || redirect.hash){
            throw new Error("Meta OAuth callback must not contain credentials, query parameters or fragment")
        }
    }

    async startAuthorization(): Promise<MetaAuthorizationStart>{
        this.assertConfigured();
        
        if (this.pending) {
          throw new Error("A Meta authorization is already in progress.");
        }

    const redirect = new URL(this.config.redirectUri);
    const state = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + AUTHORIZATION_TIMEOUT_MS;

    const certDict = path.join(path.dirname(this.config.tokenPath), "certs");

    const [key, cert] = await Promise.all([readFile(path.join(certDict, "localhost-key.pem")), readFile(path.join(certDict, "localhost.pem"))])

    const server = createServer({key, cert, minVersion: "TLSv1.2"}, (request, response) => {
            void this.handleCallback(request, response, state);
        }
    );

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

        server.listen(Number(redirect.port), "127.0.0.1"); 
    })

    const timeout = setTimeout(() => {
      this.lastError = "Meta authorization timed out.";
      this.closePendingAuthorization();
    }, AUTHORIZATION_TIMEOUT_MS);

    timeout.unref();

    this.pending = {state, expiresAt, server, timeout};

    const authorizationUrl = buildMetaAuthorizationUrl(this.config, state);

    logger.info({expiresAt: new Date(expiresAt).toISOString()}, "Meta authorization started");

    return {authorizationUrl, expiresAt: new Date(expiresAt).toISOString(), instructions: [
        "Open the authorization URL in your browser.",
        "Use the Meta account that manages the required Facebook Page.",
        "Select the Facebook Page and linked Instagram Professional account.",
        "Approve the configured permissions.",
        "Return to the MCP client and call meta_oauth_status.",
      ]};
    }

    private async handleCallback(request: IncomingMessage, response: ServerResponse, expectedState: string): Promise<void>{
        const redirect = new URL(this.config.redirectUri);
        const requestUrl = new URL(request.url ?? "/", redirect.origin);

        if(requestUrl.pathname !== redirect.pathname){
            response.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
            response.end("Not found.");
            return ;
        }

        const returnedState = requestUrl.searchParams.get("state");

        if (!returnedState || !safeEqual(returnedState, expectedState)) {
            response.writeHead(400, {
                "Content-Type":
                "text/plain; charset=utf-8",
            });

            response.end("OAuth state validation failed. Return to the MCP client and start again.");

            return;
        }

        const oauthError = requestUrl.searchParams.get("error");

        if(oauthError){
            this.lastError = "Meta authorization was denied or cancelled.";
            response.writeHead(400, {
                "Content-Type":
                "text/plain; charset=utf-8",
            });

            response.end("Meta authorization was not completed. You can close this tab.");

            this.closePendingAuthorization();
            return;
        }

        const code = requestUrl.searchParams.get("code");

        if (!code) {
            response.writeHead(400, {
                "Content-Type":
                "text/plain; charset=utf-8",
            });
            response.end("Authorization code is missing.");
            return;
        }

        try{
            const shortLived = await this.exchangeCode(code);
            const longLived =
            await this.exchangeForLongLivedToken(shortLived.access_token);

            const now = new Date();
            const expiresAt = longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000).toISOString() : undefined;

            const stored: StoredMetaAuthorization = {
                version: 1,
                issuedAt: now.toISOString(),
                updatedAt: now.toISOString(),
                expiresAt,
                userAccessToken:
                longLived.access_token,
                tokenType:
                longLived.token_type,
                scopes: [...META_PERMISSIONS],
            };

            await this.tokenStore.save(stored);
            this.lastError = undefined;

            response.writeHead(200, {
                "Content-Type":
                "text/html; charset=utf-8",
            });

            response.end(`
                <!doctype html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <title>UpCont Meta authorization</title>
                </head>
                <body>
                    <main>
                    <h1>Facebook and Instagram connected</h1>
                    <p>You can close this tab and return to your MCP client.</p>
                    </main>
                </body>
                </html>
            `);

            logger.info("Meta authorization completed");
        } catch (error) {
            this.lastError = error instanceof Error ? error.message : "Meta authorization failed.";

            response.writeHead(500, {
                "Content-Type":
                "text/plain; charset=utf-8",
            });

            response.end("Meta authorization failed. Return to the MCP client and try again.");
        } finally {
            this.closePendingAuthorization();
        }
    }

    private async exchangeCode(code: string): Promise<MetaTokenResponse> {
        this.assertConfigured();

        const url = new URL(`https://graph.facebook.com/${this.config.graphVersion}/oauth/access_token`);

        url.searchParams.set("client_id", this.config.appId!);
        url.searchParams.set("client_secret", this.config.appSecret!);
        url.searchParams.set("redirect_uri", this.config.redirectUri);
        url.searchParams.set("code", code);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Meta authorization-code exchange failed.");
        }

        const token = (await response.json()) as MetaTokenResponse;

        if (!token.access_token) {
            throw new Error("Meta did not return an access token.");
        }

        return token;
    }

    private async exchangeForLongLivedToken(token: string): Promise<MetaTokenResponse> {
        this.assertConfigured();

        const url = new URL(`https://graph.facebook.com/${this.config.graphVersion}/oauth/access_token`);

        url.searchParams.set("grant_type", "fb_exchange_token");
        url.searchParams.set("client_id", this.config.appId!);
        url.searchParams.set("client_secret", this.config.appSecret!);
        url.searchParams.set("fb_exchange_token", token);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Meta long-lived-token exchange failed.");
        }

        const exchanged = (await response.json()) as MetaTokenResponse;

        if (!exchanged.access_token) {
            throw new Error("Meta did not return a long-lived access token.");
        }

        return exchanged;
    }

    async getUserAccessToken(): Promise<string> {
        this.assertConfigured();

        const stored = await this.tokenStore.load();

        if (!stored) {
            throw new Error("Meta is not connected. Complete Meta OAuth first.",);
        }

        if (stored.expiresAt && Date.parse(stored.expiresAt) <= Date.now()) {
            throw new Error("Stored Meta authorization has expired. Reconnect Meta.");
        }

        return stored.userAccessToken;
    }

    async getStatus(): Promise<MetaAuthorizationStatus> {
        if (!this.isConfigured()) {
            return {
                state: "unconfigured",
                details: "Meta App ID or App Secret is missing.",
            };
        }

        if (this.pending) {
            return {
                state: "authorizing",
                details: "Waiting for the browser callback.",
                expiresAt: new Date(this.pending.expiresAt).toISOString(),
            };
        }

        if (this.lastError) {
            return {
                state: "error",
                details: this.lastError,
            };
        }

        const stored = await this.tokenStore.load();

        if (!stored) {
            return {
                state: "disconnected",
                details: "No stored Meta authorization was found.",
            };
        }

        if (stored.expiresAt && Date.parse(stored.expiresAt) <= Date.now()) {
            return {
                state: "error",
                details: "Stored Meta authorization has expired. Reconnect Meta.",
                expiresAt: stored.expiresAt,
            };
        }

        try {
            const profile = await this.graph.get<MetaProfileResponse>("/me", stored.userAccessToken, {fields: "id,name"});

            return {
                state: "authorized",
                details: profile.name ? `Authorized as ${profile.name}.` : "Stored Meta authorization is valid.",
                expiresAt: stored.expiresAt,
            };
        } catch {
            return {
                state: "error",
                details: "Stored Meta authorization is invalid or revoked. Reconnect Meta.",
                expiresAt: stored.expiresAt,
            };
        }
    }

    async refreshAuthorization(): Promise<{refreshed: true; expiresAt?: string;}> {
        const existing = await this.tokenStore.load();

        if (!existing) {
            throw new Error("Meta is not connected.");
        }

        const refreshed = await this.exchangeForLongLivedToken(existing.userAccessToken);

        const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : undefined;

        await this.tokenStore.save({
            ...existing,
            updatedAt: new Date().toISOString(), 
            expiresAt,
            userAccessToken: refreshed.access_token,
            tokenType: refreshed.token_type ?? existing.tokenType
        });

        return expiresAt ? {refreshed: true, expiresAt} : {refreshed: true};
    }

    async disconnect(revokeRemote: boolean): Promise<{disconnected: true; remoteRevoked: boolean;}> {
        const stored = await this.tokenStore.load();

        if (!stored) {
            return {disconnected: true, remoteRevoked: false};
        }

        let remoteRevoked = false;

        if (revokeRemote) {
            await this.graph.deleteForm("/me/permissions", stored.userAccessToken);

            remoteRevoked = true;
        }

        await this.tokenStore.clear();
        this.lastError = undefined;

        return {disconnected: true, remoteRevoked};
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

    dispose(): void {
        this.closePendingAuthorization();
    }
}