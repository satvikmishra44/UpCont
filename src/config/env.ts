import "dotenv/config";
import path from "node:path";

export interface AppConfig {
  nodeEnv: string;
  logLevel: string;
  mockMode: boolean;
  videoUploadRoot: string;
  maxVideoSizeMb: number;
  youtube: {
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    redirectUri?: string | undefined;
  };
  meta: {
    appId?: string | undefined;
    appSecret?: string | undefined;
    redirectUri?: string | undefined;
    facebookPageId?: string | undefined;
    instagramAccountId?: string | undefined;
  };
}

function readOptional(name: string, missing: string[]): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    missing.push(name);
    return undefined;
  }
  return value;
}

export function loadConfig(): { config: AppConfig } {
  const missingYoutubeVars: string[] = [];
  const missingMetaVars: string[] = [];

  const rawVideoRoot = process.env.VIDEO_UPLOAD_ROOT;
  if (!rawVideoRoot || rawVideoRoot.trim() === "") {
    throw new Error("VIDEO_UPLOAD_ROOT is not set. Check your .env file.");
  }

  const config: AppConfig = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    logLevel: process.env.LOG_LEVEL ?? "info",
    mockMode: (process.env.MOCK_MODE ?? "true").toLowerCase() !== "false",
    videoUploadRoot: path.resolve(rawVideoRoot),
    maxVideoSizeMb: Number(process.env.MAX_VIDEO_SIZE_MB ?? "500"),
    youtube: {
      clientId: readOptional("YOUTUBE_CLIENT_ID", missingYoutubeVars),
      clientSecret: readOptional("YOUTUBE_CLIENT_SECRET", missingYoutubeVars),
      redirectUri: readOptional("YOUTUBE_OAUTH_REDIRECT_URI", missingYoutubeVars),
    },
    meta: {
      appId: readOptional("META_APP_ID", missingMetaVars),
      appSecret: readOptional("META_APP_SECRET", missingMetaVars),
      redirectUri: readOptional("META_OAUTH_REDIRECT_URI", missingMetaVars),
      facebookPageId: process.env.FACEBOOK_PAGE_ID,
      instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID,
    },
  };

  return { config };
}