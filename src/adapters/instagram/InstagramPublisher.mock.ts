import type { PlatformPublisher } from "../PlatformPublisher.js";
import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishRequestValidation, PublishTarget } from "../../types.js";
import type { MockBehaviorOptions } from "../youtube/YouTubePublisher.mock.js";

export class InstagramPublisherMock implements PlatformPublisher {
  readonly platform = "instagram" as const;

  constructor(private readonly behavior: MockBehaviorOptions = {}) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { platform: "instagram", state: "authorized", displayName: "Mock IG Professional", details: "Mock mode is active." };
  }

  async listTargets(): Promise<PublishTarget[]> {
    return [{ platform: "instagram", id: "mock-ig-id", displayName: "Mock IG Professional", targetType: "account" }];
  }

  async validatePublishRequest(request: PublishRequest): Promise<PublishRequestValidation> {
    const reasons: string[] = [];
    if (!request.title.trim()) reasons.push("Title is required.");
    if (!request.targetId) reasons.push("Instagram account target ID is required.");
    return { ok: reasons.length === 0, reasons, warnings: [] };
  }

  async publish(_request: PublishRequest, dryRun: boolean): Promise<PlatformPublishResult> {
    if(dryRun){
      return {platform: this.platform, status: "dry_run", message: "Mock request validated, Nothing was posted."}
    }
    
    if (this.behavior.simulateFailure) {
      return { platform: this.platform, status: "failed", errorCategory: "simulated_failure", errorMessage: "Configured to fail." };
    }

    return { platform: this.platform, status: "success", externalId: "mock-ig-id", externalUrl: "https://instagram.com/reel/mock-ig-id" };
  }
}