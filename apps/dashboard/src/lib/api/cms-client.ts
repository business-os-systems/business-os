import type {
  ICmsApiClient,
  UpdateDraftContentParams,
  UpdateDraftContentResult,
  PublishPageParams,
  PublishPageResult,
} from "./types";

export interface CmsApiClientOptions {
  baseUrl?: string;
  enableOfflineFallback?: boolean;
}

export class CmsApiClient implements ICmsApiClient {
  private readonly baseUrl: string;
  private readonly enableOfflineFallback: boolean;

  constructor(options: CmsApiClientOptions = {}) {
    if (options.baseUrl) {
      this.baseUrl = options.baseUrl;
    } else if (typeof window !== "undefined") {
      this.baseUrl = "";
    } else {
      this.baseUrl = process.env.API_URL ?? "";
    }
    this.enableOfflineFallback = options.enableOfflineFallback ?? false;
  }

  async updateDraftContent({
    organizationId,
    pageId,
    expectedRevision,
    draftAst,
  }: UpdateDraftContentParams): Promise<UpdateDraftContentResult> {
    const endpoint = `${this.baseUrl}/api/v1/cms/admin/pages/${pageId}/content`;

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": organizationId,
        },
        body: JSON.stringify({
          expectedRevision,
          draftAst,
        }),
      });

      if (response.status === 200) {
        const data = await response.json();
        return {
          success: true,
          pageId: data.pageId ?? pageId,
          revision: data.revision,
          draftAst: data.draftAst,
        };
      }

      if (response.status === 409) {
        const problem = await response.json().catch(() => ({}));
        return {
          success: false,
          errorCode: "CMS_CONCURRENCY_CONFLICT",
          revision: problem.activeRevision ?? expectedRevision + 1,
          draftAst: problem.draftAst ?? draftAst,
          message: problem.detail ?? "Page revision conflict.",
        };
      }

      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        errorCode: "CMS_UPDATE_FAILED",
        revision: expectedRevision,
        message: errData.detail ?? errData.message ?? `HTTP ${response.status}`,
      };
    } catch (error) {
      if (this.enableOfflineFallback) {
        // Optimistic offline simulated success when backend is unreachable in standalone UI mode
        return {
          success: true,
          pageId,
          revision: expectedRevision + 1,
          draftAst,
        };
      }

      return {
        success: false,
        errorCode: "NETWORK_ERROR",
        revision: expectedRevision,
        message: error instanceof Error ? error.message : "Network failure",
      };
    }
  }

  async publishPage({
    organizationId,
    pageId,
    expectedRevision,
  }: PublishPageParams): Promise<PublishPageResult> {
    const endpoint = `${this.baseUrl}/api/v1/cms/admin/pages/${pageId}/publish`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": organizationId,
        },
        body: JSON.stringify({
          expectedRevision,
        }),
      });

      if (response.status === 200) {
        const data = await response.json();
        return {
          success: true,
          pageId: data.pageId ?? pageId,
          revision: data.revision,
          versionNumber: data.versionNumber,
        };
      }

      if (response.status === 409) {
        const problem = await response.json().catch(() => ({}));
        return {
          success: false,
          errorCode: "CMS_CONCURRENCY_CONFLICT",
          revision: problem.activeRevision ?? expectedRevision + 1,
          message: problem.detail ?? "Revision conflict on publish.",
        };
      }

      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        errorCode: "CMS_PUBLISH_FAILED",
        revision: expectedRevision,
        message: errData.detail ?? errData.message ?? `HTTP ${response.status}`,
      };
    } catch (error) {
      if (this.enableOfflineFallback) {
        return {
          success: true,
          pageId,
          revision: expectedRevision + 1,
          versionNumber: 1,
        };
      }

      return {
        success: false,
        errorCode: "NETWORK_ERROR",
        revision: expectedRevision,
        message: error instanceof Error ? error.message : "Network failure",
      };
    }
  }

  async listPageVersions(
    organizationId: string,
    pageId: string
  ): Promise<{ success: boolean; versions: import("./types").PageVersionSnapshot[]; errorCode?: string; message?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/cms/admin/pages/${pageId}/versions`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "x-tenant-id": organizationId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          versions: data.versions || [],
        };
      }

      return {
        success: false,
        versions: [],
        errorCode: "FETCH_VERSIONS_FAILED",
        message: `HTTP ${response.status}`,
      };
    } catch (error) {
      if (this.enableOfflineFallback) {
        return {
          success: true,
          versions: [
            {
              id: `ver_demo_${pageId}`,
              organizationId,
              pageId,
              versionNumber: 1,
              label: "Release v1",
              astSnapshot: {},
              createdByUserId: "user_owner",
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }

      return {
        success: false,
        versions: [],
        errorCode: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network failure",
      };
    }
  }
}

export const defaultCmsClient = new CmsApiClient();
