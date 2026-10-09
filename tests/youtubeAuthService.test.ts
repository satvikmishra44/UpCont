import {
  describe,
  expect,
  it,
} from "vitest";
import {
  OAuth2Client,
} from "google-auth-library";

import {
  buildYouTubeAuthorizationUrl,
  YOUTUBE_OAUTH_SCOPES,
} from "../src/auth/YouTubeAuthService.js";

describe("YouTube OAuth URL", () => {
  it("requests offline access, state protection, and required scopes", () => {
    const client =
      new OAuth2Client(
        "test-client-id",
        "test-client-secret",
        "http://127.0.0.1:53682/oauth2/callback",
      );

    const url =
      new URL(
        buildYouTubeAuthorizationUrl(
          client,
          "secure-state-value",
        ),
      );

    expect(
      url.searchParams.get(
        "access_type",
      ),
    ).toBe("offline");

    expect(
      url.searchParams.get("state"),
    ).toBe(
      "secure-state-value",
    );

    expect(
      url.searchParams.get("prompt"),
    ).toBe("consent");

    const scopes = (
      url.searchParams.get(
        "scope",
      ) ?? ""
    ).split(" ");

    expect(scopes).toEqual(
      expect.arrayContaining([
        ...YOUTUBE_OAUTH_SCOPES,
      ]),
    );
  });
});