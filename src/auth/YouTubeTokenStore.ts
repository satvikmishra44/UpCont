import { promises as fs } from "node:fs";
import path from "node:path";

import type { Credentials } from "google-auth-library";
import * as z from "zod/v4";

const StoredTokenSchema = z.looseObject({
  version: z.literal(1),
  updatedAt: z.string(),
  credentials: z.object({
    access_token: z.string().nullable().exactOptional(),
    refresh_token: z.string().min(1),
    scope: z.string().exactOptional(),
    token_type: z.string().nullable().exactOptional(),
    expiry_date: z.number().nullable().exactOptional(),
    id_token: z.string().nullable().exactOptional(),
  }),
});

interface StoredTokenFile {
  version: 1;
  updatedAt: string;
  credentials: Credentials & {
    refresh_token: string;
  };
}

export class YouTubeTokenStore {
  constructor(private readonly tokenPath: string) {}

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.tokenPath);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<Credentials | null> {
    try {
      const raw = await fs.readFile(this.tokenPath, "utf8");
      const parsed = StoredTokenSchema.parse(JSON.parse(raw));

      return parsed.credentials;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }

      throw new Error(
        "Stored YouTube credentials could not be read or validated.",
      );
    }
  }

  async save(credentials: Credentials): Promise<void> {
    if (!credentials.refresh_token) {
        throw new Error(
        "A refresh token is required for persistent YouTube authorization.",
        );
    }

    const directory = path.dirname(this.tokenPath);
    await fs.mkdir(directory, { recursive: true });

    const normalizedCredentials: StoredTokenFile["credentials"] = {
        refresh_token: credentials.refresh_token,
    };

    if (credentials.access_token !== undefined) {
        normalizedCredentials.access_token = credentials.access_token;
    }

    if (credentials.scope !== undefined) {
        normalizedCredentials.scope = credentials.scope;
    }

    if (credentials.token_type !== undefined) {
        normalizedCredentials.token_type = credentials.token_type;
    }

    if (credentials.expiry_date !== undefined) {
        normalizedCredentials.expiry_date = credentials.expiry_date;
    }

    if (credentials.id_token !== undefined) {
        normalizedCredentials.id_token = credentials.id_token;
    }

    const document: StoredTokenFile = {
        version: 1,
        updatedAt: new Date().toISOString(),
        credentials: normalizedCredentials,
    };

    const temporaryPath = `${this.tokenPath}.${process.pid}.${Date.now()}.tmp`;

    await fs.writeFile(
        temporaryPath,
        `${JSON.stringify(document, null, 2)}\n`,
        {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
        },
    );

    try {
        await fs.rename(temporaryPath, this.tokenPath);
    } catch {
        await fs.rm(this.tokenPath, { force: true });
        await fs.rename(temporaryPath, this.tokenPath);
    }

    try {
        await fs.chmod(this.tokenPath, 0o600);
    } catch {
        // Windows does not enforce Unix permission bits in the same way.
    }
}

  async mergeAndSave(tokens: Credentials): Promise<void> {
    const existing = await this.load();

    const refreshToken =
        tokens.refresh_token ?? existing?.refresh_token;

    if (!refreshToken) {
        throw new Error(
        "A refresh token is required for persistent YouTube authorization.",
        );
    }

    await this.save({
        ...existing,
        ...tokens,
        refresh_token: refreshToken,
    });
    }
    
  async clear(): Promise<void> {
    await fs.rm(this.tokenPath, { force: true });
  }
}