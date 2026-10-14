import type { MetaAuthPort } from "../../meta/MetaAuthService.js";
import type { MetaAssetPort } from "../../meta/MetaAssetService.js";
import {MetaApiError, type MetaGraphPort} from "../../meta/MetaGraphClient.js";
import type {ConnectionStatus, PlatformPublishResult, PublishRequest, PublishRequestValidation, PublishTarget} from "../../types.js";
import type { PlatformPublisher } from "../PlatformPublisher.js";

interface FacebookVideoResponse {
  id?: string;
}

function classifyMetaError(error: unknown): {category: string; message: string;} {
    if (error instanceof MetaApiError) {
        if (error.code === 190) {
            return {category: "authorization_expired", message: "Meta authorization is invalid or expired. Reconnect Meta."};
        }

        if (error.code === 10 || error.code === 200) {
            return {category: "permission_denied", message: "Meta denied the operation. Check Page tasks and approved permissions."};
        }

        if (error.transient) {
            return {category: "meta_transient_error", message: "Meta reported a temporary error. Retry later after checking whether the post was created."};
        }

        return {category: `meta_error_${error.code ?? "unknown"}`, message: error.message};
  }

  return {category: "facebook_unexpected_error", message: "An unexpected Facebook publishing error occurred."};
}

export class FacebookPagePublisher implements PlatformPublisher {
    readonly platform = "facebook" as const;

    constructor(private readonly auth: MetaAuthPort, private readonly assets: MetaAssetPort, private readonly graph: MetaGraphPort) {}

    async getConnectionStatus(): Promise<ConnectionStatus> {
        const authorization = await this.auth.getStatus();

        if (authorization.state !== "authorized") {
            return {platform: "facebook", state: authorization.state, details: authorization.details};
        }

        try {
            const pages = await this.assets.listPages();

            return {
                platform: "facebook",
                state: "authorized",
                details: pages.length > 0 ? `${pages.length} Facebook Page target(s) available.` : "Meta is authorized, but no manageable Facebook Page was found.",
            };
        } catch {
            return {
                platform: "facebook",
                state: "error",
                details: "Meta is authorized, but Facebook Pages could not be discovered.",
            };
        }
    }

    async listTargets(): Promise<PublishTarget[]> {
        const pages = await this.assets.listPages();

        return pages.map((page) => ({
            platform: "facebook" as const,
            id: page.pageId,
            displayName: page.pageName,
            targetType: "page" as const,
        }));
    }

    async validatePublishRequest(request: PublishRequest): Promise<PublishRequestValidation> {
        const reasons: string[] = [];
        const warnings: string[] = [];

        if (!request.targetId) {
            reasons.push("A Facebook Page target ID is required.");
        }

        if (!request.title.trim()) {
            reasons.push("A Facebook video title is required.");
        }

        if (!request.metaConfirmPublic) {
            warnings.push("A real Facebook Page upload requires metaConfirmPublic=true.");
        }

        warnings.push("YouTube privacyStatus does not make a Facebook Page upload private.");

        return {ok: reasons.length === 0, reasons, warnings};
    }

    async publish(request: PublishRequest, dryRun: boolean): Promise<PlatformPublishResult> {
        const validation = await this.validatePublishRequest(request);

        if (!validation.ok) {
            return {
                platform: "facebook",
                status: "failed",
                errorCategory: "invalid_request",
                errorMessage: validation.reasons.join("; "),
            };
        }

        if (dryRun) {
            return {
                platform: "facebook",
                status: "dry_run",
                message: "Facebook Page request validated. No network upload was performed.",
            };
        }

        if (!request.metaConfirmPublic) {
            return {
                platform: "facebook",
                status: "failed",
                errorCategory: "public_publish_not_confirmed",
                errorMessage: "Facebook publishing requires metaConfirmPublic=true.",
            };
        }

        try {
            const page = await this.assets.findPage(request.targetId!);

            if (!page) {
                return {
                    platform: "facebook",
                    status: "failed",
                    errorCategory: "target_mismatch",
                    errorMessage: "The selected Facebook Page is not available to the authorized Meta account.",
                };
            }

            if (page.tasks.length > 0 && !page.tasks.includes("CREATE_CONTENT")) {
                return {
                    platform: "facebook",
                    status: "failed",
                    errorCategory: "missing_page_task",
                    errorMessage: "The authorized Meta user does not have CREATE_CONTENT access for this Page.",
                };
            }

            const response = await this.graph.postMultipart<FacebookVideoResponse>(`/${encodeURIComponent(page.pageId)}/videos`, page.pageAccessToken, {
                    title: request.title.trim(),
                    description:
                    request.description,
                    published: true,
                },{
                    fieldName: "source",
                    absolutePath: request.video.absolutePath,
                    fileName: request.video.fileName,
                    mimeType: request.video.mimeType,
                });

            if (!response.id) {
                return {
                    platform: "facebook",
                    status: "failed",
                    errorCategory:"missing_video_id",
                    errorMessage:"Facebook accepted the request but returned no video ID.",
                };
            }

            return {
                platform: "facebook",
                status: "success",
                externalId: response.id,
                message: "Facebook accepted the Page video upload.",
            };
        } catch (error) {
            const classified = classifyMetaError(error);

            return {
                platform: "facebook",
                status: "failed",
                errorCategory: classified.category,
                errorMessage: classified.message,
            };
        }
    }
}