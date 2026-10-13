import { promises as fs } from "node:fs";
import path from "node:path";

import * as z from "zod/v4";

const StoredMetaAuthorizationSchema = z.object({
    version: z.literal(1),
    issuedAt: z.string(),
    updatedAt: z.string(),
    expiresAt: z.string().optional(),
    userAccessToken: z.string().min(1),
    tokenType: z.string().optional(),
    scopes: z.array(z.string()).default([]),
})

export interface StoredMetaAuthorization {
    version: 1;
    issuedAt: string;
    updatedAt: string;
    expiresAt?: string | undefined;
    userAccessToken: string;
    tokenType?: string | undefined;
    scopes: string[];
}

export class MetaTokenStore {
    constructor(private readonly tokenPath: string){}

    async exists() : Promise<boolean>{
        try{
            await fs.access(this.tokenPath);
            return true;
        } catch {
            return false;
        }
    }

    async load(): Promise<StoredMetaAuthorization | null>{
        try{
            const raw = await fs.readFile(this.tokenPath, "utf-8");
            return StoredMetaAuthorizationSchema.parse(JSON.parse(raw));
        } catch (error){
            if(error instanceof Error && "code" in error && error.code === "ENOENT"){
                return null;
            }

            throw new Error("Stored Meta auth couldn't be read or validated")
        }
    }

    async save(authorization: StoredMetaAuthorization) : Promise<void>{
        const validated = StoredMetaAuthorizationSchema.parse(authorization);

        const directory = path.dirname(this.tokenPath);
        await fs.mkdir(directory, {recursive: true})

        const temp = `${this.tokenPath}.${process.pid}.${Date.now}.tmp`

        await fs.writeFile(temp, `${JSON.stringify(validated, null, 2)}\n`, {encoding: "utf-8", mode: 0o600, flag: "wx"})

        try{
            await fs.rename(temp, this.tokenPath);
        } catch {
            await fs.rm(this.tokenPath, { force: true});
            await fs.rename(temp, this.tokenPath);
        }

        try{
            await fs.chmod(this.tokenPath, 0o600);
        } catch{

        }
    }

    async clear(): Promise<void> {
        await fs.rm(this.tokenPath, {force: true});
    }
}