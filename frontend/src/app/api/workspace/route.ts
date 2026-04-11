import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

// --- GET: Fetch the current workspace file tree ---
export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/workspace/tree`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to connect to backend." },
      { status: 502 }
    );
  }
}

// --- POST: Approve and write file contents to disk ---
export interface WritePayload {
  path: string;
  content: string;
}

export async function POST(req: NextRequest) {
  let body: WritePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { path, content } = body;

  if (!path?.trim()) {
    return NextResponse.json({ error: "File path is required." }, { status: 422 });
  }
  if (content === undefined || content === null) {
    return NextResponse.json({ error: "File content is required." }, { status: 422 });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/workspace/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Pass status codes through: 403 = security error, 500 = internal errors
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to write file." },
      { status: 502 }
    );
  }
}