/**
 * useFluxStore.ts — Central Zustand store for FluxKernel UI state.
 *
 * Extended in this version with:
 *  - Feature 4: Auto-Pilot loop state & actions (isAutoPilot, loopStatus, etc.)
 */
import { create } from "zustand";
import { sendMessage as apiSendMessage, startAgenticLoop, abortAgenticLoop as apiAbortLoop, streamLoopEvents, approveCodeDiff } from "@/lib/apiClient";
import { PERSONA_DEFAULTS } from "@/lib/constants";

export interface Message {
  id: string;
  role: "user" | "kernel";
  content: string;
  timestamp: number;
}

export interface DiffEntry {
  path: string;
  content: string;
  iteration: number;
}

export type LoopStatus = "idle" | "running" | "completed" | "aborted" | "failed";

interface FluxState {
  // ── Existing chat state ────────────────────────────────────────────────────
  activePersona: string;
  activeFile: string | null;
  isMobileSidebarOpen: boolean;
  messages: Message[];
  isStreaming: boolean;
  sessionId: number | null;

  setActivePersona: (persona: string) => void;
  setActiveFile: (file: string | null) => void;
  setMobileSidebarOpen: (isOpen: boolean) => void;
  toggleMobileSidebar: () => void;
  addMessage: (message: Message) => void;
  setStreaming: (isStreaming: boolean) => void;

  /**
   * Appends the user message immediately, then opens an SSE stream and
   * progressively builds the kernel reply token-by-token in the store.
   * If isAutoPilot is enabled, routes to the agentic loop instead.
   */
  sendMessage: (prompt: string) => Promise<void>;

  // ── Feature 4: Auto-Pilot state ────────────────────────────────────────────
  isAutoPilot: boolean;
  activeLoopId: string | null;
  loopIteration: number;
  loopStatus: LoopStatus;

  /** Accumulated diffs from the completed loop; shown in BatchDiffViewer. */
  pendingDiffBatch: DiffEntry[] | null;

  /** Toggle Auto-Pilot mode on/off. Cannot toggle while a loop is running. */
  toggleAutoPilot: () => void;

  /** Abort the currently running agentic loop. */
  abortAgenticLoop: () => Promise<void>;

  /**
   * Write the approved (and optionally filtered) files to disk.
   * @param approvedPaths - Set of workspace paths to persist. If omitted, approves all.
   */
  approveDiffBatch: (approvedPaths?: Set<string>) => Promise<void>;

  /** Discard the pending diff batch without writing anything. */
  rejectDiffBatch: () => void;
}

export const useFluxStore = create<FluxState>((set, get) => ({
  // ── Existing defaults ──────────────────────────────────────────────────────
  activePersona: PERSONA_DEFAULTS.name,
  activeFile: null,
  isMobileSidebarOpen: false,
  messages: [],
  isStreaming: false,
  sessionId: null,

  setActivePersona: (persona) => set({ activePersona: persona }),
  setActiveFile: (file) => set({ activeFile: file }),
  setMobileSidebarOpen: (isOpen) => set({ isMobileSidebarOpen: isOpen }),
  toggleMobileSidebar: () =>
    set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setStreaming: (isStreaming) => set({ isStreaming }),

  // ── Auto-Pilot defaults ────────────────────────────────────────────────────
  isAutoPilot: false,
  activeLoopId: null,
  loopIteration: 0,
  loopStatus: "idle",
  pendingDiffBatch: null,

  toggleAutoPilot: () => {
    const { loopStatus } = get();
    if (loopStatus === "running") return; // Cannot toggle mid-loop
    set((state) => ({ isAutoPilot: !state.isAutoPilot }));
  },

  // ── sendMessage — routes to standard SSE chat OR agentic loop ─────────────
  sendMessage: async (prompt: string) => {
    const { activePersona, sessionId, isAutoPilot } = get();

    // Build and immediately append the user message
    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, userMsg], isStreaming: true }));

    // ── Auto-Pilot branch ──────────────────────────────────────────────────
    if (isAutoPilot) {
      const kernelMsgId = `kernel_${Date.now()}`;
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: kernelMsgId,
            role: "kernel",
            content: "🤖 **Auto-Pilot Engaged** — Starting autonomous loop…",
            timestamp: Date.now(),
          },
        ],
        loopStatus: "running",
        loopIteration: 0,
      }));

      try {
        const { loop_id } = await startAgenticLoop({
          prompt,
          persona_name: activePersona,
          system_prompt: PERSONA_DEFAULTS.systemPrompt,
        });

        set({ activeLoopId: loop_id });

        // Stream loop events
        for await (const event of streamLoopEvents(loop_id)) {
          const { loopStatus: currentStatus } = get();
          if (currentStatus === "aborted") break;

          if (event.event === "iteration_start") {
            set({ loopIteration: event.iteration });
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === kernelMsgId
                  ? {
                      ...m,
                      content: m.content + `\n\n🔄 **Iteration ${event.iteration} / ${event.max_iterations}** — Planning…`,
                    }
                  : m
              ),
            }));
          } else if (event.event === "file_written") {
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === kernelMsgId
                  ? { ...m, content: m.content + `\n  ✏ Wrote \`${event.path}\`` }
                  : m
              ),
            }));
          } else if (event.event === "test_result") {
            const icon = event.success ? "✅" : "❌";
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === kernelMsgId
                  ? {
                      ...m,
                      content:
                        m.content +
                        `\n  ${icon} Test ${event.success ? "passed" : "failed"} (exit ${event.exit_code})` +
                        (event.stderr ? `\n\`\`\`\n${event.stderr.slice(0, 300)}\n\`\`\`` : ""),
                    }
                  : m
              ),
            }));
          } else if (event.event === "loop_done") {
            const batch: DiffEntry[] = (event.diff_batch ?? []).map((d: DiffEntry) => ({
              path: d.path,
              content: d.content,
              iteration: d.iteration,
            }));
            set({
              loopStatus: "completed",
              pendingDiffBatch: batch,
            });
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === kernelMsgId
                  ? {
                      ...m,
                      content:
                        m.content +
                        `\n\n✨ **Loop Complete** — ${batch.length} file(s) ready for review.`,
                    }
                  : m
              ),
            }));
          } else if (event.event === "loop_aborted") {
            set({ loopStatus: "aborted" });
          } else if (event.event === "plan_error") {
            set({ loopStatus: "failed" });
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === kernelMsgId
                  ? { ...m, content: m.content + `\n\n⚠ **Plan Error**: ${event.error}` }
                  : m
              ),
            }));
          } else if (event.event === "stream_end") {
            break;
          }
        }
      } catch (err) {
        const errText = err instanceof Error ? err.message : "Agentic loop failed.";
        set((state) => ({
          loopStatus: "failed",
          messages: state.messages.map((m) =>
            m.id === kernelMsgId ? { ...m, content: `⚠ ${errText}` } : m
          ),
        }));
      } finally {
        set({ isStreaming: false });
      }

      return;
    }

    // ── Standard SSE Chat branch (unchanged behaviour) ─────────────────────
    const kernelMsgId = `kernel_${Date.now()}`;
    const kernelMsg: Message = {
      id: kernelMsgId,
      role: "kernel",
      content: "",
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, kernelMsg] }));

    try {
      const stream = apiSendMessage({
        prompt,
        session_id: sessionId,
        persona_name: activePersona,
      });

      for await (const event of stream) {
        if (event.type === "message" && event.content) {
          if (event.session_id && get().sessionId === null) {
            set({ sessionId: event.session_id });
          }
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === kernelMsgId
                ? { ...m, content: m.content + event.content }
                : m
            ),
          }));
        } else if (event.type === "error") {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === kernelMsgId
                ? { ...m, content: `⚠ Error: ${event.message ?? "Unknown error."}` }
                : m
            ),
          }));
          break;
        }
      }
    } catch (err) {
      const errText =
        err instanceof Error ? err.message : "Could not reach the kernel.";
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === kernelMsgId ? { ...m, content: `⚠ ${errText}` } : m
        ),
      }));
    } finally {
      set({ isStreaming: false });
    }
  },

  // ── Auto-Pilot actions ─────────────────────────────────────────────────────

  abortAgenticLoop: async () => {
    const { activeLoopId } = get();
    if (!activeLoopId) return;
    await apiAbortLoop(activeLoopId);
    set({ loopStatus: "aborted" });
  },

  approveDiffBatch: async (approvedPaths?: Set<string>) => {
    const { pendingDiffBatch } = get();
    if (!pendingDiffBatch) return;

    const toWrite = approvedPaths
      ? pendingDiffBatch.filter((d) => approvedPaths.has(d.path))
      : pendingDiffBatch;

    await Promise.all(
      toWrite.map((entry) =>
        approveCodeDiff({ path: entry.path, content: entry.content })
      )
    );

    set({ pendingDiffBatch: null, activeLoopId: null, loopIteration: 0, loopStatus: "idle" });
  },

  rejectDiffBatch: () => {
    set({ pendingDiffBatch: null, activeLoopId: null, loopIteration: 0, loopStatus: "idle" });
  },
}));