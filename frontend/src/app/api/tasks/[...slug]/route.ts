/**
 * /api/tasks/[...slug]/route.ts
 * Next.js proxy for Celery task status and SSE stream endpoints.
 *
 * Forwards:
 *   GET /api/tasks/{task_id}/status  → GET BACKEND/api/v1/tasks/{task_id}/status
 *   GET /api/tasks/{task_id}/stream  → GET BACKEND/api/v1/tasks/{task_id}/stream (SSE)
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
) {
  const params = await context.params;
  const slugPath = (params.slug ?? []).join("/");
  const backendTarget = `${BACKEND_URL}/api/v1/tasks/${slugPath}`;
  const isStream = slugPath.endsWith("/stream");

  const upstreamRes = await fetch(backendTarget, {
    headers: { Accept: isStream ? "text/event-stream" : "application/json" },
  });

  if (isStream) {
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
