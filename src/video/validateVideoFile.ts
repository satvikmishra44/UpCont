import { promises as fs } from "node:fs";
import path from "node:path";
import type { PlatformName, PlatformValidationResult, SafeVideoReference } from "../types.js";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".webm"]);
const EXTENSION_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
};

export class VideoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoValidationError";
  }
}

async function resolveSafePath(fileName: string, videoUploadRoot: string): Promise<string> {
  if (fileName.includes("..") || path.isAbsolute(fileName) || fileName.includes("\0")) {
    throw new VideoValidationError("fileName must be a plain relative name, no '..' or absolute paths.");
  }

  const candidate = path.resolve(videoUploadRoot, fileName);
  const rootWithSep = videoUploadRoot.endsWith(path.sep) ? videoUploadRoot : videoUploadRoot + path.sep;

  if (!candidate.startsWith(rootWithSep)) {
    throw new VideoValidationError("Resolved path escapes VIDEO_UPLOAD_ROOT.");
  }

  let stat;
  try {
    stat = await fs.lstat(candidate);
  } catch {
    throw new VideoValidationError(`File not found: ${fileName}`);
  }

  if (stat.isSymbolicLink()) {
    const real = await fs.realpath(candidate);
    if (!real.startsWith(rootWithSep)) {
      throw new VideoValidationError("Symlink escapes VIDEO_UPLOAD_ROOT; rejected.");
    }
  }

  const finalStat = await fs.stat(candidate);
  if (!finalStat.isFile()) {
    throw new VideoValidationError(`Not a regular file: ${fileName}`);
  }

  return candidate;
}

function platformWarnings(platform: PlatformName, ext: string, sizeBytes: number): PlatformValidationResult {
  const warnings: string[] = [];
  const sizeMb = sizeBytes / (1024 * 1024);

  if (platform === "instagram" && ext !== ".mp4" && ext !== ".mov") {
    warnings.push("Instagram prefers MP4/MOV containers.");
  }
  if (platform === "youtube" && sizeMb > 128000) {
    warnings.push("Exceeds YouTube's general size guidance.");
  }
  if (platform === "instagram") {
    warnings.push("Instagram's API generally requires a public HTTPS URL, not a local file.");
  }
  return { platform, ok: true, warnings };
}

export interface ValidateVideoInput {
  fileName: string;
  platforms: PlatformName[];
  videoUploadRoot: string;
  maxVideoSizeBytes: number;
}

export async function validateVideoFile(input: ValidateVideoInput) {
  const { fileName, platforms, videoUploadRoot, maxVideoSizeBytes } = input;
  const ext = path.extname(fileName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new VideoValidationError(`Unsupported extension "${ext || "(none)"}".`);
  }

  const absolutePath = await resolveSafePath(fileName, videoUploadRoot);
  const stat = await fs.stat(absolutePath);

  if (stat.size > maxVideoSizeBytes) {
    throw new VideoValidationError(`File exceeds configured size limit.`);
  }

  const video: SafeVideoReference = {
    fileName,
    absolutePath,
    sizeBytes: stat.size,
    mimeType: EXTENSION_MIME[ext] ?? null,
  };

  return { video, perPlatform: platforms.map((p) => platformWarnings(p, ext, stat.size)) };
}