export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const NEXT_API_URL = "/api";

export const SIDEBAR_LEFT_WIDTH = 256;
export const SIDEBAR_RIGHT_WIDTH = 320;
export const TOPBAR_HEIGHT = 48;
export const MOBILE_BREAKPOINT = 768;

export const DEFAULT_THEME = "dark" as const;

export const ACCENT_COLORS = {
  amber: "hsl(35 91% 55%)",
  slate: "hsl(215 16% 47%)",
  destructive: "hsl(0 84% 60%)",
  muted: "hsl(220 9% 46%)",
} as const;

export const SSE_ENDPOINT = `${NEXT_API_URL}/chat`;

export type CognitiveModeId =
  | "PROJECT"
  | "PLANNER"
  | "CODER"
  | "DATA";

export interface CognitiveModeDefinition {
  id: CognitiveModeId;
  label: string;
  personaName: string;
  shortLabel: string;
  description: string;
  accentClass: string;
}

export const COGNITIVE_MODES: CognitiveModeDefinition[] = [
  {
    id: "PROJECT",
    label: "PROJECT MODE",
    shortLabel: "Project",
    personaName: "PROJECT MODE",
    description: "Persistent project memory with pinned workspace context.",
    accentClass: "from-cyan-500/20 via-sky-500/10 to-transparent",
  },
  {
    id: "PLANNER",
    label: "PLANNER & SCHEDULE MODE",
    shortLabel: "Planner",
    personaName: "PLANNER & SCHEDULE MODE",
    description: "Strict JSON plans for timelines, dependencies, and boards.",
    accentClass: "from-emerald-500/20 via-lime-500/10 to-transparent",
  },
  {
    id: "CODER",
    label: "CODER MODE",
    shortLabel: "Coder",
    personaName: "CODER MODE",
    description: "Compiler-backed implementation with verification metadata.",
    accentClass: "from-orange-500/20 via-amber-500/10 to-transparent",
  },
  {
    id: "DATA",
    label: "DATA ANALYSIS MODE",
    shortLabel: "Data",
    personaName: "DATA ANALYSIS MODE",
    description: "Pandas and matplotlib sandbox execution with chart artifacts.",
    accentClass: "from-fuchsia-500/20 via-rose-500/10 to-transparent",
  },
];

export const DEFAULT_MODE = COGNITIVE_MODES[0];

