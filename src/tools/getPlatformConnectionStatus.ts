import { z } from "zod";
import type { PlatformPublisher } from "../adapters/PlatformPublisher.js";
import type { ConnectionStatus, PlatformName } from "../types.js";

export const GetPlatformConnectionStatusInputSchema = z.object({
  platform: z.enum(["youtube", "facebook", "instagram", "all"]),
});

export type GetPlatformConnectionStatusInput = z.infer<
  typeof GetPlatformConnectionStatusInputSchema
>;

export async function getPlatformConnectionStatus(
  input: GetPlatformConnectionStatusInput,
  publishers: Record<PlatformName, PlatformPublisher>,
): Promise<ConnectionStatus[]> {
  const platforms: PlatformName[] =
    input.platform === "all"
      ? ["youtube", "facebook", "instagram"]
      : [input.platform];

  return Promise.all(platforms.map((platform) => publishers[platform].getConnectionStatus()));
}