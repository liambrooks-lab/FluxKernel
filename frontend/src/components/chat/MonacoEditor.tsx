"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MonacoEditorProps {
  code: string;
  language?: string;
}

export function MonacoEditor({ code, language = "typescript" }: MonacoEditorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col rounded-lg border border-border/40 bg-black/40 overflow-hidden my-3 shadow-md backdrop-blur-sm relative group">
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-border/40">
        <span className="text-xs font-medium text-muted-foreground/80 lowercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy Code"}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-[13px] leading-relaxed font-mono text-zinc-300">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}