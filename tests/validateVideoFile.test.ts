import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateVideoFile, VideoValidationError } from "../src/video/validateVideoFile.js";

let tempRoot: string;
const limit = 10 * 1024 * 1024;

function run(fileName: string, platforms: Array<"youtube" | "facebook" | "instagram"> = ["youtube"]) {
  return validateVideoFile({ fileName, platforms, videoUploadRoot: tempRoot, maxVideoSizeBytes: limit });
}

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "upcont-video-test-"));
  await fs.writeFile(path.join(tempRoot, "sample.mp4"), Buffer.alloc(1024, 1));
  await fs.writeFile(path.join(tempRoot, "empty.mp4"), Buffer.alloc(0));
  await fs.writeFile(path.join(tempRoot, "bad.txt"), "not a video");
});

afterAll(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("validateVideoFile", () => {
  it("accepts a valid file and returns ok with mime type", async () => {
    const result = await run("sample.mp4", ["youtube", "instagram"]);

    expect(result.ok).toBe(true);
    expect(result.video.mimeType).toBe("video/mp4");
    expect(result.video.sizeBytes).toBe(1024);
    expect(result.perPlatform).toHaveLength(2);
  });

  it("adds the Instagram public-URL warning", async () => {
    const result = await run("sample.mp4", ["instagram"]);
    expect(result.perPlatform[0]?.warnings.join(" ")).toMatch(/public HTTPS/i);
  });

  it("rejects path traversal", async () => {
    await expect(run("../secret.mp4")).rejects.toBeInstanceOf(VideoValidationError);
  });

  it("rejects absolute paths", async () => {
    await expect(run(path.join(tempRoot, "sample.mp4"))).rejects.toBeInstanceOf(VideoValidationError);
  });

  it("rejects unsupported extensions", async () => {
    await expect(run("bad.txt")).rejects.toBeInstanceOf(VideoValidationError);
  });

  it("rejects a missing file", async () => {
    await expect(run("missing.mp4")).rejects.toBeInstanceOf(VideoValidationError);
  });

  it("rejects an empty file", async () => {
    await expect(run("empty.mp4")).rejects.toThrow(/empty/i);
  });

  it("rejects a file above the size limit", async () => {
    await expect(
      validateVideoFile({
        fileName: "sample.mp4",
        platforms: ["youtube"],
        videoUploadRoot: tempRoot,
        maxVideoSizeBytes: 10,
      }),
    ).rejects.toThrow(/size limit/i);
  });
});