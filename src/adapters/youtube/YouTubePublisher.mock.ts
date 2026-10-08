import type { PlatformPublisher } from "../PlatformPublisher.js";
import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishRequestValidation, PublishTarget } from "../../types.js";

export interface MockBehaviorOptions {
  simulateFailure?: boolean;
}

export class YouTubePublisherMock implements PlatformPublisher {
  readonly platform = "youtube" as const;

  constructor(private readonly behavior: MockBehaviorOptions = {}) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { platform: "youtube", state: "authorized", displayName: "Mock YouTube Channel", details: "Mock mode is active." };
  }

  async listTargets(): Promise<PublishTarget[]> {
    return [{ platform: "youtube", id: "mock-channel-id", displayName: "Mock YouTube Channel", targetType: "channel" }];
  }

  async validatePublishRequest(request: PublishRequest): Promise<PublishRequestValidation> {
    const reasons: string[] = [];
    if (!request.title.trim()) reasons.push("Title is required.");
    return { ok: reasons.length === 0, reasons, warnings: [] };
  }

  async publish(_request: PublishRequest, dryRun: boolean): Promise<PlatformPublishResult> {

    if(dryRun){
      return {platform: this.platform, status: "dry_run", message: "Mock request validated. Nothing was uploaded"}
    }

    if (this.behavior.simulateFailure) {
      return { platform: this.platform, status: "failed", errorCategory: "simulated_failure", errorMessage: "Configured to fail for testing." };
    }

    return { platform: this.platform, status: "success", externalId: "mock-video-id", externalUrl: "https://youtube.com/watch?v=mock-video-id" };
  }
}