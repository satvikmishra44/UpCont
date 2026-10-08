export const PLATFORM_NAMES = [
  "youtube",
  "facebook",
  "instagram",
] as const;

export type PlatformName = (typeof PLATFORM_NAMES)[number];

export type PrivacyStatus = "private" | "unlisted" | "public";

export type ConnectionState =
  | "unconfigured"
  | "disconnected"
  | "authorizing"
  | "authorized"
  | "error";

export interface ConnectionStatus {
  platform: PlatformName;
  state: ConnectionState;
  displayName?: string;
  details?: string;
}

export interface PublishTarget {
  platform: PlatformName;
  id: string;
  displayName: string;
  targetType: "channel" | "page" | "account";
}

export interface ValidatedVideo {
  fileName: string;
  absolutePath: string;
  sizeBytes: number;
  mimeType: string;
}

export interface PlatformVideoValidation {
  platform: PlatformName;
  ok: boolean;
  warnings: string[];
  errors: string[];
}

export interface ValidateVideoResult {
  ok: boolean;
  video: ValidatedVideo;
  perPlatform: PlatformVideoValidation[];
}

export interface PublishRequest {
  video: ValidatedVideo;
  title: string;
  description: string;
  privacyStatus: PrivacyStatus;
  targetId?: string | undefined;
  tags: string[];
  categoryId: string;
  madeForKids: boolean;
  notifySubscribers: boolean;
}

export interface PublishRequestValidation {
  ok: boolean;
  reasons: string[];
  warnings: string[];
}

export type PlatformPublishStatus = "dry_run" | "success" | "failed";

export interface PlatformPublishResult {
  platform: PlatformName;
  status: PlatformPublishStatus;
  externalId?: string;
  externalUrl?: string;
  errorCategory?: string;
  errorMessage?: string;
  message?: string;
}

export interface PublishVideoResult {
  overallStatus: "dry_run" | "success" | "partial_success" | "failed";
  results: PlatformPublishResult[];
}