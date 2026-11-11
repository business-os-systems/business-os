import { describe, expect, it } from "vitest";
import {
  assertMediaConfiguration,
  readMediaConfig,
} from "../src/env.js";

const COMPLETE_ENV = {
  MEDIA_BUCKET: "business-os-media",
  MEDIA_S3_REGION: "auto",
  MEDIA_S3_ENDPOINT: "https://storage.example.com",
  MEDIA_S3_ACCESS_KEY_ID: "real-access-key",
  MEDIA_S3_SECRET_ACCESS_KEY: "real-secret-key",
  MEDIA_PUBLIC_BASE_URL: "https://cdn.example.com/media",
  MEDIA_MAX_BYTES: "10485760",
  MEDIA_URL_TTL_SECONDS: "900",
} as const;

describe("media configuration", () => {
  it("reads every declared key without an inline fallback", () => {
    const config = readMediaConfig({ ...COMPLETE_ENV });
    expect(config.bucket).toBe("business-os-media");
    expect(config.maxBytes).toBe(10_485_760);
    expect(config.urlTtlSeconds).toBe(900);
  });

  it("fails loudly when a required key is missing", () => {
    const withoutBucket: Record<string, string | undefined> = {
      ...COMPLETE_ENV,
    };
    delete withoutBucket.MEDIA_BUCKET;
    expect(() => readMediaConfig(withoutBucket)).toThrow(/MEDIA_BUCKET/);
  });

  it("rejects a non-positive size limit and an out-of-range URL lifetime", () => {
    expect(() =>
      readMediaConfig({ ...COMPLETE_ENV, MEDIA_MAX_BYTES: "0" })
    ).toThrow(/MEDIA_MAX_BYTES/);
    expect(() =>
      readMediaConfig({ ...COMPLETE_ENV, MEDIA_URL_TTL_SECONDS: "700000" })
    ).toThrow(/MEDIA_URL_TTL_SECONDS/);
  });

  it("refuses a placeholder credential for a production boot", () => {
    expect(() =>
      assertMediaConfiguration({
        ...COMPLETE_ENV,
        MEDIA_S3_SECRET_ACCESS_KEY: "CHANGE_ME_MEDIA_SECRET_ACCESS_KEY",
      })
    ).toThrow(/MEDIA_S3_SECRET_ACCESS_KEY/);
  });
});
