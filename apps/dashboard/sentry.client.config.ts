import * as Sentry from "@sentry/nextjs";
import { sanitizePii } from "@suite/logger/sanitize";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    beforeSend(event) {
      // Enforce strict pre-transmission Zero-PII sanitization
      if (event.request) {
        event.request.cookies = undefined;
        event.request.headers = undefined;
      }
      return sanitizePii(event);
    },
  });
}
