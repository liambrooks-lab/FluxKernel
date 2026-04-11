import { create } from "zustand";
import { fetchWorkspace, approveCodeDiff, type FileNode } from "@/lib/apiClient";

interface WorkspaceState {
  tree: FileNode[];
  isLoading: boolean;
  error: string | null;

  loadTree: () => Promise<void>;
  approveFile: (path: string, content: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  tree: [],
  isLoading: false,
  error: null,

  loadTree: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await fetchWorkspace();
      set({ tree: data.tree, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load workspace.", isLoading: false });
    }
  },

  approveFile: async (path: string, content: string) => {
    await approveCodeDiff({ path, content });
  },
}));