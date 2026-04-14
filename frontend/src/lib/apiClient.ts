import { NEXT_API_URL, SSE_ENDPOINT } from "@/lib/constants";

export interface PendingAttachment {
  file: File;
  kind: "file" | "folder" | "image" | "camera";
  relativePath?: string;
  previewUrl?: string;
}

export interface SendMessagePayload {
  prompt: string;
  session_id?: number | null;
  persona_name?: string;
  attachments?: PendingAttachment[];
}

export interface SSEMessage {
  type: "message" | "error" | "done";
  session_id?: number;
  message_id?: number;
  role?: string;
  content?: string;
  mode?: string;
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

export interface DispatchCodePayload {
  code: string;
  language?: "python" | "cpp" | "javascript" | "typescript";
  timeout?: number;
}

export interface DispatchCodeResult {
  task_id: string;
}

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

function buildChatBody(payload: SendMessagePayload): FormData | string {
  if (!payload.attachments?.length) {
    return JSON.stringify(payload);
  }

  const formData = new FormData();
  formData.append("prompt", payload.prompt);
  formData.append("persona_name", payload.persona_name ?? "PROJECT MODE");
  if (payload.session_id !== undefined && payload.session_id !== null) {
    formData.append("session_id", String(payload.session_id));
  }

  const metadata = payload.attachments.map((attachment) => ({
    name: attachment.file.name,
    kind: attachment.kind,
    relativePath: attachment.relativePath ?? attachment.file.name,
    type: attachment.file.type,
  }));
  formData.append("attachments_meta", JSON.stringify(metadata));

  for (const attachment of payload.attachments) {
    formData.append("attachments", attachment.file, attachment.file.name);
  }

  return formData;
}

async function* openSseResponse<T>(res: Response): AsyncGenerator<T> {
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
      if (!line.startsWith("data: ")) {
        continue;
      }
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) {
        continue;
      }
      try {
        yield JSON.parse(jsonStr) as T;
      } catch {
        // Ignore malformed SSE frames.
      }
    }
  }
}

async function* openSseStream<T>(url: string): AsyncGenerator<T> {
  const res = await fetch(url);
  yield* openSseResponse<T>(res);
}

export async function* sendMessage(
  payload: SendMessagePayload,
): AsyncGenerator<SSEMessage> {
  const body = buildChatBody(payload);
  const headers =
    typeof body === "string" ? { "Content-Type": "application/json" } : undefined;

  const res = await fetch(SSE_ENDPOINT, {
    method: "POST",
    headers,
    body,
  });

  for await (const event of openSseResponse<SSEMessage>(res)) {
    yield event;
    if (event.type === "done" || event.type === "error") {
      return;
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

export async function dispatchCode(
  payload: DispatchCodePayload,
): Promise<DispatchCodeResult> {
  return safeFetch<DispatchCodeResult>(`${NEXT_API_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function* fetchTaskStream(
  taskId: string,
): AsyncGenerator<Record<string, unknown>> {
  yield* openSseStream(`${NEXT_API_URL}/tasks/${taskId}/stream`);
}

export async function startAgenticLoop(
  payload: StartLoopPayload,
): Promise<StartLoopResult> {
  return safeFetch<StartLoopResult>(`${NEXT_API_URL}/autopilot/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function abortAgenticLoop(loopId: string): Promise<void> {
  await safeFetch(`${NEXT_API_URL}/autopilot/${loopId}/abort`, {
    method: "POST",
  });
}

export async function* streamLoopEvents(
  loopId: string,
): AsyncGenerator<LoopEvent> {
  yield* openSseStream<LoopEvent>(
    `${NEXT_API_URL}/autopilot/${loopId}/stream`,
  );
}

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

