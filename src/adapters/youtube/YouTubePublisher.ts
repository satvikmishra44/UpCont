import {createReadStream} from "node:fs";

import type { OAuth2Client } from "google-auth-library";
import { google, type youtube_v3 } from "googleapis";

import type { YouTubeAuthPort } from "../../auth/YouTubeAuthService.js"
import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishRequestValidation, PublishTarget } from "../../types.js"
import type { PlatformPublisher } from "../PlatformPublisher.js";

type YouTubeApiFactory = (auth: OAuth2Client) => youtube_v3.Youtube;

function createDefaultYTApi(auth: OAuth2Client) : youtube_v3.Youtube {
    return google.youtube({ version: "v3", auth});
}

function classifyYouTubeError(error: unknown): { category: string; message: string; } {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as {
        response?: {
          status?: number;
          data?: {
            error? : string | {errors?: Array<{reason?: string}>} | null;
            // error?: {
            //   message?: string;
            //   errors?: Array<{ reason?: string }>;
            // };
          };
        };
      }
    ).response;

    const status = response?.status;
    const data = response?.data?.error;
    const oauthError = typeof data === "string" ? data : undefined;
    const reason = typeof data === "object" && data !== null ? data.errors?.[0]?.reason : undefined;

    if (oauthError === "invalid_grant" || status === 401 || reason === "authError" || reason === "invalidCredentials") {
      return {category: "authorization_expired", message: "YouTube authorization is invalid or expired. Reconnect YouTube."};
    }

    if (reason === "quotaExceeded" || reason === "uploadLimitExceeded") {
      return {category: reason, message: "YouTube quota or upload limit reached. Try again after the daily quota reset."};
    }

    if (status === 403) {
      return {category: reason ?? "youtube_forbidden", message: "YouTube rejected the operation. Check channel permissions, API access, privacy policy, or quota."};
    }

    if (status === 400) {
      return {category: reason ?? "youtube_invalid_request", message: "YouTube rejected the video metadata or upload request."};
    }
  }

  return {category: "youtube_unexpected_error", message: "An unexpected YouTube API error occurred."};
}

export class YouTubePublisher implements PlatformPublisher {
    readonly platform = "youtube" as const;

    constructor(
        private readonly authService: YouTubeAuthPort,
        private readonly createYTApi: YouTubeApiFactory = createDefaultYTApi
    ) {}

    async getConnectionStatus(): Promise<ConnectionStatus> {
        const status = await this.authService.getStatus();
        return {
            platform: this.platform,
            state: status.state,
            details: status.details
        };
    }

    async listTargets(): Promise<PublishTarget[]> {
        const auth = await this.authService.getAuthorizedClient();

        const youtube = this.createYTApi(auth);

        const response = await youtube.channels.list({part: ["id", "snippet"], mine: true, maxResults: 50});

        return (response.data.items ?? []).filter((channel): channel is youtube_v3.Schema$Channel & {id: string} => Boolean(channel.id))
        .map((channel) => ({
            platform: "youtube" as const,
            id: channel.id,
            displayName:
            channel.snippet?.title ??
            `YouTube channel ${channel.id}`,
            targetType: "channel" as const,
        }));
    }

    async validatePublishRequest(request: PublishRequest): Promise<PublishRequestValidation> {
        const reasons: string[] = [];
        const warnings: string[] = [];

        const trimmedTitle = request.title.trim();

        if (!trimmedTitle) {
            reasons.push("YouTube title is required.");
        }

        if (trimmedTitle.length > 100) {
            reasons.push("YouTube title cannot exceed 100 characters.");
        }

        if (request.description.length > 5000) {
            reasons.push("YouTube description cannot exceed 5000 characters.");
        }

        if (!["private", "unlisted", "public"].includes(request.privacyStatus)) {
            reasons.push("YouTube privacy must be private, unlisted, or public.");
        }

        if (!request.categoryId.trim()) {
            reasons.push("YouTube categoryId cannot be empty.");
        }

        if (request.tags.some((tag) => !tag.trim())) {
            reasons.push("YouTube tags cannot contain empty values.");
        }

        if (request.privacyStatus !== "private") {
            warnings.push("This upload may become visible to other people. Use private for the first real integration test.");
        }

        if (request.notifySubscribers) {
            warnings.push("YouTube subscriber notifications are enabled.");
        }

        return {ok: reasons.length === 0, reasons, warnings};
  }

  async publish(request: PublishRequest, dryRun: boolean): Promise<PlatformPublishResult> {
    const validation = await this.validatePublishRequest(request);

    if (!validation.ok) {
      return { platform: "youtube", status: "failed", errorCategory: "invalid_request", errorMessage: validation.reasons.join("; ")};
    }

    if (dryRun) {
      return { platform: "youtube", status: "dry_run", message: "YouTube request validated. No network upload was performed."};
    }

    try {
      const auth = await this.authService.getAuthorizedClient();

      const youtube = this.createYTApi(auth);

      if (request.targetId) {
        const targets = await this.listTargets();
        const connectedTarget = targets.find((target) => target.id === request.targetId);

        if (!connectedTarget) {
          return {
            platform: "youtube",
            status: "failed",
            errorCategory: "target_mismatch",
            errorMessage:
              "The requested YouTube target does not match the channel selected during OAuth.",
          };
        }
      }

      const snippet: youtube_v3.Schema$VideoSnippet = {
        title: request.title.trim(),
        description: request.description,
        categoryId: request.categoryId,
      };

      if (request.tags.length > 0) {
        snippet.tags = request.tags;
      }

      const response = await youtube.videos.insert({
        part: ["snippet", "status"],
        notifySubscribers:
          request.notifySubscribers,
        requestBody: {
          snippet,
          status: {
            privacyStatus:
              request.privacyStatus,
            selfDeclaredMadeForKids:
              request.madeForKids,
          },
        },
        media: {
          mimeType: request.video.mimeType,
          body: createReadStream(
            request.video.absolutePath,
          ),
        },
      });

      const videoId = response.data.id;

      if (!videoId) {
        return {
          platform: "youtube",
          status: "failed",
          errorCategory: "missing_video_id",
          errorMessage:
            "YouTube accepted the request but did not return a video ID.",
        };
      }

      return {
        platform: "youtube",
        status: "success",
        externalId: videoId,
        externalUrl: `https://youtu.be/${videoId}`,
        message:
          "YouTube accepted the video upload.",
      };
    } catch (error) {
      const classified = classifyYouTubeError(error);

      return {
        platform: "youtube",
        status: "failed",
        errorCategory:
          classified.category,
        errorMessage:
          classified.message,
      };
    }
  }
}