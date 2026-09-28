import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import type { PlatformPublisher } from "../adapters/PlatformPublisher.js";
import { validateVideoFile, VideoValidationError } from "../video/validateVideoFile.js";
import type { PlatformName, PlatformPublishResult, PublishRequest, PublishVideoResult } from "../types.js";

export const PublishVideoInputSchema = z.object({
  fileName: z.string().min(1),
  platforms: z.array(z.enum(["youtube", "facebook", "instagram"])).min(1),
  targetIds: z.record(z.string(), z.string()).optional().default({}),
  title: z.string().min(1),
  description: z.string().default(""),
  privacyStatus: z.enum(["private", "unlisted", "public"]).optional().default("private"),
  dryRun: z.boolean().optional().default(true),
  confirmPublish: z.boolean().optional().default(false),
});

export type PublishVideoInput = z.infer<typeof PublishVideoInputSchema>;

function getOverallStatus(
  results: PlatformPublishResult[],
  dryRun: boolean,
): PublishVideoResult["overallStatus"] {
  if (dryRun) {
    return "dry_run";
  }

  const successCount = results.filter((result) => result.status === "success").length;
  const failedCount = results.filter((result) => result.status === "failed").length;

  if (failedCount === 0) {
    return "success";
  }

  if (successCount === 0) {
    return "failed";
  }

  return "partial_success";
}

export async function publishVideo(
  input: PublishVideoInput,
  config: AppConfig,
  publishers: Record<PlatformName, PlatformPublisher>,
): Promise<PublishVideoResult> {
  if (!input.dryRun && !input.confirmPublish) {
    throw new Error(
      "Refusing real publish because dryRun is false but confirmPublish is not true.",
    );
  }

  let validatedVideo;
  try {
    validatedVideo = await validateVideoFile({
      fileName: input.fileName,
      platforms: input.platforms,
      videoUploadRoot: config.videoUploadRoot,
      maxVideoSizeBytes: config.maxVideoSizeMb * 1024 * 1024,
    });
  } catch (error) {
    if (error instanceof VideoValidationError) {
      throw error;
    }
    throw new Error("Unexpected error during local video validation.");
  }

  const results: PlatformPublishResult[] = [];

  for (const platform of input.platforms) {
    const publisher = publishers[platform];

    const request: PublishRequest = {
      video: validatedVideo.video,
      title: input.title,
      description: input.description,
      privacyStatus: input.privacyStatus,
      targetId: input.targetIds[platform],
    };

    try {
      const connectionStatus = await publisher.getConnectionStatus();

      if (!input.dryRun && connectionStatus.state !== "authorized") {
        results.push({
          platform,
          status: "failed",
          errorCategory: "not_authorized",
          errorMessage: `Platform "${platform}" is not authorized.`,
        });
        continue;
      }

      const validation = await publisher.validatePublishRequest(request);

      if (!input.dryRun && !validation.ok) {
        results.push({
          platform,
          status: "failed",
          errorCategory: "invalid_request",
          errorMessage: validation.reasons.join("; "),
        });
        continue;
      }

      const publishResult = await publisher.publish(request, input.dryRun);
      results.push(publishResult);
    } catch {
      results.push({
        platform,
        status: "failed",
        errorCategory: "unexpected_error",
        errorMessage: "Unexpected platform error.",
      });
    }
  }

  return {
    overallStatus: getOverallStatus(results, input.dryRun),
    results,
  };
}