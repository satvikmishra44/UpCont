import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  OAuth2Client,
} from "google-auth-library";
import type {
  youtube_v3,
} from "googleapis";

import type {
  YouTubeAuthPort,
} from "../src/auth/YouTubeAuthService.js";
import {
  YouTubePublisher,
} from "../src/adapters/youtube/YouTubePublisher.js";
import type {
  PublishRequest,
} from "../src/types.js";

function createAuthStub(): YouTubeAuthPort {
  return {
    getStatus: vi.fn().mockResolvedValue({
      state: "authorized",
      details:
        "Authorized for testing.",
    }),

    getAuthorizedClient:
      vi
        .fn()
        .mockResolvedValue(
          {} as OAuth2Client,
        ),
  };
}

function createRequest(
  overrides: Partial<PublishRequest> = {},
): PublishRequest {
  return {
    video: {
      fileName: "clip.mp4",
      absolutePath:
        "C:\\fake\\clip.mp4",
      sizeBytes: 1024,
      mimeType: "video/mp4",
    },
    title: "Milestone 2 test",
    description:
      "Private integration test",
    privacyStatus: "private",
    targetId: "UC_TEST_CHANNEL",
    tags: ["upcont", "test"],
    categoryId: "22",
    madeForKids: false,
    notifySubscribers: false,
    ...overrides,
  };
}

describe("YouTubePublisher", () => {
  it("rejects an empty title", async () => {
    const publisher =
      new YouTubePublisher(
        createAuthStub(),
      );

    const validation =
      await publisher.validatePublishRequest(
        createRequest({
          title: "   ",
        }),
      );

    expect(
      validation.ok,
    ).toBe(false);

    expect(
      validation.reasons.join(" "),
    ).toMatch(/title/i);
  });

  it("rejects a title longer than 100 characters", async () => {
    const publisher =
      new YouTubePublisher(
        createAuthStub(),
      );

    const validation =
      await publisher.validatePublishRequest(
        createRequest({
          title: "x".repeat(101),
        }),
      );

    expect(
      validation.ok,
    ).toBe(false);
  });

  it("warns for non-private uploads", async () => {
    const publisher =
      new YouTubePublisher(
        createAuthStub(),
      );

    const validation =
      await publisher.validatePublishRequest(
        createRequest({
          privacyStatus: "public",
        }),
      );

    expect(
      validation.warnings.join(" "),
    ).toMatch(/visible/i);
  });

  it("returns connected YouTube channels as publish targets", async () => {
    const channelsList =
      vi.fn().mockResolvedValue({
        data: {
          items: [
            {
              id: "UC_TEST_CHANNEL",
              snippet: {
                title:
                  "Test Channel",
              },
            },
          ],
        },
      });

    const fakeApi = {
      channels: {
        list: channelsList,
      },
      videos: {
        insert: vi.fn(),
      },
    } as unknown as youtube_v3.Youtube;

    const publisher =
      new YouTubePublisher(
        createAuthStub(),
        () => fakeApi,
      );

    const targets =
      await publisher.listTargets();

    expect(targets).toEqual([
      {
        platform: "youtube",
        id: "UC_TEST_CHANNEL",
        displayName:
          "Test Channel",
        targetType: "channel",
      },
    ]);

    expect(
      channelsList,
    ).toHaveBeenCalledWith({
      part: ["id", "snippet"],
      mine: true,
      maxResults: 50,
    });
  });

  it("does not call YouTube during dry run", async () => {
    const videosInsert = vi.fn();

    const fakeApi = {
      channels: {
        list: vi.fn(),
      },
      videos: {
        insert: videosInsert,
      },
    } as unknown as youtube_v3.Youtube;

    const publisher =
      new YouTubePublisher(
        createAuthStub(),
        () => fakeApi,
      );

    const result =
      await publisher.publish(
        createRequest(),
        true,
      );

    expect(
      result.status,
    ).toBe("dry_run");

    expect(
      videosInsert,
    ).not.toHaveBeenCalled();
  });
});