import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listLocalVideos } from "../src/tools/listLocalVideos.js";

let temporaryRoot: string;

beforeEach(async () => {
    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "upcont-videos-"));
});

afterEach(async () => {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
});

describe("listLocalVideos", () => {
    it("returns supported videos newest first", async () => {
        const oldFile = path.join(temporaryRoot, "old.mp4");
        const newFile = path.join(temporaryRoot, "new.mp4");

        await fs.writeFile(oldFile, "old");
        await fs.writeFile(newFile, "new");
        await fs.writeFile(path.join(temporaryRoot, "private.txt"), "not a video");

        const oldDate = new Date("2026-01-01T00:00:00Z");
        const newDate = new Date("2026-02-01T00:00:00Z");

        await fs.utimes(oldFile, oldDate, oldDate);
        await fs.utimes(newFile, newDate, newDate);

        const result = await listLocalVideos({ limit: 10 }, temporaryRoot);

        expect(result.map((item) => item.fileName)).toEqual(["new.mp4", "old.mp4"]);
    });
});