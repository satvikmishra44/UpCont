import * as z from "zod/v4";

export const OpenOAuthSetupInstructionsInputSchema = z.object({
  platform: z.enum(["youtube", "facebook", "instagram"]),
});

export type OpenOAuthSetupInstructionsInput = z.infer<
  typeof OpenOAuthSetupInstructionsInputSchema
>;

export interface OAuthSetupGuide {
  platform: string;
  checklist: string[];
  requiredEnvVars: string[];
  oauthFlowSummary: string;
  callbackSetup: string;
  docs: string[];
}

const GUIDES: Record<string, OAuthSetupGuide> = {
  youtube: {
    platform: "youtube",
    checklist: [
      "Create a Google Cloud project.",
      "Enable the YouTube Data API v3.",
      "Configure OAuth consent screen.",
      "Create OAuth client credentials.",
      "Store credentials in your local .env.",
      "Complete local authorization flow in Milestone 2.",
    ],
    requiredEnvVars: [
      "YOUTUBE_CLIENT_ID",
      "YOUTUBE_CLIENT_SECRET",
      "YOUTUBE_OAUTH_REDIRECT_URI",
    ],
    oauthFlowSummary:
      "Authorization Code flow using a local browser and a local callback helper.",
    callbackSetup:
      "A small local-only HTTP callback helper may be used later on localhost; it is separate from MCP stdio transport.",
    docs: [
      "https://developers.google.com/youtube/v3/guides/authentication",
      "https://developers.google.com/youtube/v3/guides/uploading_a_video",
    ],
  },
  facebook: {
    platform: "facebook",
    checklist: [
      "Create a Meta developer app.",
      "Add yourself as an app role.",
      "Configure Page-related permissions.",
      "Use only Facebook Pages, never personal profiles.",
      "Store app credentials in your local .env.",
    ],
    requiredEnvVars: [
      "META_APP_ID",
      "META_APP_SECRET",
      "META_OAUTH_REDIRECT_URI",
      "FACEBOOK_PAGE_ID",
    ],
    oauthFlowSummary:
      "Meta OAuth flow for a controlled Facebook Page you manage.",
    callbackSetup:
      "A local-only HTTP callback helper may be used later on localhost; separate from stdio transport.",
    docs: [
      "https://developers.facebook.com/docs/pages/publishing",
      "https://developers.facebook.com/docs/facebook-login/guides/access-tokens",
    ],
  },
  instagram: {
    platform: "instagram",
    checklist: [
      "Convert the account to Professional (Business or Creator).",
      "Link it to a Facebook Page.",
      "Use Meta OAuth with Instagram permissions.",
      "Confirm Content Publishing API requirements.",
      "Understand that local file paths may not be directly usable.",
    ],
    requiredEnvVars: [
      "META_APP_ID",
      "META_APP_SECRET",
      "META_OAUTH_REDIRECT_URI",
      "INSTAGRAM_ACCOUNT_ID",
    ],
    oauthFlowSummary:
      "Meta OAuth + create-media-container -> poll status -> publish flow.",
    callbackSetup:
      "A local-only HTTP callback helper may be used later on localhost; separate from stdio transport.",
    docs: [
      "https://developers.facebook.com/docs/instagram-api/guides/content-publishing",
      "https://developers.facebook.com/docs/instagram-api/getting-started",
    ],
  },
};

export function openOAuthSetupInstructions(
  input: OpenOAuthSetupInstructionsInput,
): OAuthSetupGuide {
  const guide = GUIDES[input.platform];
  if (!guide) {
    throw new Error(`No OAuth guide found for platform "${input.platform}".`);
  }
  return guide;
}