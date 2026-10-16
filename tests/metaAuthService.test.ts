import {
  createHmac,
} from "node:crypto";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildMetaAuthorizationUrl,
} from "../src/meta/MetaAuthService.js";
import {
  createAppSecretProof,
} from "../src/meta/MetaGraphClient.js";

describe("Meta authorization", () => {
  it("builds a Facebook Login for Business URL", () => {
    const url = new URL(
      buildMetaAuthorizationUrl(
        {
          appId: "123456",
          redirectUri:
            "http://127.0.0.1:53683/meta/oauth/callback",
          graphVersion: "v26.0",
          loginConfigId:
            "987654",
        },
        "secure-state",
      ),
    );

    expect(
      url.searchParams.get(
        "client_id",
      ),
    ).toBe("123456");

    expect(
      url.searchParams.get(
        "config_id",
      ),
    ).toBe("987654");

    expect(
      url.searchParams.get(
        "state",
      ),
    ).toBe("secure-state");

    expect(
      url.searchParams.get(
        "response_type",
      ),
    ).toBe("code");
  });

  it("creates an HMAC-SHA256 app secret proof", () => {
    const expected =
      createHmac(
        "sha256",
        "test-secret",
      )
        .update("test-token")
        .digest("hex");

    expect(
      createAppSecretProof(
        "test-token",
        "test-secret",
      ),
    ).toBe(expected);
  });
});