import { NextRequest, NextResponse } from "next/server";

// Known event types emitted by the Python backend
type WebhookEventType =
  | "IMAGE_GENERATED"
  | "CODE_EXECUTION_COMPLETE"
  | "FILE_WRITTEN"
  | "AGENT_TASK_COMPLETE"
  | string;

interface WebhookPayload {
  event: WebhookEventType;
  session_id?: number;
  data?: Record<string, unknown>;
  timestamp?: string;
}

// In-memory event log — swap for Redis / DB in production
const eventLog: WebhookPayload[] = [];

export async function POST(req: NextRequest) {
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload.event) {
    return NextResponse.json({ error: "Missing required field: event." }, { status: 422 });
  }

  const enrichedPayload: WebhookPayload = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  };

  // Log the event
  eventLog.push(enrichedPayload);

  // Route to specialized handlers based on event type
  switch (enrichedPayload.event) {
    case "IMAGE_GENERATED":
      // TODO: Push to connected frontend clients via real-time channel (e.g. Pusher/SSE)
      console.log(`[Webhook] Image generated for session ${enrichedPayload.session_id}:`, enrichedPayload.data);
      break;

    case "CODE_EXECUTION_COMPLETE":
      console.log(`[Webhook] Code execution complete:`, enrichedPayload.data);
      break;

    case "FILE_WRITTEN":
      console.log(`[Webhook] File written:`, enrichedPayload.data);
      break;

    case "AGENT_TASK_COMPLETE":
      console.log(`[Webhook] Agent task finished:`, enrichedPayload.data);
      break;

    default:
      console.warn(`[Webhook] Unhandled event type: "${enrichedPayload.event}"`);
  }

  return NextResponse.json({ received: true, event: enrichedPayload.event }, { status: 200 });
}

// Optional: GET to inspect recent events during development
export async function GET() {
  return NextResponse.json({
    count: eventLog.length,
    events: eventLog.slice(-50), // Return last 50 events max
  });
}