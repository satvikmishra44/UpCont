import type { PlatformPublisher, PublishValidation } from "../PlatformPublisher.js";
import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishTarget } from "../../types.js";
import type { MockBehaviorOptions } from "../youtube/YouTubePublisher.mock.js";

export class FacebookPagePublisherMock implements PlatformPublisher {
  readonly platform = "facebook" as const;
  constructor(private readonly behavior: MockBehaviorOptions = {}) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { platform: "facebook", state: "authorized", account: { displayName: "Mock Facebook Page", id: "mock-page-id" }, missingConfig: [], nextStep: "Mock mode is active." };
  }
  async listTargets(): Promise<PublishTarget[]> {
    return [{ platform: "facebook", id: "mock-page-id", displayName: "Mock Facebook Page" }];
  }
  async validatePublishRequest(request: PublishRequest): Promise<PublishValidation> {
    const reasons: string[] = [];
    if (!request.targetId) reasons.push("Facebook Page target ID is required.");
    return { ok: reasons.length === 0, reasons };
  }
  async publish(request: PublishRequest, dryRun: boolean): Promise<PlatformPublishResult> {
    if (dryRun) return { platform: "facebook", status: "dry_run" };
    if (this.behavior.simulateFailure) {
      return { platform: "facebook", status: "failed", errorCategory: "simulated_failure", errorMessage: "Configured to fail." };
    }
    return { platform: "facebook", status: "success", remoteId: "mock-fb-id", url: "https://facebook.com/mock-page/videos/mock-fb-id" };
  }
}