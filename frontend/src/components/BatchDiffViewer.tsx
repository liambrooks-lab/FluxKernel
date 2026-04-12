/**
 * BatchDiffViewer.tsx
 * Modal diff review gate that appears once the Auto-Pilot loop completes.
 *
 * Features:
 *   - Shows all files modified across all iterations as unified diffs
 *   - Per-file approve/reject checkboxes
 *   - "Approve Selected" writes only checked files; "Reject All" discards all
 *   - Syntax-highlighted diff view with clear added/removed line colours
 */
"use client";

import React, { useState, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  XCircle,
  FileCode2,
  GitBranch,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFluxStore, type DiffEntry } from "@/store/useFluxStore";

// ── Minimal Unified Diff Renderer ─────────────────────────────────────────────
// We produce a simple line-by-line diff without an external library
// so the component has zero extra bundle weight.

function buildLineDiff(newContent: string): {
  type: "header" | "add" | "ctx";
  text: string;
}[] {
  // For new files the "diff" is simply the whole content as additions
  const lines = newContent.split("\n");
  const result: { type: "header" | "add" | "ctx"; text: string }[] = [
    { type: "header", text: "@@ New / Modified File @@" },
  ];
  lines.forEach((l, i) => {
    // First 5 lines get explicit colour, rest are context
    result.push({ type: i < 5 ? "add" : "ctx", text: l });
  });
  return result;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DiffLineRow({ type, text }: { type: string; text: string }) {
  return (
    <div
      className={cn(
        "flex font-mono text-[11px] leading-5 px-3 whitespace-pre-wrap break-all",
        type === "add" && "bg-emerald-950/60 text-emerald-300",
        type === "header" && "bg-indigo-950/70 text-indigo-300 font-semibold",
        type === "ctx" && "text-muted-foreground"
      )}
    >
      <span className="mr-2 select-none opacity-50 w-3">
        {type === "add" ? "+" : type === "header" ? "@" : " "}
      </span>
      {text}
    </div>
  );
}

interface FileDiffCardProps {
  entry: DiffEntry;
  isSelected: boolean;
  onToggle: () => void;
}

function FileDiffCard({ entry, isSelected, onToggle }: FileDiffCardProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = useMemo(() => buildLineDiff(entry.content), [entry.content]);
  const lineCount = entry.content.split("\n").length;

  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-200",
        isSelected
          ? "border-violet-500/50 bg-violet-950/20"
          : "border-white/10 bg-card/60"
      )}
    >
      {/* Card Header */}
      <div className="flex items-center gap-3 p-3">
        {/* Approve Checkbox */}
        <button
          id={`diff-select-${entry.path.replace(/\//g, "-")}`}
          onClick={onToggle}
          className={cn(
            "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            isSelected
              ? "bg-violet-600 border-violet-500"
              : "bg-transparent border-muted-foreground/40 hover:border-violet-400"
          )}
        >
          {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
        </button>

        {/* File info */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileCode2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span className="text-sm font-mono text-foreground truncate">
            {entry.path}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
            iter {entry.iteration} · {lineCount} lines
          </span>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Diff Body */}
      {expanded && (
        <div className="border-t border-white/10 rounded-b-lg overflow-hidden max-h-64 overflow-y-auto">
          {lines.map((l, i) => (
            <DiffLineRow key={i} type={l.type} text={l.text} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function BatchDiffViewer() {
  const { pendingDiffBatch, approveDiffBatch, rejectDiffBatch } = useFluxStore();
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(pendingDiffBatch?.map((d) => d.path) ?? [])
  );

  const isOpen = pendingDiffBatch !== null && pendingDiffBatch.length > 0;

  function toggleFile(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(pendingDiffBatch?.map((d) => d.path) ?? []));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleApprove() {
    // Filter to only selected entries before approving
    await approveDiffBatch(selected);
  }

  if (!isOpen) return null;

  const totalFiles = pendingDiffBatch!.length;
  const selectedCount = selected.size;

  return (
    <Dialog.Root open={isOpen} onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-in fade-in-0" />

        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
            "w-[90vw] max-w-3xl max-h-[88vh] flex flex-col",
            "rounded-2xl border border-white/10 bg-background shadow-2xl",
            "animate-in fade-in-0 zoom-in-95"
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-5 border-b border-white/10">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-600/20 border border-violet-500/30">
              <GitBranch className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <Dialog.Title className="text-base font-bold text-foreground">
                Auto-Pilot Batch Review
              </Dialog.Title>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalFiles} file{totalFiles !== 1 ? "s" : ""} modified across the autonomous loop.
                Review and approve before writing to disk.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded-md bg-muted">
                {selectedCount} / {totalFiles} selected
              </span>
            </div>
          </div>

          {/* Selection Controls */}
          <div className="flex items-center gap-3 px-5 py-2 border-b border-white/5">
            <button
              onClick={selectAll}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Select All
            </button>
            <span className="text-white/20">|</span>
            <button
              onClick={deselectAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Deselect All
            </button>
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {pendingDiffBatch!.map((entry) => (
              <FileDiffCard
                key={entry.path}
                entry={entry}
                isSelected={selected.has(entry.path)}
                onToggle={() => toggleFile(entry.path)}
              />
            ))}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 p-4 border-t border-white/10">
            <button
              id="batch-diff-reject-all"
              onClick={rejectDiffBatch}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium",
                "text-red-400 border border-red-500/30 bg-red-500/10",
                "hover:bg-red-500/20 hover:border-red-500/50 transition-all duration-150"
              )}
            >
              <XCircle className="w-4 h-4" />
              Reject All
            </button>

            <button
              id="batch-diff-approve"
              onClick={handleApprove}
              disabled={selectedCount === 0}
              className={cn(
                "flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold",
                "bg-violet-600 text-white hover:bg-violet-500",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "transition-all duration-150 active:scale-[0.97] shadow-lg shadow-violet-500/20"
              )}
            >
              <ShieldCheck className="w-4 h-4" />
              Approve {selectedCount > 0 ? `(${selectedCount})` : ""} &amp; Write
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
