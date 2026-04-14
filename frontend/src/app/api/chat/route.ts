import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueueEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let backendResponse: Response;

        if (contentType.includes("multipart/form-data")) {
          const incoming = await req.formData();
          const formData = new FormData();
          for (const [key, value] of incoming.entries()) {
            formData.append(key, value);
          }

          backendResponse = await fetch(`${BACKEND_URL}/api/v1/chat/`, {
            method: "POST",
            body: formData,
          });
        } else {
          const body = await req.json();
          backendResponse = await fetch(`${BACKEND_URL}/api/v1/chat/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }

        if (!backendResponse.ok) {
          const errorText = await backendResponse.text();
          enqueueEvent({ type: "error", message: `Backend error: ${errorText}` });
          controller.close();
          return;
        }

        const data = await backendResponse.json();
        enqueueEvent({
          type: "message",
          session_id: data.session_id,
          message_id: data.message_id,
          role: data.role,
          content: data.content,
          mode: data.mode,
        });
        enqueueEvent({ type: "done" });
      } catch (error) {
        enqueueEvent({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown upstream error.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

