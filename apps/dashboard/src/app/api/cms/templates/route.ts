import { NextResponse } from "next/server";
import { problemResponse } from "@/lib/problem-response";
import { listStarterTemplates } from "@/services/cms-templates.service";

export type { CmsTemplateBlueprintDto as TemplateBlueprintMetadata } from "@/services/cms-templates.service";

export async function GET() {
  try {
    const templates = await listStarterTemplates();
    return NextResponse.json({ templates }, { status: 200 });
  } catch (error) {
    console.error("Error loading starter templates:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Starter Templates Query Failed",
      detail: "An unexpected error occurred while loading starter templates.",
    });
  }
}
