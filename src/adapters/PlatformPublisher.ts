import type { ConnectionStatus, PlatformName, PlatformPublishResult, PublishRequest, PublishTarget } from "../types.js";

export interface PublishValidation {
  ok: boolean;
  reasons: string[];
}

export interface PlatformPublisher {
  readonly platform: PlatformName;
  getConnectionStatus(): Promise<ConnectionStatus>;
  listTargets(): Promise<PublishTarget[]>;
  validatePublishRequest(request: PublishRequest): Promise<PublishValidation>;
  publish(request: PublishRequest, dryRun: boolean): Promise<PlatformPublishResult>;
}