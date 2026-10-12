import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod/v4";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const OptionalNonEmptyString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

dotenv.config({ path: path.join(PROJECT_ROOT, ".env"), quiet: true });

function resolveFromRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
}

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  MOCK_MODE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),

  VIDEO_UPLOAD_ROOT: z.string().min(1),

  MAX_VIDEO_SIZE_MB: z.coerce.number().positive().default(500),

  YOUTUBE_MODE: z.enum(["mock", "real"]).default("mock"),

  YOUTUBE_CLIENT_ID: OptionalNonEmptyString,

  YOUTUBE_CLIENT_SECRET: OptionalNonEmptyString,

  YOUTUBE_REDIRECT_URI: z.url({protocol: /^http$/}).default("http://127.0.0.1:53682/oauth2/callback"),

  YOUTUBE_TOKEN_PATH: z.string().min(1).default(".data/youtube-token.json"),

  FACEBOOK_MODE: z.enum(["mock", "real"]).default("mock"),
  INSTAGRAM_MODE: z.enum(["mock", "real"]).default("mock"),

  META_APP_ID: OptionalNonEmptyString,
  META_APP_SECRET: OptionalNonEmptyString,
  META_LOGIN_CONFIG_ID: OptionalNonEmptyString,

  META_REDIRECT_URI: z.url({protocol: /^http$/}).default("http://127.0.0.1:53682/oauth2/callback"),
  META_GRAPH_VERSION: z.string().min(1).default("v26.0"),
  META_TOKEN_PATH: z.string().min(1).default(".data/meta-token.json"),

  META_INSTAGRAM_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),

  META_INSTAGRAM_PROCESSING_TIMEOUT_MS: z.coerce.number().int().min(30_000).default(300_000),

});

export type PlatformMode = "mock" | "real"

export interface YouTubeConfig {
  mode: PlatformMode;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  redirectUri: string;
  tokenPath: string;
}

export interface MetaConfig {
  appId?: string | undefined;
  appSecret?: string | undefined;
  loginConfigId?: string | undefined;
  redirectUri: string;
  graphVersion: string;
  tokenPath: string;
  instagramPollIntervalMs: number;
  instagramProcessingTimeoutMs: number;
}

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  mockMode: boolean;
  videoUploadRoot: string;
  maxVideoSizeMb: number;
  youtube: YouTubeConfig;
  facebookMode: PlatformMode;
  instagramMode: PlatformMode;
  meta: MetaConfig;
}

export function loadConfig(): AppConfig {
  const parsed = EnvironmentSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }

  const env = parsed.data;

  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    mockMode: env.MOCK_MODE,
    videoUploadRoot: resolveFromRoot(env.VIDEO_UPLOAD_ROOT),
    maxVideoSizeMb: env.MAX_VIDEO_SIZE_MB,
    youtube: {
      mode: env.YOUTUBE_MODE,
      clientId: env.YOUTUBE_CLIENT_ID,
      clientSecret: env.YOUTUBE_CLIENT_SECRET,
      redirectUri: env.YOUTUBE_REDIRECT_URI,
      tokenPath: resolveFromRoot(env.YOUTUBE_TOKEN_PATH),
    },

    facebookMode: env.FACEBOOK_MODE,
    instagramMode: env.INSTAGRAM_MODE,

    meta: {
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      loginConfigId: env.META_LOGIN_CONFIG_ID,
      redirectUri: env.META_REDIRECT_URI,
      graphVersion: env.META_GRAPH_VERSION,
      tokenPath: path.resolve(env.META_TOKEN_PATH),
      instagramPollIntervalMs: env.META_INSTAGRAM_POLL_INTERVAL_MS,
      instagramProcessingTimeoutMs: env.META_INSTAGRAM_PROCESSING_TIMEOUT_MS 
    }
  };
}