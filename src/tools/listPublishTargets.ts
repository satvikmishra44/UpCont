import * as z from "zod/v4"
import type { PlatformPublisher } from "../adapters/PlatformPublisher.js";
import type { PlatformName, PublishTarget } from "../types.js";

export const ListPublishTargetsInputSchema = z.object({
  platform: z.enum(["youtube", "facebook", "instagram", "all"]).optional().default("all"),
});

export type ListPublishTargetsInput = z.infer<typeof ListPublishTargetsInputSchema>;

export interface ListPublishTargetsResult {
  targets: PublishTarget[];
  errors: Array<{ platform: PlatformName; message: string }>;
}

export async function listPublishTargets(input: ListPublishTargetsInput, publishers: Record<PlatformName, PlatformPublisher>): Promise<ListPublishTargetsResult> {
  const platforms: PlatformName[] = input.platform === "all" ? ["youtube", "facebook", "instagram"] : [input.platform];

  const settled = await Promise.allSettled(
    platforms.map((platform) => publishers[platform].listTargets())
  );

  const targets: PublishTarget[] = []
  const errors: ListPublishTargetsResult["errors"] = [];

  settled.forEach((outcome, index) => {
    const platform = platforms[index];

    if(platform === undefined){
      return;
    }

    if(outcome.status === "fulfilled"){
      targets.push(...outcome.value);
    } else {
      errors.push({platform, message:  outcome.reason instanceof Error ? outcome.reason.message : "Unable to list targets."})
    }
  })

  return { targets, errors };
}