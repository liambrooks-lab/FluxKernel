"use client";

import React from "react";
import { Check, X } from "lucide-react";

interface DiffViewerProps {
  beforeCode: string;
  afterCode: string;
  filename: string;
}

export function DiffViewer({ beforeCode, afterCode, filename }: DiffViewerProps) {
  return (
    <div className="flex flex-col w-full rounded-lg border border-border/60 bg-background shadow-md overflow-hidden my-4">
      <div className="flex items-center justify-between bg-muted/20 px-4 py-2 border-b border-border/60">
        <span className="text-sm font-medium text-foreground inline-flex items-center gap-2">
          Review Changes
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-md">{filename}</span>
        </span>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-medium">
            <X className="h-3.5 w-3.5" /> Reject
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors text-xs font-medium">
            <Check className="h-3.5 w-3.5" /> Approve
          </button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row w-full divide-y md:divide-y-0 md:divide-x divide-border/60 text-[13px] font-mono">
        <div className="flex-1 overflow-x-auto bg-destructive/5">
          <div className="px-4 py-2 border-b border-border/40 text-[11px] uppercase tracking-wider text-destructive/80 flex items-center justify-between">
            <span>Original</span>
            <span className="opacity-60">- deletions</span>
          </div>
          <pre className="p-4 text-destructive/90 leading-relaxed whitespace-pre font-mono">
            <code>{beforeCode}</code>
          </pre>
        </div>
        <div className="flex-1 overflow-x-auto bg-emerald-500/5">
          <div className="px-4 py-2 border-b border-border/40 text-[11px] uppercase tracking-wider text-emerald-500/80 flex items-center justify-between">
            <span>Modified</span>
            <span className="opacity-60">+ additions</span>
          </div>
          <pre className="p-4 text-emerald-500/90 leading-relaxed whitespace-pre font-mono">
            <code>{afterCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}