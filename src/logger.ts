import pino from "pino";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: ["clientSecret", "accessToken", "refreshToken", "*.clientSecret", "*.accessToken", "*.refreshToken"],
      censor: "[Redacted]",
    },
  },
  pino.destination(2),
);