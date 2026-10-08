import * as z from "zod/v4"
import type { PlatformPublisher } from "../adapters/PlatformPublisher.js";
import type { PlatformName, PublishTarget } from "../types.js";

export const ListPublishTargetsInputSchema = z.object({
  platform: z.enum(["youtube", "facebook", "instagram", "all"]).optional().default("all"),
});

export type ListPublishTargetsInput = z.infer<typeof ListPublishTargetsInputSchema>;

export async function listPublishTargets(
  input: ListPublishTargetsInput,
  publishers: Record<PlatformName, PlatformPublisher>,
): Promise<PublishTarget[]> {
  const platforms: PlatformName[] =
    input.platform === "all"
      ? ["youtube", "facebook", "instagram"]
      : [input.platform];

  const nestedResults = await Promise.all(
    platforms.map((platform) => publishers[platform].listTargets()),
  );

  return nestedResults.flat();
}