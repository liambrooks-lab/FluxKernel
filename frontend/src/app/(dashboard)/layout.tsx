"use client";

import React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFluxStore } from "@/store/useFluxStore";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Menu, X, Terminal, Workflow } from "lucide-react";
import { FileExplorer } from "@/components/workspace/FileExplorer";
import { ImageCanvas } from "@/components/workspace/ImageCanvas";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const { isMobileSidebarOpen, toggleMobileSidebar, activeFile } = useFluxStore();

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* Mobile Navbar */}
      {isMobile && (
        <header className="flex h-14 items-center justify-between border-b border-border px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMobileSidebar}
              className="p-1 hover:bg-accent rounded-md flex items-center justify-center"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold select-none">FluxKernel</span>
          </div>
          <ThemeToggle />
        </header>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: File Explorer */}
        <aside
          className={`${
            isMobile
              ? `absolute inset-y-0 left-0 z-50 w-3/4 max-w-sm bg-background border-r border-border transition-transform duration-300 ease-in-out ${
                  isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`
              : "w-64 border-r border-border flex-shrink-0"
          } flex flex-col`}
        >
          {isMobile && (
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-semibold">Explorer</span>
              <button
                onClick={toggleMobileSidebar}
                className="p-1 hover:bg-accent rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          <div className="flex-1 p-3 overflow-y-auto w-full">
            {!isMobile && (
              <div className="font-semibold mb-3 text-[11px] tracking-wider text-muted-foreground select-none px-2">
                WORKSPACE
              </div>
            )}
            <FileExplorer />
          </div>
        </aside>

        {/* Mobile Backdrop */}
        {isMobile && isMobileSidebarOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={toggleMobileSidebar}
          />
        )}

        {/* Center: Main Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-background/50 relative z-0 shadow-inner">
          {!isMobile && (
            <header className="flex h-12 items-center justify-between border-b border-border/60 px-4 flex-shrink-0 bg-background">
              <div className="flex items-center gap-2 text-sm text-foreground/80 font-medium">
                {activeFile ? `src / ${activeFile}` : "FluxKernel / Session"}
              </div>
              <div className="flex items-center gap-3">
                <button className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Terminal">
                  <Terminal className="h-4 w-4" />
                </button>
                <button className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Workflows">
                  <Workflow className="h-4 w-4" />
                </button>
                <div className="w-px h-4 bg-border mx-1"></div>
                <ThemeToggle />
              </div>
            </header>
          )}
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </main>

        {/* Right: Context Tools */}
        {!isMobile && (
          <aside className="w-80 border-l border-border flex-shrink-0 flex flex-col bg-background">
            <div className="p-4 border-b border-border font-semibold text-[11px] tracking-wider text-muted-foreground select-none">
              CONTEXT & ASSETS
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              {activeFile?.endsWith(".png") || activeFile?.endsWith(".jpg") ? (
                <div className="flex flex-col gap-4">
                  <h3 className="text-sm font-medium text-foreground">Asset Viewer</h3>
                  <ImageCanvas fileName={activeFile} />
                </div>
              ) : activeFile ? (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium text-foreground">File Metadata</h3>
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 flex flex-col gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-mono text-foreground">{activeFile}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-mono text-foreground text-opacity-80">TypeScript / React</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size:</span>
                      <span className="font-mono text-foreground text-opacity-80">~4.2 KB</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center flex-1 justify-center h-full text-center text-muted-foreground">
                  <p className="text-sm">No context selected.</p>
                  <p className="text-xs mt-1 opacity-70">Focus on a file or asset to inspect details here.</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}