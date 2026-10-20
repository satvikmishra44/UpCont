import * as z from "zod/v4";

import type { PlatformPublisher } from "../adapters/PlatformPublisher.js";
import type { AppConfig } from "../config/env.js";
import type { PlatformName } from "../types.js";
import { validateVideoFile } from "../videos/validateVideoFile.js";

export const PrepareUploadPlanInputSchema = z.object({
  filePath: z.string().min(1),
  platforms: z.array(z.enum(["youtube", "facebook", "instagram"])).min(1),
  intendedTitle: z.string().min(1),
  dryRun: z.boolean().default(true),
});

export type PrepareUploadPlanInput = z.infer<typeof PrepareUploadPlanInputSchema>;

export async function prepareUploadPlan(
  input: PrepareUploadPlanInput,
  config: AppConfig,
  publishers: Record<PlatformName, PlatformPublisher>,
) {
  const validated = await validateVideoFile({
    filePath: input.filePath,
    platforms: input.platforms,
    videoUploadRoot: config.videoUploadRoot,
    maxVideoSizeBytes: config.maxVideoSizeMb * 1024 * 1024,
  });

  const connectionStatuses = await Promise.all(
    input.platforms.map((platform) => publishers[platform].getConnectionStatus()),
  );

  const targetsPerPlatform = await Promise.all(
    input.platforms.map(async (platform) => ({
      platform,
      targets: await publishers[platform].listTargets().catch(() => []),
    })),
  );

  return {
    ready: true,
    dryRun: input.dryRun,
    video: validated.video,
    platformValidation: validated.perPlatform,
    connectionStatuses,
    targetsPerPlatform,
    nextSteps: [
      "If any required platform is not authorized, connect it before publishing.",
      "Choose target IDs for Facebook and Instagram if multiple targets are available.",
      "Run publish_video with dryRun=true first, then with explicit confirmations for real publishing.",
    ],
  };
}