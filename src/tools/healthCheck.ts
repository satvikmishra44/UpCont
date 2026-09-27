import type { AppConfig } from "../config/env.js";

export interface HealthCheckOutput {
  serverName: string;
  version: string;
  environment: string;
  enabledPlatforms: string[];
  mockModeEnabled: boolean;
}

export function healthCheck(config: AppConfig, version: string): HealthCheckOutput {
  return {
    serverName: "upcont",
    version,
    environment: config.nodeEnv,
    enabledPlatforms: ["youtube", "facebook", "instagram"],
    mockModeEnabled: config.mockMode,
  };
}