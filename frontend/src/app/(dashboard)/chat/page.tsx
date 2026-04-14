"use client";

import React from "react";

import { ChatInput } from "@/components/chat/ChatInput";
import { MessageStream } from "@/components/chat/MessageStream";
import { ModeSelector } from "@/components/chat/ModeSelector";

export default function ChatPage() {
  return (
    <div className="relative flex h-full max-h-full flex-col">
      <div className="border-b border-border/60 bg-background/70 pt-4 backdrop-blur-xl">
        <ModeSelector />
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <MessageStream />
      </div>

      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-5 pt-3">
        <ChatInput />
      </div>
    </div>
  );
}

