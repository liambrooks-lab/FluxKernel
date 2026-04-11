"use client";

import React, { useEffect, useRef } from "react";
import { useFluxStore } from "@/store/useFluxStore";
import { MonacoEditor } from "./MonacoEditor";

export function MessageStream() {
  const { messages } = useFluxStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">FluxKernel</h2>
        <p className="mt-2 text-sm text-muted-foreground">All systems online. Ready for input.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto py-4">
      {messages.map((message) => {
        const isUser = message.role === "user";
        return (
          <div
            key={message.id}
            className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm ${
                isUser
                  ? "bg-accent/80 text-accent-foreground border border-border/50 rounded-br-sm shadow-sm"
                  : "bg-transparent text-foreground"
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
              
              {/* Development Mockup: Hardcoded code block detection for demonstration */}
              {!isUser && message.content.includes("```") && (
                <div className="mt-4 w-full">
                   <MonacoEditor code="interface KernelModule {&#10;  id: string;&#10;  status: 'active' | 'idle';&#10;}&#10;&#10;export const init = (): KernelModule => {&#10;  return { id: 'sys_01', status: 'active' };&#10;};" />
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}