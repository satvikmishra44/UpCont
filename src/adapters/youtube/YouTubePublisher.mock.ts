import type { PlatformPublisher, PublishValidation } from "../PlatformPublisher.js";
import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishTarget } from "../../types.js";

export interface MockBehaviorOptions {
  simulateFailure?: boolean;
}

export class YouTubePublisherMock implements PlatformPublisher {
  readonly platform = "youtube" as const;
  constructor(private readonly behavior: MockBehaviorOptions = {}) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return {
      platform: "youtube",
      state: "authorized",
      account: { displayName: "Mock YouTube Channel", id: "mock-channel-id" },
      missingConfig: [],
      nextStep: "Mock mode is active.",
    };
  }

  async listTargets(): Promise<PublishTarget[]> {
    return [{ platform: "youtube", id: "mock-channel-id", displayName: "Mock YouTube Channel" }];
  }

  async validatePublishRequest(request: PublishRequest): Promise<PublishValidation> {
    const reasons: string[] = [];
    if (!request.title?.trim()) reasons.push("YouTube requires a title.");
    return { ok: reasons.length === 0, reasons };
  }

  async publish(request: PublishRequest, dryRun: boolean): Promise<PlatformPublishResult> {
    if (dryRun) return { platform: "youtube", status: "dry_run" };
    if (this.behavior.simulateFailure) {
      return { platform: "youtube", status: "failed", errorCategory: "simulated_failure", errorMessage: "Configured to fail for testing." };
    }
    return { platform: "youtube", status: "success", remoteId: "mock-video-id", url: "https://youtube.com/watch?v=mock-video-id" };
  }
}