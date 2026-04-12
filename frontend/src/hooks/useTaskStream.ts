/**
 * useTaskStream.ts
 * Custom hook that opens an SSE stream for a Celery background task
 * and returns live status, stdout, stderr, and completion state.
 *
 * Usage:
 *   const { status, stdout, stderr, isComplete } = useTaskStream(taskId);
 */
"use client";

import { useEffect, useState, useRef } from "react";

export type TaskState =
  | "PENDING"
  | "STARTED"
  | "SUCCESS"
  | "FAILURE"
  | "REVOKED"
  | "done"
  | "idle";

export interface TaskStreamResult {
  status: TaskState;
  stdout: string;
  stderr: string;
  isComplete: boolean;
  language: string;
  exitCode: number | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useTaskStream(taskId: string | null): TaskStreamResult {
  const [status, setStatus] = useState<TaskState>("idle");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [language, setLanguage] = useState("");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!taskId) return;

    // Reset state for new task
    setStatus("PENDING");
    setStdout("");
    setStderr("");
    setIsComplete(false);
    setExitCode(null);

    abortRef.current = new AbortController();

    const streamUrl = `${API_BASE}/api/v1/tasks/${taskId}/stream`;

    async function stream() {
      try {
        const res = await fetch(streamUrl, {
          signal: abortRef.current!.signal,
        });
        if (!res.ok || !res.body) return;

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
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6).trim());
              const state: TaskState = payload.state;
              setStatus(state);

              if (payload.stdout !== undefined) setStdout(payload.stdout);
              if (payload.stderr !== undefined) setStderr(payload.stderr);
              if (payload.language) setLanguage(payload.language);
              if (payload.exit_code != null) setExitCode(payload.exit_code);

              if (state === "SUCCESS" || state === "FAILURE" || state === "done") {
                setIsComplete(true);
                return;
              }
            } catch {
              // Malformed frame — skip
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setStderr(`Stream connection failed: ${err.message}`);
          setIsComplete(true);
        }
      }
    }

    stream();

    return () => {
      abortRef.current?.abort();
    };
  }, [taskId]);

  return { status, stdout, stderr, isComplete, language, exitCode };
}
