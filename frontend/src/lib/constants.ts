// ── API ───────────────────────────────────────────────────────────────────────
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const NEXT_API_URL = "/api";

// ── Layout ────────────────────────────────────────────────────────────────────
export const SIDEBAR_LEFT_WIDTH  = 256; // px
export const SIDEBAR_RIGHT_WIDTH = 320; // px
export const TOPBAR_HEIGHT       = 48;  // px
export const MOBILE_BREAKPOINT   = 768; // px

// ── Theme ─────────────────────────────────────────────────────────────────────
export const DEFAULT_THEME = "dark" as const;

export const ACCENT_COLORS = {
  violet: "hsl(263, 70%, 60%)",
  indigo: "hsl(239, 84%, 67%)",
  destructive: "hsl(0, 84%, 60%)",
  muted: "hsl(240, 5%, 65%)",
} as const;

// ── Streaming / AI ────────────────────────────────────────────────────────────
export const SSE_ENDPOINT = `${NEXT_API_URL}/chat`;

export const PERSONA_DEFAULTS = {
  name: "Standard",
  intensity: 50,
  systemPrompt: "You are FluxKernel, a highly capable AI OS agent.",
} as const;