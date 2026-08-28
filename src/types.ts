export type PlatformName = "youtube" | "facebook" | "instagram";

export type ConnectionState =
  | "configured"
  | "not_configured"
  | "authorized"
  | "expired"
  | "error";

export interface PlatformValidationResult {
  platform: PlatformName;
  ok: boolean;
  warnings: string[];
}

export interface SafeVideoReference {
  fileName: string;
  absolutePath: string;
  sizeBytes: number;
  mimeType: string | null;
}

export interface ValidateVideoResult {
  video: SafeVideoReference;
  perPlatform: PlatformValidationResult[];
}

export interface ConnectionStatus {
  platform: PlatformName;
  state: ConnectionState;
  account?: { displayName: string; id: string };
  missingConfig: string[];
  nextStep: string;
}

export interface PublishTarget {
  platform: PlatformName;
  id: string;
  displayName: string;
}

export interface PublishRequest {
  video: SafeVideoReference;
  title: string;
  description: string;
  privacyStatus?: "private" | "unlisted" | "public" | undefined;
  targetId?: string | undefined;
}

export type PublishOutcomeStatus = "success" | "failed" | "dry_run";

export interface PlatformPublishResult {
  platform: PlatformName;
  status: PublishOutcomeStatus;
  remoteId?: string;
  url?: string;
  errorCategory?: string;
  errorMessage?: string;
}

export interface PublishVideoResult {
  overallStatus: "success" | "partial_success" | "failed" | "dry_run";
  results: PlatformPublishResult[];
}