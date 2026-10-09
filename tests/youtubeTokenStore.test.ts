import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  promises as fs,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  YouTubeTokenStore,
} from "../src/auth/YouTubeTokenStore.js";

let tempDirectory: string;
let tokenPath: string;
let store: YouTubeTokenStore;

beforeEach(async () => {
  tempDirectory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "upcont-youtube-token-",
      ),
    );

  tokenPath = path.join(
    tempDirectory,
    ".data",
    "youtube-token.json",
  );

  store = new YouTubeTokenStore(
    tokenPath,
  );
});

afterEach(async () => {
  await fs.rm(
    tempDirectory,
    {
      recursive: true,
      force: true,
    },
  );
});

describe("YouTubeTokenStore", () => {
  it("returns null when no token exists", async () => {
    await expect(
      store.load(),
    ).resolves.toBeNull();
  });

  it("creates the token directory and persists credentials", async () => {
    await store.save({
      access_token:
        "test-access-token",
      refresh_token:
        "test-refresh-token",
      expiry_date:
        Date.now() + 3_600_000,
      token_type: "Bearer",
    });

    expect(
      await store.exists(),
    ).toBe(true);

    const loaded =
      await store.load();

    expect(
      loaded?.refresh_token,
    ).toBe(
      "test-refresh-token",
    );
  });

  it("preserves an existing refresh token during access-token rotation", async () => {
    await store.save({
      access_token:
        "first-access-token",
      refresh_token:
        "stable-refresh-token",
    });

    await store.mergeAndSave({
      access_token:
        "second-access-token",
      expiry_date:
        Date.now() + 3_600_000,
    });

    const loaded =
      await store.load();

    expect(
      loaded?.access_token,
    ).toBe(
      "second-access-token",
    );

    expect(
      loaded?.refresh_token,
    ).toBe(
      "stable-refresh-token",
    );
  });

  it("rejects persistence without a refresh token", async () => {
    await expect(
      store.save({
        access_token:
          "temporary-only",
      }),
    ).rejects.toThrow(
      /refresh token/i,
    );
  });

  it("removes credentials on clear", async () => {
    await store.save({
      refresh_token:
        "test-refresh-token",
    });

    await store.clear();

    expect(
      await store.exists(),
    ).toBe(false);
  });
});