import { create } from "zustand";

import {
  abortAgenticLoop as apiAbortLoop,
  approveCodeDiff,
  PendingAttachment,
  sendMessage as apiSendMessage,
  startAgenticLoop,
  streamLoopEvents,
} from "@/lib/apiClient";
import { COGNITIVE_MODES, DEFAULT_MODE } from "@/lib/constants";

export interface Message {
  id: string;
  role: "user" | "kernel";
  content: string;
  timestamp: number;
  mode?: string;
}

export interface DiffEntry {
  path: string;
  content: string;
  iteration: number;
}

export type LoopStatus = "idle" | "running" | "completed" | "aborted" | "failed";

interface FluxState {
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
  resetSession: () => void;
  sendMessage: (prompt: string, attachments?: PendingAttachment[]) => Promise<void>;

  isAutoPilot: boolean;
  activeLoopId: string | null;
  loopIteration: number;
  loopStatus: LoopStatus;
  pendingDiffBatch: DiffEntry[] | null;

  toggleAutoPilot: () => void;
  abortAgenticLoop: () => Promise<void>;
  approveDiffBatch: (approvedPaths?: Set<string>) => Promise<void>;
  rejectDiffBatch: () => void;

  voiceActive: boolean;
  voiceGender: "male" | "female";
  setVoiceActive: (active: boolean) => void;
  setVoiceGender: (gender: "male" | "female") => void;
}

const MODE_BY_PERSONA = new Map(
  COGNITIVE_MODES.map((mode) => [mode.personaName, mode]),
);

export const useFluxStore = create<FluxState>((set, get) => ({
  activePersona: DEFAULT_MODE.personaName,
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
  resetSession: () => set({ sessionId: null, messages: [] }),

  voiceActive: false,
  voiceGender: "male",
  setVoiceActive: (active) => set({ voiceActive: active }),
  setVoiceGender: (gender) => set({ voiceGender: gender }),

  isAutoPilot: false,
  activeLoopId: null,
  loopIteration: 0,
  loopStatus: "idle",
  pendingDiffBatch: null,

  toggleAutoPilot: () => {
    if (get().loopStatus === "running") {
      return;
    }
    set((state) => ({ isAutoPilot: !state.isAutoPilot }));
  },

  sendMessage: async (prompt: string, attachments: PendingAttachment[] = []) => {
    const { activePersona, sessionId, isAutoPilot } = get();
    const selectedMode = MODE_BY_PERSONA.get(activePersona);

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      mode: activePersona,
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
    }));

    if (isAutoPilot) {
      const kernelMsgId = `kernel_${Date.now()}`;
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: kernelMsgId,
            role: "kernel",
            content: "Auto-Pilot engaged. Starting autonomous loop...",
            timestamp: Date.now(),
            mode: activePersona,
          },
        ],
        loopStatus: "running",
        loopIteration: 0,
      }));

      try {
        const { loop_id } = await startAgenticLoop({
          prompt,
          persona_name: activePersona,
          system_prompt: selectedMode?.description ?? "FluxKernel autonomous mode",
        });

        set({ activeLoopId: loop_id });

        for await (const event of streamLoopEvents(loop_id)) {
          if (get().loopStatus === "aborted") {
            break;
          }

          if (event.event === "iteration_start") {
            set({ loopIteration: Number(event.iteration ?? 0) });
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === kernelMsgId
                  ? {
                      ...message,
                      content:
                        message.content +
                        `\n\nIteration ${event.iteration} / ${event.max_iterations}: planning...`,
                    }
                  : message,
              ),
            }));
          } else if (event.event === "file_written") {
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === kernelMsgId
                  ? {
                      ...message,
                      content: `${message.content}\nWrote \`${String(event.path)}\``,
                    }
                  : message,
              ),
            }));
          } else if (event.event === "test_result") {
            const icon = event.success ? "PASS" : "FAIL";
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === kernelMsgId
                  ? {
                      ...message,
                      content:
                        `${message.content}\n${icon} test run (exit ${String(event.exit_code)})` +
                        (event.stderr ? `\n${String(event.stderr).slice(0, 300)}` : ""),
                    }
                  : message,
              ),
            }));
          } else if (event.event === "loop_done") {
            const batch = ((event.diff_batch ?? []) as DiffEntry[]).map((entry) => ({
              path: entry.path,
              content: entry.content,
              iteration: entry.iteration,
            }));
            set({
              loopStatus: "completed",
              pendingDiffBatch: batch,
            });
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === kernelMsgId
                  ? {
                      ...message,
                      content: `${message.content}\n\nLoop complete. ${batch.length} file(s) ready for review.`,
                    }
                  : message,
              ),
            }));
          } else if (event.event === "loop_aborted") {
            set({ loopStatus: "aborted" });
          } else if (event.event === "plan_error") {
            set({ loopStatus: "failed" });
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === kernelMsgId
                  ? {
                      ...message,
                      content: `${message.content}\n\nPlan error: ${String(event.error)}`,
                    }
                  : message,
              ),
            }));
          } else if (event.event === "stream_end") {
            break;
          }
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : "Agentic loop failed.";
        set((state) => ({
          loopStatus: "failed",
          messages: state.messages.map((message) =>
            message.id === kernelMsgId
              ? { ...message, content: `Error: ${text}` }
              : message,
          ),
        }));
      } finally {
        set({ isStreaming: false });
      }

      return;
    }

    const kernelMsgId = `kernel_${Date.now()}`;
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: kernelMsgId,
          role: "kernel",
          content: "",
          timestamp: Date.now(),
          mode: activePersona,
        },
      ],
    }));

    try {
      const stream = apiSendMessage({
        prompt,
        session_id: sessionId,
        persona_name: activePersona,
        attachments,
      });

      for await (const event of stream) {
        if (event.type === "message" && event.content) {
          if (event.session_id && get().sessionId === null) {
            set({ sessionId: event.session_id });
          }

          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === kernelMsgId
                ? {
                    ...message,
                    content: `${message.content}${event.content}`,
                    mode: event.mode ?? activePersona,
                  }
                : message,
            ),
          }));
        } else if (event.type === "error") {
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === kernelMsgId
                ? { ...message, content: `Error: ${event.message ?? "Unknown error."}` }
                : message,
            ),
          }));
          break;
        }
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not reach the kernel.";
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === kernelMsgId ? { ...message, content: `Error: ${text}` } : message,
        ),
      }));
    } finally {
      set({ isStreaming: false });
    }
  },

  abortAgenticLoop: async () => {
    const { activeLoopId } = get();
    if (!activeLoopId) {
      return;
    }
    await apiAbortLoop(activeLoopId);
    set({ loopStatus: "aborted" });
  },

  approveDiffBatch: async (approvedPaths?: Set<string>) => {
    const { pendingDiffBatch } = get();
    if (!pendingDiffBatch) {
      return;
    }

    const toWrite = approvedPaths
      ? pendingDiffBatch.filter((entry) => approvedPaths.has(entry.path))
      : pendingDiffBatch;

    await Promise.all(
      toWrite.map((entry) =>
        approveCodeDiff({ path: entry.path, content: entry.content }),
      ),
    );

    set({
      pendingDiffBatch: null,
      activeLoopId: null,
      loopIteration: 0,
      loopStatus: "idle",
    });
  },

  rejectDiffBatch: () => {
    set({
      pendingDiffBatch: null,
      activeLoopId: null,
      loopIteration: 0,
      loopStatus: "idle",
    });
  },
}));

