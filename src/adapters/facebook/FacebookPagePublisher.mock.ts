import type { PlatformPublisher } from "../PlatformPublisher.js";
import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishRequestValidation, PublishTarget } from "../../types.js";
import type { MockBehaviorOptions } from "../youtube/YouTubePublisher.mock.js";

export class FacebookPagePublisherMock implements PlatformPublisher {
  readonly platform = "facebook" as const;

  constructor(private readonly behavior: MockBehaviorOptions = {}) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { platform: "facebook", state: "authorized", displayName: "Mock Facebook Page", details: "Mock mode is active." };
  }

  async listTargets(): Promise<PublishTarget[]> {
    return [{ platform: "facebook", id: "mock-page-id", displayName: "Mock Facebook Page", targetType: "page" }];
  }

  async validatePublishRequest(request: PublishRequest): Promise<PublishRequestValidation> {
    const reasons: string[] = [];
    if (!request.title.trim()) reasons.push("Title is required.");
    if (!request.targetId) reasons.push("Facebook Page target ID is required.");
    return { ok: reasons.length === 0, reasons, warnings: [] };
  }

  async publish(request: PublishRequest): Promise<PlatformPublishResult> {
    if (this.behavior.simulateFailure) {
      return { platform: this.platform, status: "failed", errorCategory: "simulated_failure", errorMessage: "Configured to fail." };
    }

    return { platform: this.platform, status: "success", externalId: "mock-fb-id", externalUrl: "https://facebook.com/mock-page/videos/mock-fb-id" };
  }
}