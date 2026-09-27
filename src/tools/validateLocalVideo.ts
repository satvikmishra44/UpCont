import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { validateVideoFile } from "../video/validateVideoFile.js";
import type { ValidateVideoResult } from "../types.js";

export const ValidateLocalVideoInputSchema = z.object({
  fileName: z.string().min(1),
  platforms: z.array(z.enum(["youtube", "facebook", "instagram"])).min(1),
});

export type ValidateLocalVideoInput = z.infer<typeof ValidateLocalVideoInputSchema>;

export async function validateLocalVideo(
  input: ValidateLocalVideoInput,
  config: AppConfig,
): Promise<ValidateVideoResult> {
  return validateVideoFile({
    fileName: input.fileName,
    platforms: input.platforms,
    videoUploadRoot: config.videoUploadRoot,
    maxVideoSizeBytes: config.maxVideoSizeMb * 1024 * 1024,
  });
}