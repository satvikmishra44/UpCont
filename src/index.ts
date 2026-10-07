import { McpServer } from "@modelcontextprotocol/server"
import { serveStdio } from "@modelcontextprotocol/server/stdio"
import * as z from "zod/v4"

import { YouTubeAuthService } from "./auth/YouTubeAuthService.js";
import type { PlatformPublisher } from "./adapters/PlatformPublisher.js";
import { YouTubePublisher } from "./adapters/youtube/YouTubePublisher.js";
import {FacebookPagePublisherMock} from "./adapters/facebook/FacebookPagePublisher.mock.js";
import {InstagramPublisherMock} from "./adapters/instagram/InstagramPublisher.mock.js";
import {YouTubePublisherMock} from "./adapters/youtube/YouTubePublisher.mock.js";
import {loadConfig} from "./config/env.js";
import {logger} from "./logger.js";
import {GetPlatformConnectionStatusInputSchema, getPlatformConnectionStatus} from "./tools/getPlatformConnectionStatus.js";
import {ListPublishTargetsInputSchema, listPublishTargets} from "./tools/listPublishTargets.js";
import {OpenOAuthSetupInstructionsInputSchema, openOAuthSetupInstructions} from "./tools/openOAuthSetupInstructions.js";
import { PublishVideoInputSchema, publishVideo} from "./tools/publishVideo.js";
import { ValidateLocalVideoInputSchema, validateLocalVideo} from "./tools/validateLocalVideo.js";
import type {PlatformName} from "./types.js";

const VERSION = "0.2.0";

function successResult(data: unknown){
  return {content: [{type: "text" as const, text: JSON.stringify(data, null, 2)}]}
}

function failureResult(error: unknown){
  const message = error instanceof Error ? error.message : "Unexpected error occured";
  return {isError: true, content: [{type: "text" as const, text: JSON.stringify({error: message}, null, 2)}]}
}

function createServer() : McpServer{
  const config = loadConfig();
  const youtubeAuth = new YouTubeAuthService(config.youtube);
  const youtubePublisher : PlatformPublisher = config.youtube.mode === "real" ? new YouTubePublisher(youtubeAuth) : new YouTubePublisherMock({simulateFailure: process.env.UPCONT_SIMULATE_FAILURE === "true"});

  const publishers: Record<PlatformName, PlatformPublisher> = { youtube: youtubePublisher, facebook: new FacebookPagePublisherMock({simulateFailure: process.env.UPCONT_SIMULATE_FAILURE === "true"}), instagram: new InstagramPublisherMock({simulateFailure: process.env.UPCONT_SIMULATE_FAILURE === "true"})};

  const server = new McpServer({name: "upcont", version: VERSION});

  server.registerTool("health_check", {title: "Health Check", description: "Returns the sade runtime status of UpCont.", inputSchema: z.object({})}, async() => {
    return successResult({serverName: "upcont", version: VERSION, environment: config.nodeEnv, youtubeMode: config.youtube.mode, facebookMode: "mock", instagramMode: "mock"});
  })

  server.registerTool("youtube_start_oauth", {title: "Start YouTube OAuth", description: "Starts a temporary callback server and returns a Google Auth URL", inputSchema: z.object({})}, async() => {
    try{
      return successResult(await youtubeAuth.startAuthorization())
    } catch (error) {
      return failureResult(error);
    }
  })
}