import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { loadConfig } from "./config/env.js";
import { logger } from "./logger.js";
import type { PlatformName } from "./types.js";
import type { PlatformPublisher } from "./adapters/PlatformPublisher.js";

import { YouTubePublisherMock } from "./adapters/youtube/YouTubePublisher.mock.js";
import { FacebookPagePublisherMock } from "./adapters/facebook/FacebookPagePublisher.mock.js";
import { InstagramPublisherMock } from "./adapters/instagram/InstagramPublisher.mock.js";

import { healthCheck } from "./tools/healthCheck.js";
import {
  GetPlatformConnectionStatusInputSchema,
  getPlatformConnectionStatus,
} from "./tools/getPlatformConnectionStatus.js";
import {
  ValidateLocalVideoInputSchema,
  validateLocalVideo,
} from "./tools/validateLocalVideo.js";
import {
  ListPublishTargetsInputSchema,
  listPublishTargets,
} from "./tools/listPublishTargets.js";
import {
  PublishVideoInputSchema,
  publishVideo,
} from "./tools/publishVideo.js";
import {
  OpenOAuthSetupInstructionsInputSchema,
  openOAuthSetupInstructions,
} from "./tools/openOAuthSetupInstructions.js";

const VERSION = "0.1.0";

function toTextResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function main() {
  const { config } = loadConfig();

  logger.info(
    { mockMode: config.mockMode, environment: config.nodeEnv },
    "UpCont starting",
  );

  const simulateFailure = process.env.UPCONT_SIMULATE_FAILURE === "true";

  const publishers: Record<PlatformName, PlatformPublisher> = {
    youtube: new YouTubePublisherMock({ simulateFailure }),
    facebook: new FacebookPagePublisherMock({ simulateFailure }),
    instagram: new InstagramPublisherMock({ simulateFailure }),
  };

  const server = new McpServer({
    name: "upcont",
    version: VERSION,
  });

  server.registerTool(
    "health_check",
    {
      title: "Health Check",
      description:
        "Returns safe server name, version, environment, enabled platforms, and mock mode status.",
      inputSchema: {},
    },
    async () => {
      return toTextResult(healthCheck(config, VERSION));
    },
  );

  server.registerTool(
    "get_platform_connection_status",
    {
      title: "Get Platform Connection Status",
      description:
        "Returns connection status for one selected platform or all platforms.",
      inputSchema: GetPlatformConnectionStatusInputSchema.shape,
    },
    async (input) => {
      return toTextResult(await getPlatformConnectionStatus(input, publishers));
    },
  );

  server.registerTool(
    "validate_local_video",
    {
      title: "Validate Local Video",
      description:
        "Validates one local video inside VIDEO_UPLOAD_ROOT for one or more selected platforms.",
      inputSchema: ValidateLocalVideoInputSchema.shape,
    },
    async (input) => {
      return toTextResult(await validateLocalVideo(input, config));
    },
  );

  server.registerTool(
    "list_publish_targets",
    {
      title: "List Publish Targets",
      description:
        "Lists available mock or authorized publishing targets for one platform or all.",
      inputSchema: ListPublishTargetsInputSchema.shape,
    },
    async (input) => {
      return toTextResult(await listPublishTargets(input, publishers));
    },
  );

  server.registerTool(
    "publish_video",
    {
      title: "Publish Video",
      description:
        "Validates and then publishes sequentially to selected platforms. Defaults to safe dry run mode.",
      inputSchema: PublishVideoInputSchema.shape,
    },
    async (input) => {
      return toTextResult(await publishVideo(input, config, publishers));
    },
  );

  server.registerTool(
    "open_oauth_setup_instructions",
    {
      title: "Open OAuth Setup Instructions",
      description:
        "Returns a safe checklist for setting up OAuth for the selected platform.",
      inputSchema: OpenOAuthSetupInstructionsInputSchema.shape,
    },
    async (input) => {
      return toTextResult(openOAuthSetupInstructions(input));
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("UpCont MCP server connected via stdio");
}

main().catch((error) => {
  logger.error({ error }, "Fatal startup error");
  process.exit(1);
});