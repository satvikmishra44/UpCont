import * as z from "zod/v4";

import type { PlatformPublisher } from "../adapters/PlatformPublisher.js";
import type { AppConfig } from "../config/env.js";
import type {PlatformName, PlatformPublishResult, PublishRequest, PublishVideoResult} from "../types.js";
import {validateVideoFile, VideoValidationError} from "../videos/validateVideoFile.js" 

export const PublishVideoInputSchema = z.object({
    fileName: z.string().min(1),
    platforms: z.array(z.enum(["youtube", "facebook", "instagram"])).min(1),
    targetIds: z.record(z.string(), z.string()).default({}),
    title: z.string().min(1).max(100),
    description: z.string().max(5000).default(""),
    privacyStatus: z.enum(["private", "unlisted", "public"]).default("private"),
    tags: z.array(z.string().min(1)).max(30).default([]),
    categoryId: z.string().default("22"),
    madeForKids: z.boolean(),
    notifySubscribers: z.boolean().default(false),
    metaConfirmPublic: z.boolean().default(false),
    instagramShareToFeed: z.boolean().default(true),
    dryRun: z.boolean().default(true),
    confirmPublish: z.boolean().default(false),
});

export type PublishVideoInput = z.infer<typeof PublishVideoInputSchema>;

function determineOverallStatus(results: PlatformPublishResult[], dryRun: boolean): PublishVideoResult["overallStatus"] {
    if (dryRun) {
      return "dry_run";
    }

    const successCount = results.filter((result) => result.status === "success").length;

    const failureCount = results.filter((result) => result.status === "failed").length;

    if (failureCount === 0) {
      return "success";
    }

    if (successCount === 0) {
      return "failed";
    }

    return "partial_success";
}

export async function publishVideo(input: PublishVideoInput, config: AppConfig, publishers: Record<PlatformName, PlatformPublisher>): Promise<PublishVideoResult> {
    if (!input.dryRun && !input.confirmPublish) {
      throw new Error("Real publishing requires confirmPublish=true.");
    }

    const includesMeta = input.platforms.includes("facebook") || input.platforms.includes("instagram");

    if (!input.dryRun && includesMeta && !input.metaConfirmPublic) {
      throw new Error("Real Facebook or Instagram publishing requires metaConfirmPublic=true.");
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

      throw new Error("Unexpected local video validation failure.");
    }

  const results:PlatformPublishResult[] = [];

  for (const platform of input.platforms) {
    const publisher = publishers[platform];

    const request: PublishRequest = {
      video: validatedVideo.video,
      title: input.title,
      description: input.description,
      privacyStatus: input.privacyStatus,
      targetId: input.targetIds[platform],

      tags: input.tags,
      categoryId: input.categoryId,
      madeForKids: input.madeForKids || false,
      notifySubscribers: input.notifySubscribers,

      metaConfirmPublic: input.metaConfirmPublic,
      instagramShareToFeed: input.instagramShareToFeed,
    };

    try {
      const connection = await publisher.getConnectionStatus();

      if (!input.dryRun && connection.state !== "authorized") {
        results.push({
          platform,
          status: "failed",
          errorCategory: "not_authorized",
          errorMessage: `${platform} is not authorized.`,
        });

        continue;
      }

      const validation = await publisher.validatePublishRequest(request);

      if (!validation.ok) {
        results.push({
          platform,
          status: "failed",
          errorCategory: "invalid_request",
          errorMessage: validation.reasons.join("; "),
        });

        continue;
      }

      results.push(await publisher.publish(request, input.dryRun));
    } catch {
      results.push({
        platform,
        status: "failed",
        errorCategory:"unexpected_error",
        errorMessage:`Unexpected ${platform} publishing error.`,
      });
    }
  }

  return {overallStatus: determineOverallStatus(results, input.dryRun), results};
}