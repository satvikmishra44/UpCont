import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  FacebookPagePublisher,
} from "../src/adapters/facebook/FacebookPagePublisher.js";
import {
  InstagramPublisher,
} from "../src/adapters/instagram/InstagramPublisher.js";
import type {
  MetaAuthPort,
} from "../src/meta/MetaAuthService.js";
import type {
  MetaAssetPort,
} from "../src/meta/MetaAssetService.js";
import type {
  MetaGraphPort,
} from "../src/meta/MetaGraphClient.js";
import type {
  PublishRequest,
} from "../src/types.js";

function createRequest(
  overrides:
    Partial<PublishRequest> = {},
): PublishRequest {
  return {
    video: {
      fileName: "clip.mp4",
      absolutePath:
        "C:\\fake\\clip.mp4",
      sizeBytes: 4096,
      mimeType: "video/mp4",
    },
    title:
      "Milestone 3 test",
    description:
      "Private source file, explicit public Meta test.",
    privacyStatus: "private",
    targetId: "target-id",

    tags: [],
    categoryId: "22",
    madeForKids: false,
    notifySubscribers: false,

    metaConfirmPublic: true,
    instagramShareToFeed: true,

    ...overrides,
  };
}

function createAuth(): MetaAuthPort {
  return {
    getStatus:
      vi.fn().mockResolvedValue({
        state: "authorized",
        details: "Authorized.",
      }),

    getUserAccessToken:
      vi
        .fn()
        .mockResolvedValue(
          "user-token",
        ),
  };
}

function createAssets(): MetaAssetPort {
  return {
    listPages:
      vi.fn().mockResolvedValue([
        {
          pageId: "page-id",
          pageName: "Test Page",
          pageAccessToken:
            "page-token",
          tasks: [
            "CREATE_CONTENT",
          ],
        },
      ]),

    listInstagramAccounts:
      vi.fn().mockResolvedValue([
        {
          instagramAccountId:
            "instagram-id",
          username:
            "testaccount",
          linkedPageId: "page-id",
          linkedPageName:
            "Test Page",
          pageAccessToken:
            "page-token",
        },
      ]),

    findPage:
      vi.fn().mockImplementation(
        async (id: string) =>
          id === "page-id"
            ? {
                pageId:
                  "page-id",
                pageName:
                  "Test Page",
                pageAccessToken:
                  "page-token",
                tasks: [
                  "CREATE_CONTENT",
                ],
              }
            : undefined,
      ),

    findInstagramAccount:
      vi.fn().mockImplementation(
        async (id: string) =>
          id === "instagram-id"
            ? {
                instagramAccountId:
                  "instagram-id",
                username:
                  "testaccount",
                linkedPageId:
                  "page-id",
                linkedPageName:
                  "Test Page",
                pageAccessToken:
                  "page-token",
              }
            : undefined,
      ),
  };
}

describe("FacebookPagePublisher", () => {
  it("does not upload during dry run", async () => {
    const postMultipart =
      vi.fn();

    const graph = {
      postMultipart,
    } as unknown as MetaGraphPort;

    const publisher =
      new FacebookPagePublisher(
        createAuth(),
        createAssets(),
        graph,
      );

    const result =
      await publisher.publish(
        createRequest({
          targetId: "page-id",
        }),
        true,
      );

    expect(
      result.status,
    ).toBe("dry_run");

    expect(
      postMultipart,
    ).not.toHaveBeenCalled();
  });

  it("uploads to the authorized Page target", async () => {
    const postMultipart =
      vi.fn().mockResolvedValue({
        id: "facebook-video-id",
      });

    const graph = {
      postMultipart,
    } as unknown as MetaGraphPort;

    const publisher =
      new FacebookPagePublisher(
        createAuth(),
        createAssets(),
        graph,
      );

    const result =
      await publisher.publish(
        createRequest({
          targetId: "page-id",
        }),
        false,
      );

    expect(
      result.status,
    ).toBe("success");

    expect(
      result.externalId,
    ).toBe(
      "facebook-video-id",
    );

    expect(
      postMultipart,
    ).toHaveBeenCalledTimes(1);
  });

  it("rejects an unavailable Page target", async () => {
    const graph = {
      postMultipart: vi.fn(),
    } as unknown as MetaGraphPort;

    const publisher =
      new FacebookPagePublisher(
        createAuth(),
        createAssets(),
        graph,
      );

    const result =
      await publisher.publish(
        createRequest({
          targetId:
            "unknown-page",
        }),
        false,
      );

    expect(
      result.status,
    ).toBe("failed");

    expect(
      result.errorCategory,
    ).toBe("target_mismatch");
  });
});

describe("InstagramPublisher", () => {
  it("performs create, upload, poll, publish, and permalink lookup", async () => {
    const postForm =
      vi.fn()
        .mockResolvedValueOnce({
          id: "container-id",
          uri:
            "https://rupload.facebook.com/ig-api-upload/v26.0/container-id",
        })
        .mockResolvedValueOnce({
          id: "media-id",
        });

    const get =
      vi.fn()
        .mockResolvedValueOnce({
          id: "container-id",
          status_code:
            "IN_PROGRESS",
        })
        .mockResolvedValueOnce({
          id: "container-id",
          status_code:
            "FINISHED",
        })
        .mockResolvedValueOnce({
          id: "media-id",
          permalink:
            "https://www.instagram.com/reel/test/",
        });

    const postBinaryUrl =
      vi.fn().mockResolvedValue({
        success: true,
      });

    const graph = {
      postForm,
      get,
      postBinaryUrl,
    } as unknown as MetaGraphPort;

    const sleep =
      vi.fn().mockResolvedValue(
        undefined,
      );

    const publisher =
      new InstagramPublisher(
        createAuth(),
        createAssets(),
        graph,
        1,
        10_000,
        sleep,
      );

    const result =
      await publisher.publish(
        createRequest({
          targetId:
            "instagram-id",
        }),
        false,
      );

    expect(
      result.status,
    ).toBe("success");

    expect(
      result.externalId,
    ).toBe("media-id");

    expect(
      result.externalUrl,
    ).toBe(
      "https://www.instagram.com/reel/test/",
    );

    expect(
      postBinaryUrl,
    ).toHaveBeenCalledTimes(1);

    expect(
      sleep,
    ).toHaveBeenCalledTimes(1);
  });

  it("does not create a container during dry run", async () => {
    const postForm =
      vi.fn();

    const graph = {
      postForm,
    } as unknown as MetaGraphPort;

    const publisher =
      new InstagramPublisher(
        createAuth(),
        createAssets(),
        graph,
        1,
        10_000,
        async () => {},
      );

    const result =
      await publisher.publish(
        createRequest({
          targetId:
            "instagram-id",
        }),
        true,
      );

    expect(
      result.status,
    ).toBe("dry_run");

    expect(
      postForm,
    ).not.toHaveBeenCalled();
  });

  it("rejects a missing Instagram target", async () => {
    const publisher =
      new InstagramPublisher(
        createAuth(),
        createAssets(),
        {} as MetaGraphPort,
        1,
        10_000,
        async () => {},
      );

    const validation =
      await publisher.validatePublishRequest(
        createRequest({
          targetId: undefined,
        }),
      );

    expect(
      validation.ok,
    ).toBe(false);
  });
});