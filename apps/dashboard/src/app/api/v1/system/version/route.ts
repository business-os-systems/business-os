import { NextResponse } from "next/server";
import { getAppVersion, getGitCommitSha, getBuildTimestamp, getNodeEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      version: getAppVersion(),
      gitCommitSha: getGitCommitSha(),
      buildTimestamp: getBuildTimestamp(),
      environment: getNodeEnv(),
      status: "ok",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
