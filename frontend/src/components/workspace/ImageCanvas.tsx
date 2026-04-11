"use client";

import React from "react";
import { Download, Maximize2 } from "lucide-react";

interface ImageCanvasProps {
  imageUrl?: string;
  fileName?: string;
}

export function ImageCanvas({ 
  imageUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop", 
  fileName = "generated_asset.png" 
}: ImageCanvasProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative group rounded-lg overflow-hidden border border-border/60 bg-muted/20 aspect-video flex items-center justify-center shadow-sm">
        {/* Mockup using a placeholder aesthetic gradient/image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={imageUrl} 
          alt={fileName} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        
        {/* Overlay controls */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
          <button className="p-2.5 bg-background hover:bg-muted text-foreground rounded-full transition-colors shadow-lg" aria-label="Expand Image">
            <Maximize2 className="h-4 w-4" />
          </button>
          <button className="p-2.5 bg-background hover:bg-muted text-foreground rounded-full transition-colors shadow-lg" aria-label="Download Image">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-foreground truncate">{fileName}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">1024x1024 • 1.2MB</span>
      </div>
    </div>
  );
}