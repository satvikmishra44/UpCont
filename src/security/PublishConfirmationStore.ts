import { createHash, randomBytes } from "node:crypto";
import type { PublishVideoInput } from "../tools/publishVideo.js";

const DEFAULT_EXPIRY_MS = 10 * 60 * 1000;

interface ConfirmationEntry {
    fingerprint: string;
    expiresAt: number;
}

export interface IssuedConfirmation {
    token: string;
    expiresAt: string;
}

function sortObject(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortObject);

    if (typeof value === "object" && value !== null) {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, childValue]) => [key, sortObject(childValue)]),
        );
    }

    return value;
}

export function createPublishFingerprint(input: PublishVideoInput): string {
    const intent = structuredClone(input) as Record<string, unknown>;

    delete intent.dryRun;
    delete intent.confirmPublish;
    delete intent.confirmationToken;

    const normalized = JSON.stringify(sortObject(intent));

    return createHash("sha256").update(normalized).digest("hex");
}

export class PublishConfirmationStore {
    private readonly entries = new Map<string, ConfirmationEntry>();

    constructor(private readonly expiryMs = DEFAULT_EXPIRY_MS) {}

    issue(input: PublishVideoInput): IssuedConfirmation {
        this.removeExpired();

        const token = randomBytes(32).toString("hex");
        const expiresAt = Date.now() + this.expiryMs;

        this.entries.set(token, {
            fingerprint: createPublishFingerprint(input),
            expiresAt,
        });

        return {
            token,
            expiresAt: new Date(expiresAt).toISOString(),
        };
    }

    consume(token: string | undefined, input: PublishVideoInput): void {
        this.removeExpired();

        if (!token) {
            throw new Error("Real publishing requires a confirmation token from a successful dry run.");
        }

        const entry = this.entries.get(token);

        if (!entry) {
            throw new Error("The publish confirmation token is invalid, expired, already used, or belongs to another MCP session.");
        }

        this.entries.delete(token);

        const currentFingerprint = createPublishFingerprint(input);

        if (entry.fingerprint !== currentFingerprint) {
            throw new Error("The publish request changed after dry run. Run the exact final request in dry-run mode again.");
        }
    }

    private removeExpired(): void {
        const now = Date.now();

        for (const [token, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(token);
        }
    }
}