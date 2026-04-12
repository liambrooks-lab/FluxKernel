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

// ── Feature 1: Async Task ─────────────────────────────────────────────────────

export interface DispatchCodePayload {
  code: string;
  language?: "python" | "cpp" | "javascript" | "typescript";
  timeout?: number;
}

export interface DispatchCodeResult {
  task_id: string;
}

// ── Feature 4: Agentic Loop ───────────────────────────────────────────────────

export interface StartLoopPayload {
  prompt: string;
  persona_name?: string;
  system_prompt?: string;
}

export interface StartLoopResult {
  loop_id: string;
  status: string;
  message: string;
}

export interface LoopEvent {
  event: string;
  loop_id: string;
  [key: string]: unknown;
}

// ── Feature 5: Web Fetcher ────────────────────────────────────────────────────

export interface WebFetchPayload {
  url: string;
  css_selector?: string;
  save_as?: string;
  raw?: boolean;
}

export interface WebDownloadPayload {
  url: string;
  filename: string;
}

export interface WebApiPayload {
  url: string;
  headers?: Record<string, string>;
  payload?: Record<string, unknown>;
  save_as?: string;
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

// ── SSE Generator Helper ──────────────────────────────────────────────────────

async function* openSseStream<T>(url: string): AsyncGenerator<T> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new ApiError(res.status, res.statusText);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          yield JSON.parse(jsonStr) as T;
        } catch {
          // Malformed SSE frame — skip
        }
      }
    }
  }
}

// ── Existing API Functions ────────────────────────────────────────────────────

/**
 * Opens an SSE stream to /api/chat and yields parsed event objects.
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
    buffer = lines.pop() ?? "";

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

export async function fetchWorkspace(): Promise<WorkspaceTree> {
  return safeFetch<WorkspaceTree>(`${NEXT_API_URL}/workspace`);
}

export async function approveCodeDiff(
  payload: WritePayload,
): Promise<WriteResult> {
  return safeFetch<WriteResult>(`${NEXT_API_URL}/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ── Feature 1: Async Task Dispatch ───────────────────────────────────────────

/**
 * Dispatch code execution to a Celery background worker.
 * Returns a task_id; use useTaskStream(taskId) to follow progress.
 */
export async function dispatchCode(
  payload: DispatchCodePayload,
): Promise<DispatchCodeResult> {
  return safeFetch<DispatchCodeResult>(`${NEXT_API_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * SSE generator for a Celery task stream.
 * Yields raw payload objects from GET /api/tasks/{taskId}/stream.
 */
export async function* fetchTaskStream(
  taskId: string,
): AsyncGenerator<Record<string, unknown>> {
  yield* openSseStream(`${NEXT_API_URL}/tasks/${taskId}/stream`);
}

// ── Feature 4: Agentic Loop ───────────────────────────────────────────────────

/** Kick off a new Auto-Pilot agentic loop on the backend. */
export async function startAgenticLoop(
  payload: StartLoopPayload,
): Promise<StartLoopResult> {
  return safeFetch<StartLoopResult>(`${NEXT_API_URL}/autopilot/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Signal a running loop to abort. */
export async function abortAgenticLoop(loopId: string): Promise<void> {
  await safeFetch(`${NEXT_API_URL}/autopilot/${loopId}/abort`, {
    method: "POST",
  });
}

/** SSE generator for agentic loop events. */
export async function* streamLoopEvents(
  loopId: string,
): AsyncGenerator<LoopEvent> {
  yield* openSseStream<LoopEvent>(
    `${NEXT_API_URL}/autopilot/${loopId}/stream`,
  );
}

// ── Feature 5: Web Fetcher ────────────────────────────────────────────────────

export async function webFetch(payload: WebFetchPayload): Promise<unknown> {
  return safeFetch(`${NEXT_API_URL}/web/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function webDownload(payload: WebDownloadPayload): Promise<unknown> {
  return safeFetch(`${NEXT_API_URL}/web/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function webApi(payload: WebApiPayload): Promise<unknown> {
  return safeFetch(`${NEXT_API_URL}/web/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}