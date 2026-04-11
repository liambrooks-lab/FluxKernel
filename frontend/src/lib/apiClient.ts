import { SSE_ENDPOINT, NEXT_API_URL } from "@/lib/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SendMessagePayload {
  prompt: string;
  session_id?: number | null;
  persona_name?: string;
}

export interface SSEMessage {
  type: "message" | "error" | "done";
  session_id?: number;
  message_id?: number;
  role?: string;
  content?: string;
  message?: string;
}

export interface WorkspaceTree {
  tree: FileNode[];
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  id: string;
  children?: FileNode[];
}

export interface WritePayload {
  path: string;
  content: string;
}

export interface WriteResult {
  success: boolean;
  path: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function safeFetch<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

// ── API Functions ─────────────────────────────────────────────────────────────

/**
 * Opens an SSE stream to /api/chat and yields parsed event objects.
 * The caller is responsible for consuming the async generator.
 */
export async function* sendMessage(
  payload: SendMessagePayload,
): AsyncGenerator<SSEMessage> {
  const res = await fetch(SSE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep incomplete trailing line in buffer

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const event: SSEMessage = JSON.parse(jsonStr);
          yield event;
          if (event.type === "done" || event.type === "error") return;
        } catch {
          // Malformed SSE frame — skip silently
        }
      }
    }
  }
}

/**
 * Fetches the live workspace file tree from the Next.js workspace proxy.
 */
export async function fetchWorkspace(): Promise<WorkspaceTree> {
  return safeFetch<WorkspaceTree>(`${NEXT_API_URL}/workspace`);
}

/**
 * Sends an approved code diff to be persisted on disk via the Python backend.
 */
export async function approveCodeDiff(
  payload: WritePayload,
): Promise<WriteResult> {
  return safeFetch<WriteResult>(`${NEXT_API_URL}/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}