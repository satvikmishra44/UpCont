import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod/v4";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env"), quiet: true });

function resolveFromRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
}

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  MOCK_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  VIDEO_UPLOAD_ROOT: z.string().min(1),

  MAX_VIDEO_SIZE_MB: z.coerce.number().positive().default(500),

  YOUTUBE_MODE: z.enum(["mock", "real"]).default("mock"),

  YOUTUBE_CLIENT_ID: z.string().optional(),

  YOUTUBE_CLIENT_SECRET: z.string().optional(),

  YOUTUBE_REDIRECT_URI: z.httpUrl().default("http://127.0.0.1:53682/oauth2/callback"),

  YOUTUBE_TOKEN_PATH: z.string().min(1).default(".data/youtube-token.json"),
});

export interface YouTubeConfig {
  mode: "mock" | "real";
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  redirectUri: string;
  tokenPath: string;
}

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  mockMode: boolean;
  videoUploadRoot: string;
  maxVideoSizeMb: number;
  youtube: YouTubeConfig;
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
  };
}