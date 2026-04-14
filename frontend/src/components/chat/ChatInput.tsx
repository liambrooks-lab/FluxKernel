"use client";

import React, { useRef, useState, KeyboardEvent } from "react";
import { Paperclip, Send, Loader2, Mic } from "lucide-react";
import { useFluxStore } from "@/store/useFluxStore";
import { cn } from "@/lib/utils";

export function ChatInput() {
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, isStreaming } = useFluxStore();

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      setContent((prev) => prev + (prev.length > 0 ? " " : "") + "[🎙 Recording...]");
    } else {
      setContent((prev) => prev.replace("[🎙 Recording...]", "").trim() + " (Voice transcribed text)");
    }
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) return;
    setContent("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = content.trim().length > 0 && !isStreaming;

  return (
    <div className={cn(
      "relative flex w-full max-w-4xl mx-auto items-end gap-2 rounded-xl border bg-card/60 p-2 shadow-sm transition-shadow backdrop-blur-xl",
      isStreaming ? "border-border/40" : "border-border focus-within:ring-1 focus-within:ring-border/80"
    )}>
      <button
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex-shrink-0"
        aria-label="Attach file"
        disabled={isStreaming}
      >
        <Paperclip className="h-4 w-4" />
      </button>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => { setContent(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        placeholder={isStreaming ? "Kernel is thinking..." : "Send a message to FluxKernel..."}
        disabled={isStreaming}
        className="max-h-[120px] min-h-[36px] w-full resize-none border-0 bg-transparent py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-60"
        rows={1}
      />

      <button
        onClick={toggleRecording}
        disabled={isStreaming}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md transition-colors flex-shrink-0",
          isRecording 
            ? "bg-red-500 text-white animate-pulse" 
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
        aria-label="Toggle voice recording"
      >
        <Mic className="h-4 w-4" />
      </button>

      <button
        onClick={handleSend}
        disabled={!canSend && !isRecording}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md text-primary-foreground transition-all flex-shrink-0",
          !canSend && !isRecording ? "opacity-40 cursor-not-allowed bg-primary/80" : "bg-primary hover:opacity-90"
        )}
        aria-label="Send message"
      >
        {isStreaming
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Send className="h-4 w-4" />
        }
      </button>
    </div>
  );
}