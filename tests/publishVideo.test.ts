import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { FacebookPagePublisherMock } from "../src/adapters/facebook/FacebookPagePublisher.mock.js";
import type { PlatformPublisher } from "../src/adapters/PlatformPublisher.js";
import { InstagramPublisherMock } from "../src/adapters/instagram/InstagramPublisher.mock.js";
import { YouTubePublisherMock } from "../src/adapters/youtube/YouTubePublisher.mock.js";
import type { AppConfig } from "../src/config/env.js";
import { publishVideo, type PublishVideoInput } from "../src/tools/publishVideo.js";
import type { PlatformName } from "../src/types.js";

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
    youtube: {
      mode: "mock",
      redirectUri: "http://127.0.0.1:53682/oauth2/callback",
      tokenPath: path.join(tempRoot, "token.json"),
    },
  };
});

afterAll(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function buildPublishers(): Record<PlatformName, PlatformPublisher> {
  return {
    youtube: new YouTubePublisherMock(),
    facebook: new FacebookPagePublisherMock(),
    instagram: new InstagramPublisherMock(),
  };
}

function baseInput(overrides: Partial<PublishVideoInput> = {}): PublishVideoInput {
  return {
    fileName: "clip.mp4",
    platforms: ["youtube"],
    targetIds: {},
    title: "Test video",
    description: "",
    privacyStatus: "private",
    tags: [],
    categoryId: "22",
    madeForKids: false,
    notifySubscribers: false,
    dryRun: true,
    confirmPublish: false,
    ...overrides,
  };
}

describe("publishVideo", () => {
  it("returns dry_run for every platform on a dry run", async () => {
    const result = await publishVideo(
      baseInput({
        platforms: ["youtube", "facebook", "instagram"],
        targetIds: { facebook: "mock-page-id", instagram: "mock-ig-id" },
      }),
      config,
      buildPublishers(),
    );

    expect(result.overallStatus).toBe("dry_run");
    expect(result.results.every((entry) => entry.status === "dry_run")).toBe(true);
  });

  it("REGRESSION: passes dryRun=true to the adapter", async () => {
    const publishers = buildPublishers();
    const spy = vi.spyOn(publishers.youtube, "publish");

    await publishVideo(baseInput(), config, publishers);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe(true);
  });

  it("passes dryRun=false only for a confirmed real publish", async () => {
    const publishers = buildPublishers();
    const spy = vi.spyOn(publishers.youtube, "publish");

    const result = await publishVideo(
      baseInput({ dryRun: false, confirmPublish: true }),
      config,
      publishers,
    );

    expect(spy.mock.calls[0]?.[1]).toBe(false);
    expect(result.overallStatus).toBe("success");
  });

  it("rejects a real publish without confirmPublish", async () => {
    const publishers = buildPublishers();
    const spy = vi.spyOn(publishers.youtube, "publish");

    await expect(
      publishVideo(baseInput({ dryRun: false, confirmPublish: false }), config, publishers),
    ).rejects.toThrow(/confirmPublish/i);

    expect(spy).not.toHaveBeenCalled();
  });

  it("fails Facebook when no target ID is supplied", async () => {
    const result = await publishVideo(
      baseInput({ platforms: ["facebook"] }),
      config,
      buildPublishers(),
    );

    expect(result.results[0]?.status).toBe("failed");
    expect(result.results[0]?.errorCategory).toBe("invalid_request");
  });

  it("returns partial_success when one platform fails", async () => {
    const publishers = buildPublishers();
    publishers.facebook = new FacebookPagePublisherMock({ simulateFailure: true });

    const result = await publishVideo(
      baseInput({
        platforms: ["youtube", "facebook"],
        targetIds: { facebook: "mock-page-id" },
        dryRun: false,
        confirmPublish: true,
      }),
      config,
      publishers,
    );

    expect(result.overallStatus).toBe("partial_success");
    expect(result.results.find((entry) => entry.platform === "youtube")?.status).toBe("success");
    expect(result.results.find((entry) => entry.platform === "facebook")?.status).toBe("failed");
  });

  it("blocks a real publish to an unauthorized platform", async () => {
    const publishSpy = vi.fn();

    const disconnected: PlatformPublisher = {
      platform: "youtube",
      getConnectionStatus: async () => ({ platform: "youtube", state: "disconnected" }),
      listTargets: async () => [],
      validatePublishRequest: async () => ({ ok: true, reasons: [], warnings: [] }),
      publish: publishSpy,
    };

    const result = await publishVideo(
      baseInput({ dryRun: false, confirmPublish: true }),
      config,
      { ...buildPublishers(), youtube: disconnected },
    );

    expect(result.overallStatus).toBe("failed");
    expect(result.results[0]?.errorCategory).toBe("not_authorized");
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("rejects path traversal before any adapter is touched", async () => {
    const publishers = buildPublishers();
    const spy = vi.spyOn(publishers.youtube, "publish");

    await expect(
      publishVideo(baseInput({ fileName: "../secret.mp4" }), config, publishers),
    ).rejects.toThrow();

    expect(spy).not.toHaveBeenCalled();
  });
});