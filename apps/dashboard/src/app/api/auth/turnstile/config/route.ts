import { NextResponse } from "next/server";
import { getTurnstileSiteKey, isTurnstileConfigured } from "@/lib/turnstile";

export async function GET() {
  const isConfigured = isTurnstileConfigured();
  return NextResponse.json(
    {
      siteKey: isConfigured ? getTurnstileSiteKey() : "",
      isConfigured,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    }
  );
}
