import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export interface ChatPayload {
  session_id?: number | null;
  prompt: string;
  persona_name?: string;
}

export async function POST(req: NextRequest) {
  let body: ChatPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { prompt, session_id, persona_name = "Standard" } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt cannot be empty." }, { status: 422 });
  }

  // --- SSE Stream Setup ---
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueueEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const backendResponse = await fetch(`${BACKEND_URL}/api/v1/chat/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id, prompt, persona_name }),
        });

        if (!backendResponse.ok) {
          const errorText = await backendResponse.text();
          enqueueEvent({ type: "error", message: `Backend error: ${errorText}` });
          controller.close();
          return;
        }

        const data = await backendResponse.json();

        // Emit the complete response as an SSE event
        enqueueEvent({
          type: "message",
          session_id: data.session_id,
          message_id: data.message_id,
          role: data.role,
          content: data.content,
        });

        // Signal stream completion
        enqueueEvent({ type: "done" });
      } catch (err) {
        enqueueEvent({
          type: "error",
          message: err instanceof Error ? err.message : "Unknown upstream error.",
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