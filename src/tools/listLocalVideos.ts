import { promises as fs } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";

const VIDEO_TYPES: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
};

export const ListLocalVideosInputSchema = z.object({
    limit: z.number().int().min(1).max(50).default(10),
});

export type ListLocalVideosInput = z.infer<typeof ListLocalVideosInputSchema>;

export interface LocalVideoListItem {
    fileName: string;
    sizeBytes: number;
    modifiedAt: string;
    mimeType: string;
}

export async function listLocalVideos(input: ListLocalVideosInput, videoUploadRoot: string): Promise<LocalVideoListItem[]> {
    const root = path.resolve(videoUploadRoot);
    const directoryEntries = await fs.readdir(root, { withFileTypes: true });
    const videos: LocalVideoListItem[] = [];

    for (const entry of directoryEntries) {
        if (!entry.isFile()) continue;

        const extension = path.extname(entry.name).toLowerCase();
        const mimeType = VIDEO_TYPES[extension];

        if (!mimeType) continue;

        const absolutePath = path.join(root, entry.name);
        const stats = await fs.stat(absolutePath);

        videos.push({
            fileName: entry.name,
            sizeBytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            mimeType,
        });
    }

    return videos
        .sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt))
        .slice(0, input.limit);
}