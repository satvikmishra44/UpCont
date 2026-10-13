import { createHmac } from "node:crypto";
import { createReadStream } from "node:fs";

import axios, { type AxiosError } from "axios";
import FormData from "form-data";

export interface MetaFileUpload {
  fieldName: string;
  absolutePath: string;
  fileName: string;
  mimeType: string;
}

export interface MetaGraphPort {
    get<T>(path: string, accessToken: string, params?: Record<string, string|number|boolean>): Promise<T>;
    postForm<T>(path: string, accessToken: string, fields?: Record<string, string | number | boolean>) : Promise<T>;
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
  };
}

export class MetaApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: number, readonly subcode?: number, readonly metaType?: string, readonly transient?: boolean) {
    super(message);
    this.name = "MetaApiError";
  }
}

export function createAppSecretProof(accessToken: string, appSecret: string) : string{
    return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

function normalizeError(error: unknown): MetaApiError {
    if(!axios.isAxiosError(error)){
        return new MetaApiError("Unexpected Meta API failure");
    }

    const axiosError = error as AxiosError<MetaErrorPayload>;

    const payload = axiosError.response?.data?.error;

    return new MetaApiError(
        payload?.message ?? "Meta API request failed.",
        axiosError.response?.status,
        payload?.code,
        payload?.error_subcode,
        payload?.type,
        payload?.is_transient);
}

export class MetaGraphClient implements MetaGraphPort{
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

    async get<T>(path: string, accessToken: string, params: Record<string, string | number | boolean> = {}) : Promise<T>{
        try{
            const response = await axios.get<T>(this.graphUrl(path), {
                params: {...params, appsecret_proof: this.proof(accessToken)},
                headers: {Authorization: `Bearer ${accessToken}`},
                timeout: 30_000,
            });

            return response.data
        } catch(error){
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
                params: {appsecret_proof: this.proof(accessToken)},
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout: 60_000,
            });

            return response.data;

        } catch (error){
            throw normalizeError(error);
        }
    }

    async postMultipart<T>(path: string, accessToken: string, fields: Record<string, string | number | boolean>, file: MetaFileUpload) : Promise<T> {
        const form = new FormData();

        for(const [key, value] of Object.entries(fields)){
            form.append(key, String(value));
        }

        form.append(file.fieldName, createReadStream(file.absolutePath), {filename: file.fileName, contentType: file.mimeType});

        try{
            const response = await axios.post<T>(this.graphUrl(path), form, {
                params: {appsecret_proof: this.proof(accessToken)},
                headers: {
                    ...form.getHeaders(),
                    Authorization: `Bearer ${accessToken}`,
                },
                timeout: 15 * 60_000,
                maxBodyLength: Number.POSITIVE_INFINITY,
                maxContentLength: Number.POSITIVE_INFINITY,
            });

            return response.data;
        } catch(error){
            throw normalizeError(error);
        }
    }

    async postBinaryUrl<T>(uploadUrl: string, accessToken: string, absolutePath: string, fileSize: number, mimeType: string): Promise<T> {
        const parsed = new URL(uploadUrl);

        if (parsed.protocol !== "https:" || parsed.hostname !== "rupload.facebook.com") {
            throw new Error("Meta supplied an unexpected upload host; upload was refused.");
        }

        try{
            const response = await axios.post<T>(uploadUrl, createReadStream(absolutePath), {
                headers: {
                    Authorization: `OAuth ${accessToken}`,
                    offset: "0",
                    file_size: String(fileSize),
                    "Content-Type": mimeType,
                    "Content-Length": String(fileSize),
                },
                timeout: 15 * 60_000,
                maxBodyLength: Number.POSITIVE_INFINITY,
                maxContentLength: Number.POSITIVE_INFINITY,
            })

            return response.data;
        } catch(error){
            throw normalizeError(error);
        }
    }

    async deleteForm<T>(path: string, accessToken: string): Promise<T>{
        try{
            const response = await axios.delete<T>(this.graphUrl(path), {
                params: {appsecret_proof: this.proof(accessToken)},
                headers: {Authorization: `Bearer ${accessToken}`},
                timeout: 30_000
            })
            return response.data
        } catch(error){
            throw normalizeError(error);
        }
    }
}