import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { YouTubeAuthService } from "./auth/YouTubeAuthService.js";
import type { PlatformPublisher } from "./adapters/PlatformPublisher.js";
import { YouTubePublisher } from "./adapters/youtube/YouTubePublisher.js";
import { FacebookPagePublisherMock } from "./adapters/facebook/FacebookPagePublisher.mock.js";
import { InstagramPublisherMock } from "./adapters/instagram/InstagramPublisher.mock.js";
import { YouTubePublisherMock } from "./adapters/youtube/YouTubePublisher.mock.js";
import { loadConfig } from "./config/env.js";
import { logger } from "./logger.js";
import {GetPlatformConnectionStatusInputSchema, getPlatformConnectionStatus} from "./tools/getPlatformConnectionStatus.js";
import { ListPublishTargetsInputSchema, listPublishTargets} from "./tools/listPublishTargets.js";
import {OpenOAuthSetupInstructionsInputSchema, openOAuthSetupInstructions} from "./tools/openOAuthSetupInstructions.js";
import {
  PublishVideoInputSchema,
  publishVideo,
} from "./tools/publishVideo.js";
import {
  ValidateLocalVideoInputSchema,
  validateLocalVideo,
} from "./tools/validateLocalVideo.js";
import type { PlatformName } from "./types.js";

const VERSION = "0.2.0";

interface Runtime {
  config: ReturnType<typeof loadConfig>;
  youtubeAuth: YouTubeAuthService;
  publishers: Record<PlatformName, PlatformPublisher>;
}

function successResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function failureResult(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected error occurred";

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
  };
}

function fatal(label: string, error: unknown): never {
  console.error(
    `[UpCont] ${label}:`,
    error instanceof Error
      ? (error.stack ?? error.message)
      : error,
  );

  process.exit(1);
}

function buildRuntime(): Runtime {
  const config = loadConfig();
  const youtubeAuth = new YouTubeAuthService(config.youtube);
  const simulate =
    process.env.UPCONT_SIMULATE_FAILURE === "true";

  const publishers: Record<PlatformName, PlatformPublisher> = {
    youtube:
      config.youtube.mode === "real"
        ? new YouTubePublisher(youtubeAuth)
        : new YouTubePublisherMock({
            simulateFailure: simulate,
          }),

    facebook: new FacebookPagePublisherMock({
      simulateFailure: simulate,
    }),

    instagram: new InstagramPublisherMock({
      simulateFailure: simulate,
    }),
  };

  logger.info(
    {
      version: VERSION,
      youtubeMode: config.youtube.mode,
    },
    "UpCont MCP Server Configured",
  );

  return {
    config,
    youtubeAuth,
    publishers,
  };
}

function createServer(runtime: Runtime): McpServer {
  const { config, youtubeAuth, publishers } = runtime;

  const server = new McpServer({
    name: "upcont",
    version: VERSION,
  });

  server.registerTool(
    "health_check",
    {
      title: "Health Check",
      description: "Returns the safe runtime status of UpCont.",
      inputSchema: z.object({}),
    },
    async () => {
      return successResult({
        serverName: "upcont",
        version: VERSION,
        environment: config.nodeEnv,
        youtubeMode: config.youtube.mode,
        facebookMode: "mock",
        instagramMode: "mock",
      });
    },
  );

  server.registerTool(
    "youtube_start_oauth",
    {
      title: "Start YouTube OAuth",
      description:
        "Starts a temporary callback server and returns a Google Auth URL.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return successResult(
          await youtubeAuth.startAuthorization(),
        );
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool(
    "youtube_oauth_status",
    {
      title: "YouTube OAuth Status",
      description:
        "Returns the current YouTube authorization state without exposing tokens.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return successResult(await youtubeAuth.getStatus());
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool(
    "youtube_disconnect",
    {
      title: "YouTube Disconnect",
      description:
        "Disconnects the current YouTube account and revokes tokens.",
      inputSchema: z.object({
        confirmDisconnect: z.boolean(),
        revokeRemote: z.boolean().default(true),
      }),
    },
    async ({ confirmDisconnect, revokeRemote }) => {
      if (!confirmDisconnect) {
        return failureResult(
          new Error(
            "YouTube disconnect not confirmed. Set confirmDisconnect to true to proceed.",
          ),
        );
      }

      try {
        return successResult(
          await youtubeAuth.disconnect(revokeRemote),
        );
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool(
    "get_platform_connection_status",
    {
      title: "Get Platform Connection Status",
      description:
        "Returns the connection status for a given platform.",
      inputSchema: GetPlatformConnectionStatusInputSchema,
    },
    async (input) => {
      try {
        return successResult(
          await getPlatformConnectionStatus(input, publishers),
        );
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool(
    "validate_local_video",
    {
      title: "Validate Local Video",
      description:
        "Validates a local video file for publishing.",
      inputSchema: ValidateLocalVideoInputSchema,
    },
    async (input) => {
      try {
        return successResult(
          await validateLocalVideo(input, config),
        );
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool(
    "list_publish_targets",
    {
      title: "List Publish Targets",
      description:
        "Lists authorized or mock publishing targets.",
      inputSchema: ListPublishTargetsInputSchema,
    },
    async (input) => {
      try {
        return successResult(
          await listPublishTargets(input, publishers),
        );
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool(
    "publish_video",
    {
      title: "Publish Video",
      description:
        "Validates and publishes a local video sequentially. Dry run is enabled by default.",
      inputSchema: PublishVideoInputSchema,
    },
    async (input) => {
      try {
        return successResult(
          await publishVideo(input, config, publishers),
        );
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  server.registerTool(
    "open_oauth_setup_instructions",
    {
      title: "OAuth Setup Instructions",
      description:
        "Returns OAuth setup guidance for a selected platform.",
      inputSchema: OpenOAuthSetupInstructionsInputSchema,
    },
    async (input) => {
      try {
        return successResult(
          await openOAuthSetupInstructions(input),
        );
      } catch (error) {
        return failureResult(error);
      }
    },
  );

  return server;
}

process.on("uncaughtException", (error) => {
  fatal("Uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  fatal("Unhandled rejection", error);
});

let runtime: Runtime;

try {
  runtime = buildRuntime();
} catch (error) {
  fatal("Startup/config error", error);
}

const handle = serveStdio(
  () => {
    try {
      return createServer(runtime);
    } catch (error) {
      console.error(
        "[UpCont] Tool registration failed:",
        error,
      );

      throw error;
    }
  },
  {
    onerror: (error) => {
      console.error("[UpCont] MCP error:", error);
    },
  },
);

let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  runtime.youtubeAuth.dispose();

  void handle.close();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

console.error("[UpCont] ready on stdio");