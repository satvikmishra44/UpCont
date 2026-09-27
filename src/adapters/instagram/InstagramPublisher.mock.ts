import type { PlatformPublisher, PublishValidation } from "../PlatformPublisher.js";
import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishTarget } from "../../types.js";
import type { MockBehaviorOptions } from "../youtube/YouTubePublisher.mock.js";

export class InstagramPublisherMock implements PlatformPublisher {
  readonly platform = "instagram" as const;
  constructor(private readonly behavior: MockBehaviorOptions = {}) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { platform: "instagram", state: "authorized", account: { displayName: "Mock IG Professional", id: "mock-ig-id" }, missingConfig: [], nextStep: "Mock mode is active." };
  }
  async listTargets(): Promise<PublishTarget[]> {
    return [{ platform: "instagram", id: "mock-ig-id", displayName: "Mock IG Professional" }];
  }
  async validatePublishRequest(request: PublishRequest): Promise<PublishValidation> {
    const reasons: string[] = [];
    if (!request.targetId) reasons.push("Instagram account target ID is required.");
    return { ok: reasons.length === 0, reasons };
  }
  async publish(request: PublishRequest, dryRun: boolean): Promise<PlatformPublishResult> {
    if (dryRun) return { platform: "instagram", status: "dry_run" };
    if (this.behavior.simulateFailure) {
      return { platform: "instagram", status: "failed", errorCategory: "simulated_failure", errorMessage: "Configured to fail." };
    }
    return { platform: "instagram", status: "success", remoteId: "mock-ig-id", url: "https://instagram.com/reel/mock-ig-id" };
  }
}