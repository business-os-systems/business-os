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

export * from "./storefront-service.js";
export * from "./form-service.js";
export * from "./page-service.js";
