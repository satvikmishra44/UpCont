import {randomBytes, timingSafeEqual} from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse} from "node:http";

import type { MetaConfig } from "../config/env.js";
import { logger } from "../logger.js";
import type { MetaGraphPort } from "./MetaGraphClient.js";
import { MetaTokenStore, type StoredMetaAuthorization } from "./MetaTokenStore.js";

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
  expiresAt?: string;
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

export function buildMetaAuthorizedUrl(config: Pick<MetaConfig  | "appId" | "redirectUri" | "graphVersion" | "loginConfigId">, state: string) : string{
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
    private pending?: PendingAuthorization;
    private lastError?: string;

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

    private validateRediirectUri(): void{
        const redirect = new URL(this.config.redirectUri);

        if(redirect.protocol !== "http:"){
            throw new Error("Local Meta OAuth redirect URI must use http://.");
        }

        if(!isLoopbackHost(redirect.hostname)){
            throw new Error("Meta OAuth callback must use a loopback hostname")
        }

        if (!redirect.port) {
          throw new Error("Meta OAuth callback requires an explicit local port.")
        }
    }

    async startAuthorization(): Promise<MetaAuthorizationStart>{
        this.assertConfigured();
        
        if (this.pending) {
      throw new Error(
        "A Meta authorization is already in progress.",
      );
    }

    const redirect = new URL(this.config.redirectUri);
    const state = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + AUTHORIZATION_TIMEOUT_MS;

    const server = createServer((request, response) => {
            void this.handleCallback(request, response, state);
        }
    );
}