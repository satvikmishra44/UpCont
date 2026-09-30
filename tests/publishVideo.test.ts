import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { publishVideo } from "../src/tools/publishVideo.js";
import { YouTubePublisherMock } from "../src/adapters/youtube/YouTubePublisher.mock.js";
import { FacebookPagePublisherMock } from "../src/adapters/facebook/FacebookPagePublisher.mock.js";
import { InstagramPublisherMock } from "../src/adapters/instagram/InstagramPublisher.mock.js";

import type { AppConfig } from "../src/config/env.js";
import type { PlatformName } from "../src/types.js";
import type { PlatformPublisher } from "../src/adapters/PlatformPublisher.js";

let tempRoot: string;
let config: AppConfig;

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "upcont-publish-test-"));
  await fs.writeFile(path.join(tempRoot, "clip.mp4"), Buffer.alloc(2048, 1));

  config = {
    nodeEnv: "test",
    logLevel: "silent",
    mockMode: true,
    videoUploadRoot: tempRoot,
    maxVideoSizeMb: 500,
    youtube: {},
    meta: {},
  };
});

afterAll(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function buildPublishers(simulateFailure = false): Record<PlatformName, PlatformPublisher> {
  return {
    youtube: new YouTubePublisherMock({ simulateFailure }),
    facebook: new FacebookPagePublisherMock({ simulateFailure }),
    instagram: new InstagramPublisherMock({ simulateFailure }),
  };
}

describe("publishVideo", () => {
  it("returns dry_run when dryRun is true", async () => {
    const result = await publishVideo(
      {
        fileName: "clip.mp4",
        platforms: ["youtube", "facebook"],
        targetIds: {},
        title: "Test video",
        description: "Dry run test",
        privacyStatus: "private",
        dryRun: true,
        confirmPublish: false,
      },
      config,
      buildPublishers(),
    );

    expect(result.overallStatus).toBe("dry_run");
    expect(result.results.every((r) => r.status === "dry_run")).toBe(true);
  });

  it("rejects a real publish without confirmPublish", async () => {
    await expect(
      publishVideo(
        {
          fileName: "clip.mp4",
          platforms: ["youtube"],
          targetIds: {},
          title: "Test video",
          description: "",
          privacyStatus: "private",
          dryRun: false,
          confirmPublish: false,
        },
        config,
        buildPublishers(),
      ),
    ).rejects.toThrow(/confirmPublish/i);
  });

  it("returns partial_success when one selected platform fails", async () => {
    const publishers = buildPublishers();
    publishers.facebook = new FacebookPagePublisherMock({ simulateFailure: true });

    const result = await publishVideo(
      {
        fileName: "clip.mp4",
        platforms: ["youtube", "facebook"],
        targetIds: { facebook: "mock-page-id" },
        title: "Test video",
        description: "",
        privacyStatus: "private",
        dryRun: false,
        confirmPublish: true,
      },
      config,
      publishers,
    );

    expect(result.overallStatus).toBe("partial_success");
    expect(result.results.find((r) => r.platform === "youtube")?.status).toBe("success");
    expect(result.results.find((r) => r.platform === "facebook")?.status).toBe("failed");
  });

  it("returns success when all selected platforms succeed", async () => {
    const result = await publishVideo(
      {
        fileName: "clip.mp4",
        platforms: ["youtube", "facebook", "instagram"],
        targetIds: {
          facebook: "mock-page-id",
          instagram: "mock-ig-id",
        },
        title: "Test video",
        description: "",
        privacyStatus: "private",
        dryRun: false,
        confirmPublish: true,
      },
      config,
      buildPublishers(),
    );

    expect(result.overallStatus).toBe("success");
    expect(result.results).toHaveLength(3);
  });
});