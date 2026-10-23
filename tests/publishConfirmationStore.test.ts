import { describe, expect, it } from "vitest";
import { PublishConfirmationStore } from "../src/security/PublishConfirmationStore.js";
import type { PublishVideoInput } from "../src/tools/publishVideo.js";

function createInput(overrides: Partial<PublishVideoInput> = {}): PublishVideoInput {
    return {
        filePath: "video.mp4",
        platforms: ["youtube"],
        targetIds: { youtube: "channel-id" },
        title: "Test video",
        description: "",
        privacyStatus: "private",
        tags: [],
        categoryId: "22",
        madeForKids: false,
        notifySubscribers: false,
        metaConfirmPublic: false,
        instagramShareToFeed: true,
        dryRun: true,
        confirmPublish: false,
        ...overrides,
    };
}

describe("PublishConfirmationStore", () => {
    it("accepts the unchanged request once", () => {
        const store = new PublishConfirmationStore();
        const dryRun = createInput();
        const issued = store.issue(dryRun);

        expect(() => store.consume(issued.token, createInput({
            dryRun: false,
            confirmPublish: true,
            confirmationToken: issued.token,
        }))).not.toThrow();
    });

    it("rejects token reuse", () => {
        const store = new PublishConfirmationStore();
        const issued = store.issue(createInput());

        const realInput = createInput({
            dryRun: false,
            confirmPublish: true,
            confirmationToken: issued.token,
        });

        store.consume(issued.token, realInput);

        expect(() => store.consume(issued.token, realInput)).toThrow(/invalid|already used/i);
    });

    it("rejects a changed request", () => {
        const store = new PublishConfirmationStore();
        const issued = store.issue(createInput());

        expect(() => store.consume(issued.token, createInput({
            title: "Changed title",
            dryRun: false,
            confirmPublish: true,
            confirmationToken: issued.token,
        }))).toThrow(/changed/i);
    });

    it("rejects an expired token", async () => {
        const store = new PublishConfirmationStore(1);
        const issued = store.issue(createInput());

        await new Promise((resolve) => setTimeout(resolve, 5));

        expect(() => store.consume(issued.token, createInput({
            dryRun: false,
            confirmPublish: true,
            confirmationToken: issued.token,
        }))).toThrow(/expired|invalid/i);
    });
});