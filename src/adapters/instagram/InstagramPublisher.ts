// import type { MetaAuthPort } from "../../meta/MetaAuthService.js";
// import type { MetaAssetPort } from "../../meta/MetaAssetService.js";
// import { MetaApiError, type MetaGraphPort } from "../../meta/MetaGraphClient.js"; 
// import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishRequestValidation, PublishTarget } from "../../types.js";
// import type { PlatformPublisher } from "../PlatformPublisher.js";

// interface InstagramContainerResponse{
//     id?: string;
//     uri?: string;
// }

// interface InstagramUploadResponse{
//     success?: boolean 
// }

// interface InstagramContainerStatus{
//     id?: string;
//     status_code?: "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";
//     status?: string;
// }

// interface InstagramPublishResponse{
//     id?: string;
// }

// interface InstagramMediaResponse {
//   id?: string;
//   permalink?: string;
// }

// type SleepFunction = (milliseconds: number) => Promise<void>;

// const defaultSleep: SleepFunction = (milliseconds) => new Promise((resolve) => {
//     setTimeout(resolve, milliseconds);
// })

// function buildCaption(request: PublishRequest): string{
//     const title = request.title.trim();
//     const description = request.description.trim();

//     if(!description){
//         return title;
//     }

//     return `${title}\n\n${description}`;
// }

// function classifyInstagramError(
//   error: unknown,
//   step: string,
// ): { category: string; message: string } {
//   if (error instanceof MetaApiError) {
//     const d = error.diagnostics;
//     const detail =
//       `[step=${step}] ${error.message}` +
//       ` | http=${d?.httpStatus ?? "none"}` +
//       ` | net=${d?.networkCode ?? "none"}` +
//       ` | code=${error.code ?? "none"}/${error.subcode ?? "none"}` +
//       ` | url=${d?.url ?? "n/a"}` +
//       ` | trace=${d?.fbtraceId ?? "n/a"}` +
//       ` | body=${d?.body ?? "n/a"}`;

//     console.error("[instagram-publish-failure]", detail);

//     if (error.code === 190) {
//       return { category: "authorization_expired", message: detail };
//     }
//     if (error.code === 10 || error.code === 200) {
//       return { category: "permission_denied", message: detail };
//     }
//     return {
//       category: `meta_error_${error.code ?? "unknown"}`,
//       message: detail,
//     };
//   }

//   const text = error instanceof Error ? error.message : "unknown";
//   console.error("[instagram-publish-failure]", `[step=${step}] ${text}`);

//   return {
//     category: "instagram_unexpected_error",
//     message: `[step=${step}] ${text}`,
//   };
// }

// export class InstagramPublisher implements PlatformPublisher{
//     readonly platform = "instagram" as const;

//     constructor(private readonly auth: MetaAuthPort, private readonly assets: MetaAssetPort, private readonly graph: MetaGraphPort, private readonly pollIntervalMs: number, private readonly processingTimeoutMs: number, private readonly sleep: SleepFunction = defaultSleep) {}

//     async getConnectionStatus(): Promise<ConnectionStatus> {
//         const authorization = await this.auth.getStatus();

//         if (authorization.state !== "authorized") {
//             return {
//                 platform: "instagram",
//                 state: authorization.state,
//                 details: authorization.details,
//             };
//         }

//         try {
//             const accounts = await this.assets.listInstagramAccounts();

//             return {
//                 platform: "instagram",
//                 state: "authorized",
//                 details: accounts.length > 0 ? `${accounts.length} Instagram Professional target(s) available.` : "Meta is authorized, but no linked Instagram Professional account was found.",
//             };
//         } catch {
//             return {
//                 platform: "instagram",
//                 state: "error",
//                 details: "Meta is authorized, but Instagram targets could not be discovered.",
//             };
//         }
//     }

//     async listTargets(): Promise<PublishTarget[]> {
//         const accounts = await this.assets.listInstagramAccounts();

//         return accounts.map((account) => ({
//             platform: "instagram" as const,
//             id: account.instagramAccountId,
//             displayName: `@${account.username} via ${account.linkedPageName}`,
//             targetType: "account" as const,
//         }));
//     }

//     async validatePublishRequest(request: PublishRequest) : Promise<PublishRequestValidation>{
//         const reasons: string[] = [];
//         const warnings: string[] = [];

//         if(!request.targetId){
//             reasons.push("An Instagram Professional account target ID is required.")
//         }

//         const caption = buildCaption(request);

//         if (!caption) {
//             reasons.push("An Instagram caption is required.");
//         }

//         if (caption.length > 2200) {
//             reasons.push("The combined Instagram title and description cannot exceed 2200 characters.");
//         }

//         if (!request.metaConfirmPublic) {
//             warnings.push("A real Instagram publish requires metaConfirmPublic=true.");
//         }

//         if (!request.instagramShareToFeed) {
//             warnings.push("The Reel will not be shared to the main Instagram feed.");
//         }

//         warnings.push("YouTube privacyStatus does not make an Instagram Reel private.");

//         return {ok: reasons.length === 0, reasons, warnings}
//     }

//     async publish(request: PublishRequest, dryRun: boolean) : Promise<PlatformPublishResult>{
//         const validation = await this.validatePublishRequest(request);

//         if(!validation.ok){
//             return{
//                 platform: "instagram",
//                 status: "failed",
//                 errorCategory: "invalid_request",
//                 errorMessage: validation.reasons.join("; ")
//             };
//         }

//         if(dryRun){
//             return {
//                 platform: "instagram",
//                 status: "dry_run",
//                 message: "Instagram Reel request validated. No container or upload was created"
//             }
//         }

//         if(!request.metaConfirmPublic){
//             return{
//                 platform: "instagram",
//                 status: "failed",
//                 errorCategory: "public_publish_not_confirmed",
//                 errorMessage: "Instagram publishing requires metaConfirmPublic=true"
//             };
//         }

//         let step = "find_account";
//         try{
//             const account = await this.assets.findInstagramAccount(request.targetId!);

//             if (!account) {
//                 return {
//                     platform: "instagram",
//                     status: "failed",
//                     errorCategory: "target_mismatch",
//                     errorMessage: "The selected Instagram account is not linked to an authorized Facebook Page.",
//                 };
//             }

//             step = "create_container";

//             const container = await this.graph.postForm<InstagramContainerResponse>(`/${encodeURIComponent(account.instagramAccountId)}/media`, account.pageAccessToken, {
//                     media_type: "REELS",
//                     upload_type: "resumable",
//                     caption: buildCaption(request),
//                     share_to_feed: request.instagramShareToFeed,
//             })

//             if(!container.id || !container.uri){
//                 return{
//                     platform: "instagram",
//                     status: "failed",
//                     errorCategory: "container_creation_failed",
//                     errorMessage: "Instagram did not return a complete resumable upload container."
//                 }
//             }

//             step = "upload_binary";

//             const upload = await this.graph.postBinaryUrl<InstagramUploadResponse>(
//                 container.uri,
//                 account.pageAccessToken,
//                 request.video.absolutePath,
//                 request.video.sizeBytes,
//                 request.video.mimeType,
//             );

//             if (upload.success !== true) {
//                 return {
//                     platform: "instagram",
//                     status: "failed",
//                     errorCategory:"binary_upload_failed",
//                     errorMessage: "Instagram did not confirm the binary upload.",
//                 };
//             }

//             step = "poll_status";
//             await this.waitUntilReady(container.id, account.pageAccessToken)

//             step = "media_publish";
//             const published = await this.graph.postForm<InstagramPublishResponse>(`/${encodeURIComponent(account.instagramAccountId)}/media_publish`, account.pageAccessToken, {creation_id:container.id});

//             if (!published.id) {
//                 return {
//                     platform: "instagram",
//                     status: "failed",
//                     errorCategory:"missing_media_id",
//                     errorMessage: "Instagram published the container but returned no media ID.",
//                 };
//             }

//             let permalink: string | undefined;

//             try {
//                 const media = await this.graph.get<InstagramMediaResponse>(`/${encodeURIComponent(published.id)}`, account.pageAccessToken,{fields: "id,permalink"});
//                 permalink = media.permalink;
//             } catch {
//                 // Publishing succeeded; permalink lookup is optional.
//             }

//             return {
//                 platform: "instagram",
//                 status: "success",
//                 externalId: published.id,
//                 ...(permalink !== undefined ? {externalUrl: permalink}: {}),
//                 message:"Instagram accepted and published the Reel.",
//             };
//         } catch (error) {
//             const classified = classifyInstagramError(error, step);

//             return {
//                 platform: "instagram",
//                 status: "failed",
//                 errorCategory: classified.category,
//                 errorMessage: classified.message,
//             };
//         }
//     }

//     private async waitUntilReady(containerId: string, pageAccessToken: string): Promise<void> {
//         const deadline = Date.now() + this.processingTimeoutMs;

//         while (Date.now() < deadline) {
//             const status = await this.graph.get<InstagramContainerStatus>(`/${encodeURIComponent(containerId)}`, pageAccessToken,
//                 {
//                     fields: "id,status_code,status",
//                 });

//             if (status.status_code === "FINISHED" || status.status_code === "PUBLISHED") {
//                 return;
//             }

//             if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
//                 throw new Error(`Instagram container failed: ${status.status ?? status.status_code}`);
//             }

//             await this.sleep(this.pollIntervalMs);
//         }

//         throw new Error("Instagram media processing timed out before the container became publishable.");
//     }
// }

import type { MetaAuthPort } from "../../meta/MetaAuthService.js";

import type { MetaAssetPort } from "../../meta/MetaAssetService.js";

import { MetaApiError, type MetaGraphPort } from "../../meta/MetaGraphClient.js"; 

import type { ConnectionStatus, PlatformPublishResult, PublishRequest, PublishRequestValidation, PublishTarget } from "../../types.js";

import type { PlatformPublisher } from "../PlatformPublisher.js";



interface InstagramContainerResponse {

    id?: string;

    uri?: string;

}



interface InstagramUploadResponse {

    success?: boolean 

}



interface InstagramContainerStatus {

    id?: string;

    status_code?: "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

    status?: string;

}



interface InstagramPublishResponse {

    id?: string;

}



interface InstagramMediaResponse {

  id?: string;

  permalink?: string;

}



type SleepFunction = (milliseconds: number) => Promise<void>;



const defaultSleep: SleepFunction = (milliseconds) => new Promise((resolve) => {

    setTimeout(resolve, milliseconds);

})



function buildCaption(request: PublishRequest): string{

    const title = request.title.trim();

    const description = request.description.trim();



    if(!description){

        return title;

    }



    return `${title}\n\n${description}`;

}



function classifyInstagramError(

  error: unknown,

  step: string,

): { category: string; message: string } {

  if (error instanceof MetaApiError) {

    const d = error.diagnostics;

    const detail =

      `[step=${step}] ${error.message}` +

      ` | http=${d?.httpStatus ?? "none"}` +

      ` | net=${d?.networkCode ?? "none"}` +

      ` | code=${error.code ?? "none"}/${error.subcode ?? "none"}` +

      ` | url=${d?.url ?? "n/a"}` +

      ` | trace=${d?.fbtraceId ?? "n/a"}` +

      ` | body=${d?.body ?? "n/a"}`;



    console.error("[instagram-publish-failure]", detail);



    if (error.code === 190) {

      return { category: "authorization_expired", message: detail };

    }

    if (error.code === 10 || error.code === 200) {

      return { category: "permission_denied", message: detail };

    }

    return {

      category: `meta_error_${error.code ?? "unknown"}`,

      message: detail,

    };

  }



  const text = error instanceof Error ? error.message : "unknown";

  console.error("[instagram-publish-failure]", `[step=${step}] ${text}`);



  return {

    category: "instagram_unexpected_error",

    message: `[step=${step}] ${text}`,

  };

}



export class InstagramPublisher implements PlatformPublisher{

    readonly platform = "instagram" as const;



    constructor(private readonly auth: MetaAuthPort, private readonly assets: MetaAssetPort, private readonly graph: MetaGraphPort, private readonly pollIntervalMs: number, private readonly processingTimeoutMs: number, private readonly sleep: SleepFunction = defaultSleep) {}



    async getConnectionStatus(): Promise<ConnectionStatus> {

        const authorization = await this.auth.getStatus();



        if (authorization.state !== "authorized") {

            return {

                platform: "instagram",

                state: authorization.state,

                details: authorization.details,

            };

        }



        try {

            const accounts = await this.assets.listInstagramAccounts();



            return {

                platform: "instagram",

                state: "authorized",

                details: accounts.length > 0 ? `${accounts.length} Instagram Professional target(s) available.` : "Meta is authorized, but no linked Instagram Professional account was found.",

            };

        } catch {

            return {

                platform: "instagram",

                state: "error",

                details: "Meta is authorized, but Instagram targets could not be discovered.",

            };

        }

    }



    async listTargets(): Promise<PublishTarget[]> {

        const accounts = await this.assets.listInstagramAccounts();



        return accounts.map((account) => ({

            platform: "instagram" as const,

            id: account.instagramAccountId,

            displayName: `@${account.username} via ${account.linkedPageName}`,

            targetType: "account" as const,

        }));

    }



    async validatePublishRequest(request: PublishRequest) : Promise<PublishRequestValidation>{

        const reasons: string[] = [];

        const warnings: string[] = [];



        if(!request.targetId){

            reasons.push("An Instagram Professional account target ID is required.")

        }



        const caption = buildCaption(request);



        if (!caption) {

            reasons.push("An Instagram caption is required.");

        }



        if (caption.length > 2200) {

            reasons.push("The combined Instagram title and description cannot exceed 2200 characters.");

        }



        if (!request.metaConfirmPublic) {

            warnings.push("A real Instagram publish requires metaConfirmPublic=true.");

        }



        if (!request.instagramShareToFeed) {

            warnings.push("The Reel will not be shared to the main Instagram feed.");

        }



        warnings.push("YouTube privacyStatus does not make an Instagram Reel private.");



        return {ok: reasons.length === 0, reasons, warnings}

    }



    async publish(request: PublishRequest, dryRun: boolean) : Promise<PlatformPublishResult>{

        const validation = await this.validatePublishRequest(request);



        if(!validation.ok){

            return{

                platform: "instagram",

                status: "failed",

                errorCategory: "invalid_request",

                errorMessage: validation.reasons.join("; ")

            };

        }



        if(dryRun){

            return {

                platform: "instagram",

                status: "dry_run",

                message: "Instagram Reel request validated. No container or upload was created"

            }

        }



        if(!request.metaConfirmPublic){

            return{

                platform: "instagram",

                status: "failed",

                errorCategory: "public_publish_not_confirmed",

                errorMessage: "Instagram publishing requires metaConfirmPublic=true"

            };

        }



        let step = "find_account";
        let account: Awaited<ReturnType<MetaAssetPort["findInstagramAccount"]>> | undefined;
        let container: InstagramContainerResponse | undefined;

        try {
            account = await this.assets.findInstagramAccount(request.targetId!);



            if (!account) {

                return {

                    platform: "instagram",

                    status: "failed",

                    errorCategory: "target_mismatch",

                    errorMessage: "The selected Instagram account is not linked to an authorized Facebook Page.",

                };

            }



            step = "create_container";



            container = await this.graph.postForm<InstagramContainerResponse>(`/${encodeURIComponent(account.instagramAccountId)}/media`, account.pageAccessToken, {

                    media_type: "REELS",

                    upload_type: "resumable",

                    caption: buildCaption(request),

                    share_to_feed: request.instagramShareToFeed,
            });

            console.error(
                JSON.stringify({
                    step: "instagram_container_created",
                    containerId: container.id,
                    uploadUri: container.uri,
                    fileName: request.video.fileName,
                    fileSize: request.video.sizeBytes,
                    mimeType: request.video.mimeType,
                }),
            );



            if(!container.id || !container.uri){

                return{

                    platform: "instagram",

                    status: "failed",

                    errorCategory: "container_creation_failed",

                    errorMessage: "Instagram did not return a complete resumable upload container."

                }

            }



            step = "upload_binary";



            const upload = await this.graph.postBinaryUrl<InstagramUploadResponse>(

                container.uri,

                account.pageAccessToken,

                request.video.absolutePath,

                request.video.sizeBytes,

                request.video.mimeType,

            );



            if (upload.success !== true) {

                return {

                    platform: "instagram",

                    status: "failed",

                    errorCategory:"binary_upload_failed",

                    errorMessage: "Instagram did not confirm the binary upload.",

                };

            }



            step = "poll_status";

            await this.waitUntilReady(container.id, account.pageAccessToken)



            step = "media_publish";

            const published = await this.graph.postForm<InstagramPublishResponse>(`/${encodeURIComponent(account.instagramAccountId)}/media_publish`, account.pageAccessToken, {creation_id:container.id});



            if (!published.id) {

                return {

                    platform: "instagram",

                    status: "failed",

                    errorCategory:"missing_media_id",

                    errorMessage: "Instagram published the container but returned no media ID.",

                };

            }



            let permalink: string | undefined;



            try {

                const media = await this.graph.get<InstagramMediaResponse>(`/${encodeURIComponent(published.id)}`, account.pageAccessToken,{fields: "id,permalink"});

                permalink = media.permalink;

            } catch {

                // Publishing succeeded; permalink lookup is optional.*

            }



            return {

                platform: "instagram",

                status: "success",

                externalId: published.id,

                ...(permalink !== undefined ? {externalUrl: permalink}: {}),

                message:"Instagram accepted and published the Reel.",

            };

        } catch (error) {
            if (container?.id && account) {
                try {
                    const debugStatus = await this.graph.get<InstagramContainerStatus>(
                        `/${encodeURIComponent(container.id)}`,
                        account.pageAccessToken,
                        {
                            fields: "id,status_code,status,video_status",
                        } as Record<string, string>,
                    );
                    console.error(
                        JSON.stringify({
                            step: "instagram_container_debug_status",
                            containerId: container.id,
                            debugStatus,
                        }),
                    );
                } catch {
                    // Ignore debug fetch failure.
                }
            }

            const classified = classifyInstagramError(error, step);



            return {

                platform: "instagram",

                status: "failed",

                errorCategory: classified.category,

                errorMessage: classified.message,

            };

        }

    }



    private async waitUntilReady(containerId: string, pageAccessToken: string): Promise<void> {

        const deadline = Date.now() + this.processingTimeoutMs;



        while (Date.now() < deadline) {

            const status = await this.graph.get<InstagramContainerStatus>(`/${encodeURIComponent(containerId)}`, pageAccessToken,

                {

                    fields: "id,status_code,status",

                });



            if (status.status_code === "FINISHED" || status.status_code === "PUBLISHED") {

                return;

            }



            if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {

                throw new Error(`Instagram container failed: ${status.status ?? status.status_code}`);

            }



            await this.sleep(this.pollIntervalMs);

        }



        throw new Error("Instagram media processing timed out before the container became publishable.");

    }

}