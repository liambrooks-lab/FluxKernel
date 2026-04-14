/**
 * /api/autopilot/[...slug]/route.ts
 * Next.js proxy route for all Auto-Pilot agentic loop endpoints.
 *
 * Forwards:
 *   POST /api/autopilot/start            → POST  BACKEND/api/v1/autopilot/start
 *   POST /api/autopilot/{id}/abort       → POST  BACKEND/api/v1/autopilot/{id}/abort
 *   GET  /api/autopilot/{id}/status      → GET   BACKEND/api/v1/autopilot/{id}/status
 *   GET  /api/autopilot/{id}/stream      → GET   BACKEND/api/v1/autopilot/{id}/stream (SSE pass-through)
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function handler(
  req: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
) {
  const params = await context.params;
  const slugPath = (params.slug ?? []).join("/");
  const backendTarget = `${BACKEND_URL}/api/v1/autopilot/${slugPath}`;

  const isStream = slugPath.endsWith("/stream");

  const upstreamRes = await fetch(backendTarget, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Accept: isStream ? "text/event-stream" : "application/json",
    },
    body: req.method !== "GET" ? await req.text() : undefined,
    // Required so Next.js does not buffer the SSE body
    // @ts-expect-error — duplex is not in the standard RequestInit type yet
    duplex: "half",
  });

  if (isStream) {
    // Pass-through the SSE stream directly to the browser
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache, no-transform",
        "Connection":        "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const data = await upstreamRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstreamRes.status });
}

export const GET  = handler;
export const POST = handler;
