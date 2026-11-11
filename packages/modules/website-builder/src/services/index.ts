/**
 * Service Layer Scaffold for Website Builder
 */
export interface IWebsiteBuilderService {
  healthCheck(): { status: string; module: string };
}

export class WebsiteBuilderService implements IWebsiteBuilderService {
  healthCheck(): { status: string; module: string } {
    return {
      status: "healthy",
      module: "@suite/website-builder",
    };
  }
}
export * from "./cms-audit.js";
export * from "./storefront-service.js";
export * from "./page-service.js";
export * from "./prisma-unique.js";
export * from "./published-catalog.js";
export * from "./site-service.js";
