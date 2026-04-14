"use client";

import React, { KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Camera,
  FileImage,
  FilePlus2,
  FolderOpen,
  Plus,
  Send,
  X,
} from "lucide-react";

import { PendingAttachment } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { useFluxStore } from "@/store/useFluxStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type MenuAction = {
  id: PendingAttachment["kind"];
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const MENU_ACTIONS: MenuAction[] = [
  {
    id: "file",
    label: "Single file",
    description: "Attach one or more source files.",
    icon: FilePlus2,
  },
  {
    id: "folder",
    label: "Folder upload",
    description: "Attach an entire directory with relative paths.",
    icon: FolderOpen,
  },
  {
    id: "image",
    label: "Image upload",
    description: "Attach screenshots, diagrams, or reference images.",
    icon: FileImage,
  },
  {
    id: "camera",
    label: "Camera capture",
    description: "Open the device camera and snap a photo in-app.",
    icon: Camera,
  },
];

export function ChatInput() {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { sendMessage, isStreaming, activePersona } = useFluxStore();

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera();
      return;
    }

    void startCamera();
    return () => stopCamera();
  }, [cameraOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      setCameraError(
        error instanceof Error ? error.message : "Camera permission was denied.",
      );
    }
  };

  const handleInput = () => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
  };

  const appendAttachments = (
    files: FileList | File[],
    kind: PendingAttachment["kind"],
  ) => {
    const next = Array.from(files).map((file) => ({
      file,
      kind,
      relativePath:
        "webkitRelativePath" in file && typeof file.webkitRelativePath === "string"
          ? file.webkitRelativePath || file.name
          : file.name,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));

    setAttachments((current) => [...current, ...next]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((current) => {
      const item = current[index];
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const resetComposer = () => {
    setContent("");
    setAttachments((current) => {
      for (const attachment of current) {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      }
      return [];
    });

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    const fallbackPrompt =
      attachments.length > 0
        ? `Please inspect the attached items in ${activePersona}.`
        : "";
    const promptToSend = trimmed || fallbackPrompt;

    if (!promptToSend || isStreaming) {
      return;
    }

    const payloadAttachments = attachments.map((attachment) => ({
      ...attachment,
      relativePath: attachment.relativePath ?? attachment.file.name,
    }));

    resetComposer();
    setIsMenuOpen(false);
    await sendMessage(promptToSend, payloadAttachments);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png", 0.92),
    );
    if (!blob) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([blob], `camera-capture-${timestamp}.png`, {
      type: "image/png",
    });
    appendAttachments([file], "camera");
    setCameraOpen(false);
  };

  const canSend =
    !isStreaming && (content.trim().length > 0 || attachments.length > 0);

  return (
    <>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <div
                key={`${attachment.file.name}-${index}`}
                className="group flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
              >
                <span className="font-medium text-foreground">
                  {attachment.relativePath ?? attachment.file.name}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 uppercase tracking-wide">
                  {attachment.kind}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={`Remove ${attachment.file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            "relative flex w-full items-end gap-2 rounded-3xl border bg-card/70 p-2 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all",
            isStreaming
              ? "border-border/40"
              : "border-border/80 focus-within:border-white/15 focus-within:shadow-[0_28px_80px_-32px_rgba(0,0,0,0.6)]",
          )}
        >
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => setIsMenuOpen((open) => !open)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Open attachment menu"
            >
              <Plus className="h-4 w-4" />
            </button>

            {isMenuOpen && (
              <div className="absolute bottom-14 left-0 z-20 w-72 rounded-2xl border border-border/80 bg-popover/95 p-2 shadow-2xl backdrop-blur-xl">
                {MENU_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent"
                      onClick={() => {
                        setIsMenuOpen(false);
                        if (action.id === "file") {
                          fileInputRef.current?.click();
                        } else if (action.id === "folder") {
                          folderInputRef.current?.click();
                        } else if (action.id === "image") {
                          imageInputRef.current?.click();
                        } else if (action.id === "camera") {
                          setCameraOpen(true);
                        }
                      }}
                    >
                      <span className="mt-0.5 rounded-xl border border-border/60 bg-background p-2">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="space-y-1">
                        <span className="block text-sm font-medium text-foreground">
                          {action.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {action.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? "FluxKernel is processing..."
                : `Message ${activePersona.toLowerCase()}...`
            }
            disabled={isStreaming}
            className="max-h-[140px] min-h-[44px] w-full resize-none border-0 bg-transparent px-1 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-60"
            rows={1}
          />

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl transition-all",
              canSend
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "cursor-not-allowed bg-primary/50 text-primary-foreground/80",
            )}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            appendAttachments(event.target.files, "file");
          }
        }}
      />

      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(event) => {
          if (event.target.files?.length) {
            appendAttachments(event.target.files, "folder");
          }
        }}
      />

      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            appendAttachments(event.target.files, "image");
          }
        }}
      />

      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent className="max-w-2xl border-border/80 bg-card/95">
          <DialogHeader>
            <DialogTitle>Camera Capture</DialogTitle>
            <DialogDescription>
              Snap a photo and append it directly to the active chat request.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-hidden rounded-2xl border border-border/70 bg-black">
            {cameraError ? (
              <div className="flex h-[360px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {cameraError}
              </div>
            ) : (
              <video
                ref={videoRef}
                className="h-[360px] w-full object-cover"
                autoPlay
                muted
                playsInline
              />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCameraOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void capturePhoto()}>
              Capture Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

