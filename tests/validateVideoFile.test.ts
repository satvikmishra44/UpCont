import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { validateVideoFile, VideoValidationError } from "../src/video/validateVideoFile.js";

let tempRoot: string;

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "upcont-video-test-"));
  await fs.writeFile(path.join(tempRoot, "sample.mp4"), Buffer.alloc(1024, 1));
});

afterAll(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("validateVideoFile", () => {
  it("accepts a valid local file inside the upload root", async () => {
    const result = await validateVideoFile({
      fileName: "sample.mp4",
      platforms: ["youtube", "instagram"],
      videoUploadRoot: tempRoot,
      maxVideoSizeBytes: 10 * 1024 * 1024,
    });

    expect(result.video.fileName).toBe("sample.mp4");
    expect(result.perPlatform).toHaveLength(2);
  });

  it("rejects path traversal attempts", async () => {
    await expect(
      validateVideoFile({
        fileName: "../secret.mp4",
        platforms: ["youtube"],
        videoUploadRoot: tempRoot,
        maxVideoSizeBytes: 10 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(VideoValidationError);
  });

  it("rejects absolute paths", async () => {
    await expect(
      validateVideoFile({
        fileName: path.join(tempRoot, "sample.mp4"),
        platforms: ["youtube"],
        videoUploadRoot: tempRoot,
        maxVideoSizeBytes: 10 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(VideoValidationError);
  });

  it("rejects unsupported extensions", async () => {
    await fs.writeFile(path.join(tempRoot, "bad.txt"), "not a video");

    await expect(
      validateVideoFile({
        fileName: "bad.txt",
        platforms: ["youtube"],
        videoUploadRoot: tempRoot,
        maxVideoSizeBytes: 10 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(VideoValidationError);
  });

  it("rejects a missing file", async () => {
    await expect(
      validateVideoFile({
        fileName: "missing.mp4",
        platforms: ["youtube"],
        videoUploadRoot: tempRoot,
        maxVideoSizeBytes: 10 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(VideoValidationError);
  });
});