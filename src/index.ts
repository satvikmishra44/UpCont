import {McpServer} from "@modelcontextprotocol/server";
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import type {PlatformPublisher} from "./adapters/PlatformPublisher.js";
import {FacebookPagePublisherMock} from "./adapters/facebook/FacebookPagePublisher.mock.js";
import {FacebookPagePublisher} from "./adapters/facebook/FacebookPagePublisher.js";
import {InstagramPublisherMock} from "./adapters/instagram/InstagramPublisher.mock.js";
import {InstagramPublisher} from "./adapters/instagram/InstagramPublisher.js";
import {YouTubePublisherMock} from "./adapters/youtube/YouTubePublisher.mock.js";
import {YouTubePublisher} from "./adapters/youtube/YouTubePublisher.js";
import {YouTubeAuthService} from "./auth/YouTubeAuthService.js";
import {loadConfig} from "./config/env.js";
import {logger} from "./logger.js";
import {MetaAssetService} from "./meta/MetaAssetService.js";
import {MetaAuthService} from "./meta/MetaAuthService.js";
import {MetaGraphClient} from "./meta/MetaGraphClient.js";
import {GetPlatformConnectionStatusInputSchema, getPlatformConnectionStatus} from "./tools/getPlatformConnectionStatus.js";
import {ListPublishTargetsInputSchema, listPublishTargets} from "./tools/listPublishTargets.js";
import {OpenOAuthSetupInstructionsInputSchema, openOAuthSetupInstructions} from "./tools/openOAuthSetupInstructions.js";
import {PublishVideoInputSchema, publishVideo} from "./tools/publishVideo.js";
import {ValidateLocalVideoInputSchema, validateLocalVideo} from "./tools/validateLocalVideo.js";
import type {PlatformName} from "./types.js";

const VERSION = "0.3.0";

function successResult(data: unknown) {
  return {
    content: [{
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
}

function failureResult(error: unknown) {
  return {
    isError: true,
    content: [{
        type: "text" as const,
        text: JSON.stringify({error: error instanceof Error ? error.message : "Unexpected operation failure."}, null, 2),
      },
    ],
  };
}

function createServer(): McpServer {
  const config = loadConfig();

  if ((config.facebookMode === "real" || config.instagramMode === "real") && (!config.meta.appId || !config.meta.appSecret)) {
    throw new Error("Real Facebook or Instagram mode requires META_APP_ID and META_APP_SECRET.");
  }

  const youtubeAuth = new YouTubeAuthService(config.youtube);

  const metaGraph = new MetaGraphClient(config.meta.graphVersion, config.meta.appSecret ?? "mock-meta-secret");

  const metaAuth = new MetaAuthService(config.meta, metaGraph);

  const metaAssets = new MetaAssetService(metaAuth, metaGraph);

  const simulateFailure = process.env.UPCONT_SIMULATE_FAILURE === "true";

  const publishers: Record<PlatformName, PlatformPublisher> = {
    youtube: config.youtube.mode === "real" ? new YouTubePublisher(youtubeAuth) : new YouTubePublisherMock({simulateFailure}),

    facebook: config.facebookMode === "real" ? new FacebookPagePublisher(metaAuth, metaAssets, metaGraph) : new FacebookPagePublisherMock({simulateFailure}),

    instagram: config.instagramMode === "real" ? new InstagramPublisher(metaAuth, metaAssets, metaGraph, config.meta.instagramPollIntervalMs, config.meta.instagramProcessingTimeoutMs): new InstagramPublisherMock({simulateFailure}),
  };

  const server = new McpServer({name: "upcont", version: VERSION});

  server.registerTool("health_check", {
      title: "Health Check",
      description: "Returns safe UpCont runtime and provider-mode information.",
      inputSchema: z.object({})},
      async () => successResult({
          serverName: "upcont",
          version: VERSION,
          environment: config.nodeEnv,
          youtubeMode: config.youtube.mode,
          facebookMode: config.facebookMode,
          instagramMode: config.instagramMode,
          graphVersion: config.meta.graphVersion,
        }),
    );

  server.registerTool("youtube_start_oauth", {
      title: "Start YouTube OAuth",
      description: "Starts local YouTube authorization and returns the Google consent URL.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return successResult(await youtubeAuth.startAuthorization());
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("youtube_oauth_status", {
      title: "YouTube OAuth Status",
      description: "Returns YouTube authorization status without exposing credentials.",
      inputSchema: z.object({}),
    }, async () => {
      try {
        return successResult(await youtubeAuth.getStatus());
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("youtube_disconnect", {
      title: "Disconnect YouTube",
      description: "Revokes or removes local YouTube authorization.",
      inputSchema: z.object({confirmDisconnect: z.boolean(),
      revokeRemote: z.boolean().default(true),
      }),
    },

    async ({confirmDisconnect, revokeRemote}) => {
      if (!confirmDisconnect) {
        return failureResult(
          new Error("YouTube disconnect requires confirmDisconnect=true."),
        );
      }

      try {
        return successResult(await youtubeAuth.disconnect(revokeRemote));
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("meta_start_oauth", {
      title: "Connect Facebook and Instagram",
      description: "Starts Meta OAuth for Facebook Pages and linked Instagram Professional accounts.",
      inputSchema: z.object({}),
    }, async () => {
      try {
        return successResult(await metaAuth.startAuthorization());
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("meta_oauth_status", {
      title: "Meta OAuth Status",
      description: "Returns shared Facebook and Instagram authorization status.",
      inputSchema: z.object({}),
    }, async () => {
      try {
        return successResult(await metaAuth.getStatus());
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("meta_refresh_token", {
      title: "Refresh Meta Authorization",
      description: "Exchanges the existing valid Meta token for a renewed long-lived token.",
      inputSchema: z.object({confirmRefresh: z.boolean()}),
    }, async ({confirmRefresh}) => {
      if (!confirmRefresh) {
        return failureResult(new Error("Meta token refresh requires confirmRefresh=true."));
      }

      try {
        return successResult(await metaAuth.refreshAuthorization());
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("meta_disconnect", {
      title: "Disconnect Facebook and Instagram",
      description: "Optionally revokes Meta permissions and removes local authorization.",
      inputSchema: z.object({confirmDisconnect: z.boolean(), revokeRemote: z.boolean().default(true)}),
    },
    async ({confirmDisconnect, revokeRemote}) => {
      if (!confirmDisconnect) {
        return failureResult(new Error("Meta disconnect requires confirmDisconnect=true."));
      }

      try {
        return successResult(await metaAuth.disconnect(revokeRemote));
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("get_platform_connection_status", {
      title: "Platform Connection Status",
      description: "Returns connection status for one provider or all providers.",
      inputSchema: GetPlatformConnectionStatusInputSchema,
    }, async (input) => {
      try {
        return successResult(await getPlatformConnectionStatus(input, publishers));
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("validate_local_video", {
      title: "Validate Local Video",
      description: "Validates a local video inside the approved upload root.",
      inputSchema: ValidateLocalVideoInputSchema,
    }, async (input) => {
      try {
        return successResult(await validateLocalVideo(input, config));
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("list_publish_targets", {
      title: "List Publish Targets",
      description: "Lists authorized YouTube channels, Facebook Pages, and Instagram Professional accounts.",
      inputSchema: ListPublishTargetsInputSchema,
    }, async (input) => {
      try {
        return successResult(await listPublishTargets(input, publishers));
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool("publish_video", {
      title: "Publish Video",
      description: "Validates and sequentially publishes a local video to selected platforms.",
      inputSchema: PublishVideoInputSchema,
    }, async (input) => {
      try {
        return successResult(
          await publishVideo(input, config, publishers));
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool(
    "open_oauth_setup_instructions",
    {
      title: "OAuth Setup Instructions",
      description: "Returns provider-specific OAuth setup guidance.",
      inputSchema: OpenOAuthSetupInstructionsInputSchema,
    }, async (input) => {
      try {
        return successResult(openOAuthSetupInstructions(input));
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  process.once("SIGINT", () => {
    youtubeAuth.dispose();
    metaAuth.dispose();
  });

  process.once("SIGTERM", () => {
    youtubeAuth.dispose();
    metaAuth.dispose();
  });

  logger.info(
    {
      version: VERSION,
      youtube: config.youtube.mode,
      facebook: config.facebookMode,
      instagram: config.instagramMode,
    },
    "UpCont MCP server configured",
  );

  return server;
}

void serveStdio(createServer);

console.error(
  "UpCont MCP server running over stdio",
);