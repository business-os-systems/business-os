import * as Sentry from "@sentry/nextjs";
import { sanitizePii } from "@suite/logger";

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    beforeSend(event) {
      if (event.request) {
        event.request.cookies = undefined;
        event.request.headers = undefined;
      }
      return sanitizePii(event);
    },
  });
}
