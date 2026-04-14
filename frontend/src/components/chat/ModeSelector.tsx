"use client";

import { BrainCircuit, CalendarRange, ChartNoAxesCombined, Code2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { COGNITIVE_MODES } from "@/lib/constants";
import { useFluxStore } from "@/store/useFluxStore";

const MODE_ICONS = {
  "PROJECT MODE": BrainCircuit,
  "PLANNER & SCHEDULE MODE": CalendarRange,
  "CODER MODE": Code2,
  "DATA ANALYSIS MODE": ChartNoAxesCombined,
} as const;

export function ModeSelector() {
  const { activePersona, setActivePersona, isStreaming } = useFluxStore();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-4 pb-4">
      {COGNITIVE_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode.label as keyof typeof MODE_ICONS];
        const selected = activePersona === mode.personaName;

        return (
          <button
            key={mode.id}
            type="button"
            disabled={isStreaming}
            onClick={() => setActivePersona(mode.personaName)}
            className={cn(
              "group relative overflow-hidden rounded-full border px-4 py-2 text-left transition-all",
              "disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "border-white/20 bg-white/10 text-foreground shadow-lg shadow-black/10"
                : "border-border/70 bg-background/80 text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300",
                mode.accentClass,
                selected && "opacity-100",
              )}
            />
            <div className="relative flex items-center gap-3">
              <span className="rounded-full border border-white/10 bg-black/20 p-1.5">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-foreground/90">
                  {mode.shortLabel.toUpperCase()}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {mode.description}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
