"use client";

import React from "react";
import { MessageStream } from "@/components/chat/MessageStream";
import { ChatInput } from "@/components/chat/ChatInput";

export default function ChatPage() {
  return (
    <div className="flex flex-col h-full relative max-h-full">
      {/* Scrollable Message Area */}
      <div className="flex-1 overflow-y-auto px-4">
        <MessageStream />
      </div>

      {/* Pinned Chat Input */}
      <div className="pt-2 pb-4 px-4 sticky bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent">
        <ChatInput />
      </div>
    </div>
  );
}
