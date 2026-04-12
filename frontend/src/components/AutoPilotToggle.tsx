/**
 * AutoPilotToggle.tsx
 * Floating Auto-Pilot control panel with:
 *   - Switch to toggle autonomous loop mode
 *   - Animated progress bar showing loop iteration (N / 5)
 *   - Hard "Abort Loop" button (always visible when loop is running)
 *   - Status badge reflecting loop state
 */
"use client";

import React from "react";
import * as Switch from "@radix-ui/react-switch";
import { useFluxStore } from "@/store/useFluxStore";
import {
  Bot,
  Zap,
  StopCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  idle: {
    label: "Auto-Pilot Idle",
    color: "text-muted-foreground",
    icon: <Bot className="w-4 h-4" />,
  },
  running: {
    label: "Loop Running…",
    color: "text-violet-400",
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
  },
  completed: {
    label: "Loop Complete",
    color: "text-emerald-400",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  aborted: {
    label: "Loop Aborted",
    color: "text-amber-400",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  failed: {
    label: "Loop Failed",
    color: "text-red-400",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
} as const;

export function AutoPilotToggle() {
  const {
    isAutoPilot,
    loopStatus,
    loopIteration,
    activeLoopId,
    toggleAutoPilot,
    abortAgenticLoop,
  } = useFluxStore();

  const cfg = STATUS_CONFIG[loopStatus] ?? STATUS_CONFIG.idle;
  const maxIterations = 5;
  const progress = loopStatus === "running"
    ? Math.round(((loopIteration - 1) / maxIterations) * 100)
    : loopStatus === "completed" ? 100 : 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-white/10 bg-card/80 backdrop-blur-sm p-3",
        "shadow-lg transition-all duration-300",
        loopStatus === "running" && "border-violet-500/40 shadow-violet-500/10"
      )}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold tracking-wide",
              cfg.color
            )}
          >
            {cfg.icon}
            {cfg.label}
          </span>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground select-none">
            Auto-Pilot
          </span>
          <Switch.Root
            id="autopilot-toggle"
            checked={isAutoPilot}
            onCheckedChange={toggleAutoPilot}
            disabled={loopStatus === "running"}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isAutoPilot
                ? "bg-violet-600"
                : "bg-muted"
            )}
          >
            <Switch.Thumb
              className={cn(
                "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                "translate-x-0.5 data-[state=checked]:translate-x-4"
              )}
            />
          </Switch.Root>
        </div>
      </div>

      {/* Progress Bar (visible when running) */}
      {loopStatus === "running" && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-violet-400" />
              Iteration {loopIteration} / {maxIterations}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Abort Button */}
      {(loopStatus === "running" && activeLoopId) && (
        <button
          id="autopilot-abort-btn"
          onClick={() => abortAgenticLoop()}
          className={cn(
            "flex items-center justify-center gap-1.5 w-full rounded-lg",
            "py-1.5 text-xs font-semibold text-red-400 border border-red-500/30",
            "bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/60",
            "transition-all duration-150 active:scale-[0.97]"
          )}
        >
          <StopCircle className="w-3.5 h-3.5" />
          Abort Loop
        </button>
      )}
    </div>
  );
}
