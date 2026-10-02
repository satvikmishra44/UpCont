// import "dotenv/config";
// import path from "node:path";

// export interface AppConfig {
//   nodeEnv: string;
//   logLevel: string;
//   mockMode: boolean;
//   videoUploadRoot: string;
//   maxVideoSizeMb: number;
//   youtube: {
//     clientId?: string | undefined;
//     clientSecret?: string | undefined;
//     redirectUri?: string | undefined;
//   };
//   meta: {
//     appId?: string | undefined;
//     appSecret?: string | undefined;
//     redirectUri?: string | undefined;
//     facebookPageId?: string | undefined;
//     instagramAccountId?: string | undefined;
//   };
// }

// function readOptional(name: string, missing: string[]): string | undefined {
//   const value = process.env[name];
//   if (!value || value.trim() === "") {
//     missing.push(name);
//     return undefined;
//   }
//   return value;
// }

// export function loadConfig(): { config: AppConfig } {
//   const missingYoutubeVars: string[] = [];
//   const missingMetaVars: string[] = [];

//   const rawVideoRoot = process.env.VIDEO_UPLOAD_ROOT;
//   if (!rawVideoRoot || rawVideoRoot.trim() === "") {
//     throw new Error("VIDEO_UPLOAD_ROOT is not set. Check your .env file.");
//   }

//   const config: AppConfig = {
//     nodeEnv: process.env.NODE_ENV ?? "development",
//     logLevel: process.env.LOG_LEVEL ?? "info",
//     mockMode: (process.env.MOCK_MODE ?? "true").toLowerCase() !== "false",
//     videoUploadRoot: path.resolve(rawVideoRoot),
//     maxVideoSizeMb: Number(process.env.MAX_VIDEO_SIZE_MB ?? "500"),
//     youtube: {
//       clientId: readOptional("YOUTUBE_CLIENT_ID", missingYoutubeVars),
//       clientSecret: readOptional("YOUTUBE_CLIENT_SECRET", missingYoutubeVars),
//       redirectUri: readOptional("YOUTUBE_OAUTH_REDIRECT_URI", missingYoutubeVars),
//     },
//     meta: {
//       appId: readOptional("META_APP_ID", missingMetaVars),
//       appSecret: readOptional("META_APP_SECRET", missingMetaVars),
//       redirectUri: readOptional("META_OAUTH_REDIRECT_URI", missingMetaVars),
//       facebookPageId: process.env.FACEBOOK_PAGE_ID,
//       instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID,
//     },
//   };

//   return { config };
// }

import "dotenv/config";

import path from "node:path";
import * as z from "zod/v4";

const EnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

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

  YOUTUBE_REDIRECT_URI: z
    .string()
    .url()
    .default("http://127.0.0.1:53682/oauth2/callback"),

  YOUTUBE_TOKEN_PATH: z
    .string()
    .min(1)
    .default(".data/youtube-token.json"),
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
  logLevel:
    | "fatal"
    | "error"
    | "warn"
    | "info"
    | "debug"
    | "trace"
    | "silent";
  mockMode: boolean;
  videoUploadRoot: string;
  maxVideoSizeMb: number;
  youtube: YouTubeConfig;
}

export function loadConfig(): AppConfig {
  const parsed = EnvironmentSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = z.prettifyError(parsed.error);
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = parsed.data;

  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    mockMode: env.MOCK_MODE,
    videoUploadRoot: path.resolve(env.VIDEO_UPLOAD_ROOT),
    maxVideoSizeMb: env.MAX_VIDEO_SIZE_MB,
    youtube: {
      mode: env.YOUTUBE_MODE,
      clientId: env.YOUTUBE_CLIENT_ID,
      clientSecret: env.YOUTUBE_CLIENT_SECRET,
      redirectUri: env.YOUTUBE_REDIRECT_URI,
      tokenPath: path.resolve(env.YOUTUBE_TOKEN_PATH),
    },
  };
}