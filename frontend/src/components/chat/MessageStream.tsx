"use client";

import React, { useEffect, useRef } from "react";
import Image from "next/image";

import { useFluxStore } from "@/store/useFluxStore";
import { MonacoEditor } from "./MonacoEditor";

type StructuredMessage =
  | {
      type: "project_mode";
      answer: string;
      retrieved_context_paths?: string[];
      pinned_paths?: string[];
      follow_up_actions?: string[];
    }
  | {
      type: "planner_mode";
      title: string;
      summary: string;
      tasks: Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        start: string;
        end: string;
        owner?: string;
        effort_points?: number;
      }>;
      dependencies?: Array<{
        from_task_id: string;
        to_task_id: string;
        kind: string;
      }>;
      timeline?: {
        start: string;
        end: string;
        milestones?: string[];
      };
    }
  | {
      type: "coder_mode";
      summary: string;
      implementation_notes?: string[];
      diff_hints?: string[];
      code_artifacts?: Array<{
        path: string;
        language: string;
        content: string;
      }>;
      verification?: Array<{
        language: string;
        success: boolean;
        exit_code: number;
        stderr?: string;
      }>;
    }
  | {
      type: "data_analysis_mode";
      summary: string;
      insights?: string[];
      output_files?: Array<{
        path: string;
        media_type: string;
        description: string;
      }>;
      stderr?: string;
    };

function parseStructuredMessage(content: string): StructuredMessage | null {
  try {
    const parsed = JSON.parse(content) as StructuredMessage;
    if (parsed && typeof parsed === "object" && "type" in parsed) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function StructuredKernelMessage({ content }: { content: string }) {
  const parsed = parseStructuredMessage(content);
  if (!parsed) {
    return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>;
  }

  if (parsed.type === "project_mode") {
    return (
      <div className="space-y-4">
        <p className="whitespace-pre-wrap leading-relaxed">{parsed.answer}</p>
        {!!parsed.retrieved_context_paths?.length && (
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Retrieved Context
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {parsed.retrieved_context_paths.map((path) => (
                <span
                  key={path}
                  className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs text-foreground"
                >
                  {path}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (parsed.type === "planner_mode") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">{parsed.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{parsed.summary}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {parsed.tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-2xl border border-border/70 bg-background/70 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">
                  {task.title}
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {task.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{task.description}</p>
                <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                  <div>
                    {task.start} {"->"} {task.end}
                  </div>
                  <div>
                    Owner: {task.owner ?? "unassigned"} | Effort: {task.effort_points ?? 1}
                </div>
              </div>
            </div>
          ))}
        </div>

        {!!parsed.dependencies?.length && (
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Dependencies
            </div>
            <div className="mt-3 space-y-2 text-sm text-foreground/90">
              {parsed.dependencies.map((dependency, index) => (
                <div key={`${dependency.from_task_id}-${dependency.to_task_id}-${index}`}>
                  {dependency.from_task_id} {"->"} {dependency.to_task_id} ({dependency.kind})
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (parsed.type === "coder_mode") {
    return (
      <div className="space-y-4">
        <div>
          <p className="whitespace-pre-wrap leading-relaxed">{parsed.summary}</p>
          {!!parsed.implementation_notes?.length && (
            <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              {parsed.implementation_notes.map((note, index) => (
                <div key={index}>{note}</div>
              ))}
            </div>
          )}
        </div>

        {!!parsed.verification?.length && (
          <div className="grid gap-3 md:grid-cols-2">
            {parsed.verification.map((item, index) => (
              <div
                key={`${item.language}-${index}`}
                className="rounded-2xl border border-border/70 bg-background/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{item.language}</span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${
                      item.success
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {item.success ? "verified" : "failed"}
                  </span>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Exit code: {item.exit_code}
                </div>
                {item.stderr ? (
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-rose-200">
                    {item.stderr}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {!!parsed.code_artifacts?.length && (
          <div className="space-y-4">
            {parsed.code_artifacts.map((artifact, index) => (
              <div key={`${artifact.path}-${index}`} className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {artifact.path}
                </div>
                <MonacoEditor code={artifact.content} language={artifact.language} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="whitespace-pre-wrap leading-relaxed">{parsed.summary}</p>
      {!!parsed.insights?.length && (
        <div className="space-y-2 text-sm text-foreground/90">
          {parsed.insights.map((insight, index) => (
            <div key={index}>{insight}</div>
          ))}
        </div>
      )}
      {!!parsed.output_files?.length && (
        <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Generated Artifacts
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {parsed.output_files.map((file, index) => (
              <div key={`${file.path}-${index}`} className="flex items-center justify-between gap-3">
                <span className="truncate text-foreground">{file.path}</span>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {file.media_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {parsed.stderr ? (
        <pre className="overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-amber-200">
          {parsed.stderr}
        </pre>
      ) : null}
    </div>
  );
}

export function MessageStream() {
  const { messages } = useFluxStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%),linear-gradient(180deg,transparent,rgba(255,255,255,0.02))]" />
        <div className="relative flex flex-col items-center justify-center px-6 text-center">
          <div className="pointer-events-none flex flex-col items-center opacity-25">
            <Image
              src="/logo.svg"
              alt="FluxKernel logo"
              width={144}
              height={144}
              className="h-28 w-28 md:h-36 md:w-36"
            />
            <Image
              src="/brand.svg"
              alt="FluxKernel brand"
              width={220}
              height={56}
              className="mt-5 h-10 w-auto md:h-14"
            />
          </div>
          <p className="mt-8 max-w-xl text-sm text-muted-foreground">
            Start a session in one of the specialized cognitive modes to ground project context, generate strict plans, verify code, or execute real data analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-6">
      {messages.map((message) => {
        const isUser = message.role === "user";

        return (
          <div
            key={message.id}
            className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
          >
            <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {isUser ? "Operator" : message.mode ?? "FluxKernel"}
            </div>
            <div
              className={`w-full max-w-[90%] rounded-[28px] px-5 py-4 text-sm ${
                isUser
                  ? "bg-accent/80 text-accent-foreground border border-border/60 rounded-br-md shadow-sm"
                  : "border border-border/60 bg-card/50 text-foreground shadow-[0_18px_60px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl"
              }`}
            >
              {isUser ? (
                <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
              ) : (
                <StructuredKernelMessage content={message.content} />
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
