"use client";

import React, { useState } from "react";
import { Folder, File, ChevronRight, ChevronDown, FileCode2, Image as ImageIcon } from "lucide-react";
import { useFluxStore } from "@/store/useFluxStore";

type FileNode = {
  name: string;
  type: "file" | "folder";
  id: string;
  children?: FileNode[];
};

const mockFileSystem: FileNode[] = [
  {
    name: "src",
    type: "folder",
    id: "folder_1",
    children: [
      { name: "App.js", type: "file", id: "file_1" },
      { name: "globals.css", type: "file", id: "file_2" },
      {
        name: "components",
        type: "folder",
        id: "folder_2",
        children: [
          { name: "Button.tsx", type: "file", id: "file_3" },
          { name: "Header.tsx", type: "file", id: "file_4" },
        ]
      }
    ]
  },
  { name: "package.json", type: "file", id: "file_5" },
  { name: "README.md", type: "file", id: "file_6" },
  { name: "hero-bg.png", type: "file", id: "file_7" },
];

const FileNodeItem = ({ node, level }: { node: FileNode; level: number }) => {
  const [isOpen, setIsOpen] = useState(node.name === "src"); // Default open parent
  const { activeFile, setActiveFile } = useFluxStore();
  const isSelected = activeFile === node.name; // Keep tracking by name so metadata easily shows name

  const handleClick = () => {
    if (node.type === "folder") {
      setIsOpen(!isOpen);
    } else {
      setActiveFile(node.name);
    }
  };

  const getIcon = () => {
    if (node.type === "folder") {
      return isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground mr-1" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground mr-1" />;
    }
    if (node.name.endsWith(".js") || node.name.endsWith(".tsx") || node.name.endsWith(".json")) {
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-sky-400/80 mr-1.5 ml-4" />;
    }
    if (node.name.endsWith(".png") || node.name.endsWith(".jpg")) {
      return <ImageIcon className="h-3.5 w-3.5 shrink-0 text-fuchsia-400/80 mr-1.5 ml-4" />;
    }
    return <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground mr-1.5 ml-4" />;
  };

  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center py-1.5 px-2 cursor-pointer rounded-md transition-colors select-none ${
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/40 text-muted-foreground hover:text-foreground"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {getIcon()}
        {node.type === "folder" && (
          <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500/80 mr-1.5 fill-yellow-500/20" />
        )}
        <span className="text-[13px] truncate font-medium">{node.name}</span>
      </div>
      {node.type === "folder" && isOpen && node.children && (
        <div className="flex flex-col mt-0.5">
          {node.children.map((child) => (
             <FileNodeItem key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export function FileExplorer() {
  return (
    <div className="flex flex-col w-full h-full text-sm">
      <div className="flex flex-col space-y-0.5">
        {mockFileSystem.map((node) => (
          <FileNodeItem key={node.id} node={node} level={0} />
        ))}
      </div>
    </div>
  );
}