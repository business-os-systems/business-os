import { NextResponse } from "next/server";
import { SiteService } from "@suite/website-builder/services";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const subdomain = searchParams.get("subdomain");

    if (!subdomain || subdomain.trim().length < 2) {
      return NextResponse.json(
        { error: "Subdomain must be at least 2 characters" },
        { status: 400 }
      );
    }

    const service = new SiteService();
    const result = await service.checkSubdomainAvailability(subdomain);

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check subdomain" },
      { status: 500 }
    );
  }
}
