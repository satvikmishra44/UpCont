import { createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import axios from "axios";
import FormData from "form-data";

export interface MetaFileUpload {
    fieldName: string;
    absolutePath: string;
    fileName: string;
    mimeType: string;
}

export interface MetaGraphPort {
    get<T>(path: string, accessToken: string, params?: Record<string, string | number | boolean>): Promise<T>;
    postForm<T>(path: string, accessToken: string, fields?: Record<string, string | number | boolean>): Promise<T>;
    postMultipart<T>(path: string, accessToken: string, fields: Record<string, string | number | boolean>, file: MetaFileUpload): Promise<T>;
    postBinaryUrl<T>(uploadUrl: string, accessToken: string, absolutePath: string, fileSize: number, mimeType: string): Promise<T>;
    deleteForm<T>(path: string, accessToken: string): Promise<T>;
}

interface MetaErrorPayload {
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        is_transient?: boolean;
        fbtrace_id?: string;
    };
}

export interface MetaErrorDiagnostics {
    method?: string;
    url?: string;
    httpStatus?: number;
    networkCode?: string;
    fbtraceId?: string;
    body?: string;
}

export class MetaApiError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        readonly code?: number,
        readonly subcode?: number,
        readonly metaType?: string,
        readonly transient?: boolean,
        readonly diagnostics?: MetaErrorDiagnostics,
    ) {
        super(message);
        this.name = "MetaApiError";
    }
}

function redact(text: string): string {
    return text
        .replace(/access_token=[^&\s"]+/gi, "access_token=[redacted]")
        .replace(/appsecret_proof=[a-f0-9]+/gi, "appsecret_proof=[redacted]")
        .replace(/EA[A-Za-z0-9]+/g, "[token]")
        .slice(0, 1500);
}

function safeUrl(raw?: string): string | undefined {
    if (!raw) return undefined;

    try {
        const parsed = new URL(raw);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return undefined;
    }
}

export function createAppSecretProof(accessToken: string, appSecret: string): string {
    return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

function normalizeError(error: unknown): MetaApiError {
    if (error instanceof MetaApiError) {
        return error;
    }

    if (!axios.isAxiosError(error)) {
        return new MetaApiError("Unexpected Meta API failure (not an HTTP error).");
    }

    const data = error.response?.data as
        | (MetaErrorPayload & {
              message?: string;
              debug_info?: { message?: string; type?: string; retriable?: boolean };
          })
        | string
        | undefined;

    const body = typeof data === "string" ? data : data ? JSON.stringify(data) : undefined;
    const objectData = typeof data === "object" ? data : undefined;
    const payload = objectData?.error;
    const requestUrl = safeUrl(error.config?.url);

    const message =
        payload?.message ??
        objectData?.debug_info?.message ??
        objectData?.message ??
        error.message ??
        "Meta API request failed.";

    return new MetaApiError(
        message,
        error.response?.status,
        payload?.code,
        payload?.error_subcode,
        payload?.type ?? objectData?.debug_info?.type,
        payload?.is_transient,
        {
            ...(error.config?.method ? { method: error.config.method.toUpperCase() } : {}),
            ...(requestUrl ? { url: requestUrl } : {}),
            ...(error.response?.status !== undefined ? { httpStatus: error.response.status } : {}),
            ...(error.code !== undefined ? { networkCode: error.code } : {}),
            ...(payload?.fbtrace_id !== undefined ? { fbtraceId: payload.fbtrace_id } : {}),
            ...(body ? { body: redact(body) } : {}),
        },
    );
}

export class MetaGraphClient implements MetaGraphPort {
    constructor(private readonly graphVersion: string, private readonly appSecret: string) {}

    private graphUrl(path: string): string {
        const normalized = path.startsWith("/") ? path : `/${path}`;

        if (normalized.includes("://") || normalized.includes("..")) {
            throw new Error("Invalid Meta Graph path.");
        }

        return `https://graph.facebook.com/${this.graphVersion}${normalized}`;
    }

    private proof(accessToken: string): string {
        return createAppSecretProof(accessToken, this.appSecret);
    }

    async get<T>(path: string, accessToken: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
        try {
            const response = await axios.get<T>(this.graphUrl(path), {
                params: { ...params, appsecret_proof: this.proof(accessToken) },
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 30_000,
            });

            return response.data;
        } catch (error) {
            throw normalizeError(error);
        }
    }

    async postForm<T>(path: string, accessToken: string, fields: Record<string, string | number | boolean> = {}): Promise<T> {
        const body = new URLSearchParams();

        for (const [key, value] of Object.entries(fields)) {
            body.set(key, String(value));
        }

        try {
            const response = await axios.post<T>(this.graphUrl(path), body, {
                params: { appsecret_proof: this.proof(accessToken) },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout: 60_000,
            });

            return response.data;
        } catch (error) {
            throw normalizeError(error);
        }
    }

    async postMultipart<T>(path: string, accessToken: string, fields: Record<string, string | number | boolean>, file: MetaFileUpload): Promise<T> {
        const form = new FormData();

        for (const [key, value] of Object.entries(fields)) {
            form.append(key, String(value));
        }

        form.append(file.fieldName, createReadStream(file.absolutePath), {
            filename: file.fileName,
            contentType: file.mimeType,
        });

        try {
            const response = await axios.post<T>(this.graphUrl(path), form, {
                params: { appsecret_proof: this.proof(accessToken) },
                headers: {
                    ...form.getHeaders(),
                    Authorization: `Bearer ${accessToken}`,
                },
                timeout: 15 * 60_000,
                maxBodyLength: Number.POSITIVE_INFINITY,
                maxContentLength: Number.POSITIVE_INFINITY,
            });

            return response.data;
        } catch (error) {
            throw normalizeError(error);
        }
    }

    async postBinaryUrl<T>(uploadUrl: string, accessToken: string, absolutePath: string, fileSize: number, mimeType: string): Promise<T> {
        const parsed = new URL(uploadUrl);

        if (parsed.protocol !== "https:" || parsed.hostname !== "rupload.facebook.com") {
            throw new Error("Meta supplied an unexpected upload host; upload was refused.");
        }

        try {
            const response = await axios.post<T>(uploadUrl, createReadStream(absolutePath), {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    offset: "0",
                    file_offset: "0",
                    file_size: String(fileSize),
                    "Content-Type": mimeType,
                    "Content-Length": String(fileSize),
                },
                timeout: 15 * 60_000,
                maxBodyLength: Number.POSITIVE_INFINITY,
                maxContentLength: Number.POSITIVE_INFINITY,
                validateStatus: () => true,
            });

            if (response.status < 200 || response.status >= 300) {
                const uploadSafeUrl = safeUrl(uploadUrl);
                throw new MetaApiError(
                    `Instagram binary upload failed with HTTP ${response.status}: ${redact(JSON.stringify(response.data))}`,
                    response.status,
                    undefined,
                    undefined,
                    undefined,
                    false,
                    {
                        method: "POST",
                        ...(uploadSafeUrl ? { url: uploadSafeUrl } : {}),
                        httpStatus: response.status,
                        body: redact(JSON.stringify(response.data)),
                    },
                );
            }

            return response.data;
        } catch (error) {
            throw normalizeError(error);
        }
    }

    async deleteForm<T>(path: string, accessToken: string): Promise<T> {
        try {
            const response = await axios.delete<T>(this.graphUrl(path), {
                params: { appsecret_proof: this.proof(accessToken) },
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 30_000,
            });

            return response.data;
        } catch (error) {
            throw normalizeError(error);
        }
    }
}