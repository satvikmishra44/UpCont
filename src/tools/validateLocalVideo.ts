import * as z from "zod/v4";
import type { AppConfig } from "../config/env.js";
import { validateVideoFile } from "../videos/validateVideoFile.js";
import type { ValidateVideoResult } from "../types.js";

export const ValidateLocalVideoInputSchema = z.object({
  filePath: z.string().min(1),
  platforms: z.array(z.enum(["youtube", "facebook", "instagram"])).min(1),
});

export type ValidateLocalVideoInput = z.infer<typeof ValidateLocalVideoInputSchema>;

export async function validateLocalVideo(input: ValidateLocalVideoInput, config: AppConfig): Promise<ValidateVideoResult> {
  return validateVideoFile({
    filePath: input.filePath,
    platforms: input.platforms,
    videoUploadRoot: config.videoUploadRoot,
    maxVideoSizeBytes: config.maxVideoSizeMb * 1024 * 1024,
  });
}