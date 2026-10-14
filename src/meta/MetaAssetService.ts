import type { MetaAuthPort } from "./MetaAuthService.js";
import type { MetaGraphPort } from "./MetaGraphClient.js";

interface MetaInstagramAccountResponse {
  id: string;
  username?: string;
  name?: string;
}

interface MetaPageResponse {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  instagram_business_account?: MetaInstagramAccountResponse;
}

interface MetaAccountsResponse {
  data?: MetaPageResponse[];
  paging?: {
    cursors?: {
      after?: string;
    };
    next?: string;
  };
}

export interface MetaPageAsset {
    pageId: string;
    pageName: string;
    pageAccessToken: string;
    tasks: string[];
}

export interface MetaInstagramAsset {
    instagramAccountId: string;
    username: string;
    linkedPageId: string;
    linkedPageName: string;
    pageAccessToken: string;
}

export interface MetaAssetPort {
    listPages(): Promise<MetaPageAsset[]>;
    listInstagramAccounts(): Promise<MetaInstagramAsset[]>;
    findPage(pageId: string): Promise<MetaPageAsset | undefined>;
    findInstagramAccount(instagramAccountId: string): Promise<MetaInstagramAsset | undefined>;
}

export class MetaAssetService implements MetaAssetPort{
    constructor (private readonly auth: MetaAuthPort, private readonly graph: MetaGraphPort){}

    private async loadAllAccounts(): Promise<MetaPageResponse[]> {
        const userAccessToken = await this.auth.getUserAccessToken();

        const accounts: MetaPageResponse[] = [];
        let after : string | undefined;

        for (let page = 0; page < 10; page += 1) {
            const response = await this.graph.get<MetaAccountsResponse>("/me/accounts", userAccessToken, {
                    fields: "id,name,access_token,tasks,instagram_business_account{id,username,name}",
                    limit: 100,
                    ...(after ? { after } : {}),
                },);

            accounts.push(...(response.data ?? []));

            if (!response.paging?.next) {
                break;
            }

            after = response.paging.cursors?.after;

            if (!after) {
                break;
            }
        }

        return accounts;
    }

    async listPages(): Promise<MetaPageAsset[]>{
        const accounts = await this.loadAllAccounts();

        return accounts.map((page) => ({
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
            tasks: page.tasks ?? [],  
        }));
    }

    async listInstagramAccounts(): Promise<MetaInstagramAsset[]> {
        const accounts = await this.loadAllAccounts();
        return accounts.flatMap((page) => {
            const instagram = page.instagram_business_account;
            if(!instagram){
                return [];
            }

            return [{instagramAccountId: instagram.id,
                username: instagram.username ?? instagram.name ?? `Instagram ${instagram.id}`,
                linkedPageId: page.id,
                linkedPageName: page.name,
                pageAccessToken: page.access_token}]
        })
    }

    async findPage(pageId: string): Promise<MetaPageAsset | undefined>{
        const pages = await this.listPages();
        return pages.find((page) => page.pageId == pageId);
    }

    async findInstagramAccount(instagramAccountId: string): Promise<MetaInstagramAsset | undefined> {
        const accounts = await this.listInstagramAccounts();
        return accounts.find((account) => account.instagramAccountId === instagramAccountId);
    }
}