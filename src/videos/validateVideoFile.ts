import { promises as fs } from "node:fs";
import path from "node:path";
import mime from "mime-types";

import type {
  PlatformName,
  PlatformVideoValidation,
  ValidateVideoResult,
  ValidatedVideo,
} from "../types.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
]);

export class VideoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoValidationError";
  }
}

export interface ValidateVideoFileInput {
  filePath: string;
  platforms: PlatformName[];
  videoUploadRoot: string;
  maxVideoSizeBytes: number;
}

function isAbsolutePath(input: string): boolean {
  return path.isAbsolute(input);
}

function hasSupportedExtension(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function ensureFileExists(resolvedPath: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    throw new VideoValidationError(`Video file not found: ${resolvedPath}`);
  }

  if (!stat.isFile()) {
    throw new VideoValidationError(`Path is not a file: ${resolvedPath}`);
  }
}

function ensureInsideRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new VideoValidationError(
      "Relative video paths must stay inside VIDEO_UPLOAD_ROOT.",
    );
  }
}

function resolveCandidatePath(
  filePath: string,
  videoUploadRoot: string,
): { absolutePath: string; sourceType: "absolute_path" | "upload_root" } {
  const trimmed = filePath.trim();

  if (!trimmed) {
    throw new VideoValidationError("filePath cannot be empty.");
  }

  if (isAbsolutePath(trimmed)) {
    return {
      absolutePath: path.resolve(trimmed),
      sourceType: "absolute_path",
    };
  }

  const resolved = path.resolve(videoUploadRoot, trimmed);
  ensureInsideRoot(path.resolve(videoUploadRoot), resolved);

  return {
    absolutePath: resolved,
    sourceType: "upload_root",
  };
}

function buildPlatformValidation(platform: PlatformName): PlatformVideoValidation {
  if (platform === "instagram") {
    return {
      platform,
      ok: true,
      warnings: [
        "Instagram publishing uses the local file for upload, but the linked Meta account and Reel processing must still succeed.",
      ],
      errors: [],
    };
  }

  if (platform === "facebook") {
    return {
      platform,
      ok: true,
      warnings: [
        "Facebook Page visibility is public-facing and is not controlled by the YouTube privacyStatus field.",
      ],
      errors: [],
    };
  }

  return {
    platform,
    ok: true,
    warnings: [],
    errors: [],
  };
}

export async function validateVideoFile(
  input: ValidateVideoFileInput,
): Promise<ValidateVideoResult> {
  const resolved = resolveCandidatePath(input.filePath, input.videoUploadRoot);

  if (!hasSupportedExtension(resolved.absolutePath)) {
    throw new VideoValidationError(
      `Unsupported video extension: ${path.extname(resolved.absolutePath) || "(none)"}`,
    );
  }

  await ensureFileExists(resolved.absolutePath);

  const stat = await fs.stat(resolved.absolutePath);

  if (stat.size === 0) {
    throw new VideoValidationError("Video file is empty.");
  }

  if (stat.size > input.maxVideoSizeBytes) {
    throw new VideoValidationError(
      `Video exceeds the size limit of ${input.maxVideoSizeBytes} bytes.`,
    );
  }

  const mimeType =
    mime.lookup(resolved.absolutePath) || "application/octet-stream";

  const video: ValidatedVideo = {
    fileName: path.basename(resolved.absolutePath),
    absolutePath: resolved.absolutePath,
    sizeBytes: stat.size,
    mimeType: String(mimeType),
    sourceType: resolved.sourceType,
  };

  return {
    ok: true,
    video,
    perPlatform: input.platforms.map(buildPlatformValidation),
  };
}