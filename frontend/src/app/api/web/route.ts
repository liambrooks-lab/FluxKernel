/**
 * /api/web/route.ts
 * Next.js proxy for the FluxKernel web fetcher endpoints.
 *
 * Forwards POST requests to BACKEND/api/v1/web/* based on the `action` field.
 * Supports: fetch, download, api
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  // Determine which sub-endpoint to call based on pathname suffix
  // e.g. /api/web/fetch, /api/web/download, /api/web/api
  const pathParts = url.pathname.split("/").filter(Boolean);
  const action = pathParts[pathParts.length - 1]; // "fetch" | "download" | "api"

  const allowedActions = ["fetch", "download", "api"];
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: `Unknown web action: ${action}` }, { status: 400 });
  }

  const body = await req.text();

  const backendRes = await fetch(`${BACKEND_URL}/api/v1/web/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const data = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
