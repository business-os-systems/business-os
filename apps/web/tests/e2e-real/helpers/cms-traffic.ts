import type { Page } from "@playwright/test";

/**
 * Records every browser call the dashboard makes to the tenant CMS (#379).
 *
 * The journey asserts on the recorded statuses, so a mocked or missing call is
 * visible: an intercepted request never carries the API's status code and a
 * stub would show up here as an unexpected one.
 */

export interface CmsCall {
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

const CMS_PREFIX = "/api/v1/cms/";

export function collectCmsTraffic(page: Page): CmsCall[] {
  const calls: CmsCall[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith(CMS_PREFIX)) {
      return;
    }
    calls.push({
      method: response.request().method(),
      path: url.pathname,
      status: response.status(),
    });
  });
  return calls;
}
