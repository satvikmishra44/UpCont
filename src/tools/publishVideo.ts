import * as z from "zod/v4";

import type { PlatformPublisher } from "../adapters/PlatformPublisher.js";
import type { AppConfig } from "../config/env.js";
import type {
  PlatformName,
  PlatformPublishResult,
  PublishRequest,
  PublishVideoResult,
} from "../types.js";
import {
  validateVideoFile,
  VideoValidationError,
} from "../video/validateVideoFile.js";

export const PublishVideoInputSchema = z.object({
  fileName: z.string().min(1),

  platforms: z
    .array(
      z.enum([
        "youtube",
        "facebook",
        "instagram",
      ]),
    )
    .min(1),

  targetIds: z
    .record(z.string(), z.string())
    .optional()
    .default({}),

  title: z.string().min(1).max(100),

  description: z
    .string()
    .max(5000)
    .default(""),

  privacyStatus: z
    .enum(["private", "unlisted", "public"])
    .default("private"),

  tags: z
    .array(z.string().min(1))
    .max(30)
    .default([]),

  categoryId: z.string().default("22"),

  madeForKids: z.boolean(),

  notifySubscribers: z
    .boolean()
    .default(false),

  dryRun: z.boolean().default(true),

  confirmPublish: z
    .boolean()
    .default(false),
});

export type PublishVideoInput = z.infer<
  typeof PublishVideoInputSchema
>;

function determineOverallStatus(
  results: PlatformPublishResult[],
  dryRun: boolean,
): PublishVideoResult["overallStatus"] {
  if (dryRun) {
    return "dry_run";
  }

  const successCount = results.filter(
    (result) => result.status === "success",
  ).length;

  const failureCount = results.filter(
    (result) => result.status === "failed",
  ).length;

  if (failureCount === 0) {
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
  publishers: Record<
    PlatformName,
    PlatformPublisher
  >,
): Promise<PublishVideoResult> {
  if (!input.dryRun && !input.confirmPublish) {
    throw new Error(
      "Real publishing requires confirmPublish=true.",
    );
  }

  let validatedVideo;

  try {
    validatedVideo = await validateVideoFile({
      fileName: input.fileName,
      platforms: input.platforms,
      videoUploadRoot:
        config.videoUploadRoot,
      maxVideoSizeBytes:
        config.maxVideoSizeMb *
        1024 *
        1024,
    });
  } catch (error) {
    if (
      error instanceof VideoValidationError
    ) {
      throw error;
    }

    throw new Error(
      "Unexpected local video validation failure.",
    );
  }

  const results: PlatformPublishResult[] = [];

  for (const platform of input.platforms) {
    const publisher = publishers[platform];

    const targetId = input.targetIds[platform];

    if (!targetId) {
      results.push({
        platform,
        status: "failed",
        errorCategory: "invalid_request",
        errorMessage: `No target ID provided for platform "${platform}".`,
      });

      continue;
    }

    const request: PublishRequest = {
      video: validatedVideo.video,
      title: input.title,
      description: input.description,
      privacyStatus: input.privacyStatus,
      targetId,
      tags: input.tags,
      categoryId: input.categoryId,
      madeForKids: input.madeForKids,
      notifySubscribers: input.notifySubscribers,
    };

    try {
      const connection =
        await publisher.getConnectionStatus();

      if (
        !input.dryRun &&
        connection.state !== "authorized"
      ) {
        results.push({
          platform,
          status: "failed",
          errorCategory:
            "not_authorized",
          errorMessage:
            `${platform} is not authorized.`,
        });

        continue;
      }

      const platformValidation =
        await publisher.validatePublishRequest(
          request,
        );

      if (!platformValidation.ok) {
        results.push({
          platform,
          status: "failed",
          errorCategory:
            "invalid_request",
          errorMessage:
            platformValidation.reasons.join(
              "; ",
            ),
        });

        continue;
      }

      const result = await publisher.publish(request);

      results.push(result);
    } catch {
      results.push({
        platform,
        status: "failed",
        errorCategory:
          "unexpected_error",
        errorMessage:
          `Unexpected ${platform} publishing error.`,
      });
    }
  }

  return {
    overallStatus:
      determineOverallStatus(
        results,
        input.dryRun,
      ),
    results,
  };
}