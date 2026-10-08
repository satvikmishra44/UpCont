import type { ConnectionStatus, PlatformName, PlatformPublishResult, PublishRequest, PublishRequestValidation, PublishTarget } from "../types.js"

export interface PlatformPublisher{
  readonly platform: PlatformName;

  getConnectionStatus() : Promise<ConnectionStatus>;

  listTargets() : Promise<PublishTarget[]>;

  validatePublishRequest(request: PublishRequest) : Promise<PublishRequestValidation>;

  publish(request: PublishRequest, dryRun: boolean) : Promise<PlatformPublishResult>;
}