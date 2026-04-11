import { create } from "zustand";
import { sendMessage as apiSendMessage } from "@/lib/apiClient";
import { PERSONA_DEFAULTS } from "@/lib/constants";

export interface Message {
  id: string;
  role: "user" | "kernel";
  content: string;
  timestamp: number;
}

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

  /**
   * Appends the user message immediately, then opens an SSE stream and
   * progressively builds the kernel reply token-by-token in the store.
   */
  sendMessage: (prompt: string) => Promise<void>;
}

export const useFluxStore = create<FluxState>((set, get) => ({
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

  sendMessage: async (prompt: string) => {
    const { activePersona, sessionId, messages } = get();

    // 1. Build and append the user message immediately
    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, userMsg], isStreaming: true }));

    // 2. Prepare a streaming kernel message placeholder
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
          // Patch the session ID from the first response
          if (event.session_id && get().sessionId === null) {
            set({ sessionId: event.session_id });
          }

          // Progressively append content to the kernel message
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === kernelMsgId
                ? { ...m, content: m.content + event.content }
                : m,
            ),
          }));
        } else if (event.type === "error") {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === kernelMsgId
                ? { ...m, content: `⚠ Error: ${event.message ?? "Unknown error."}` }
                : m,
            ),
          }));
          break;
        }
        // "done" type → loop ends naturally
      }
    } catch (err) {
      const errText =
        err instanceof Error ? err.message : "Could not reach the kernel.";
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === kernelMsgId ? { ...m, content: `⚠ ${errText}` } : m,
        ),
      }));
    } finally {
      set({ isStreaming: false });
    }
  },
}));