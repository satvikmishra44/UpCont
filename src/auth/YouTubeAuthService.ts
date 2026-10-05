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
    private pending?: PendingAuthorization;
    private lastError?: string;

    constructor(private readonly config: YouTubeConfig){
        this.tokenStore = new YouTubeTokenStore(config.tokenPath);
        this.validateRedirectUri();
    }

    private isConfigured(): boolean {
        return Boolean(this.config.clientId && this.config.clientSecret);
    }

    private assertConfgured(): void {
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
}