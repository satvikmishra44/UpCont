import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MetaTokenStore,
} from "../src/meta/MetaTokenStore.js";

let temporaryDirectory: string;
let store: MetaTokenStore;

beforeEach(async () => {
  temporaryDirectory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "upcont-meta-token-",
      ),
    );

  store = new MetaTokenStore(
    path.join(
      temporaryDirectory,
      ".data",
      "meta-token.json",
    ),
  );
});

afterEach(async () => {
  await fs.rm(
    temporaryDirectory,
    {
      recursive: true,
      force: true,
    },
  );
});

describe("MetaTokenStore", () => {
  it("returns null when no authorization exists", async () => {
    await expect(
      store.load(),
    ).resolves.toBeNull();
  });

  it("creates directories and persists authorization", async () => {
    const now =
      new Date().toISOString();

    await store.save({
      version: 1,
      issuedAt: now,
      updatedAt: now,
      expiresAt:
        new Date(
          Date.now() + 60_000,
        ).toISOString(),
      userAccessToken:
        "test-user-token",
      tokenType: "bearer",
      scopes: [
        "pages_manage_posts",
      ],
    });

    expect(
      await store.exists(),
    ).toBe(true);

    const loaded =
      await store.load();

    expect(
      loaded?.userAccessToken,
    ).toBe("test-user-token");
  });

  it("removes authorization", async () => {
    const now =
      new Date().toISOString();

    await store.save({
      version: 1,
      issuedAt: now,
      updatedAt: now,
      userAccessToken:
        "test-user-token",
      scopes: [],
    });

    await store.clear();

    expect(
      await store.exists(),
    ).toBe(false);
  });
});