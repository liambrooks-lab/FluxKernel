"use client";

import React, { useState } from "react";
import { usePersonaStore } from "@/store/usePersonaStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Users } from "lucide-react";

export function PersonaManager() {
  const { addPersona } = usePersonaStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [intensity, setIntensity] = useState([50]);

  const handleSave = () => {
    if (!name.trim()) return;
    
    addPersona({
      name,
      systemPrompt,
      intensity: intensity[0]
    });
    
    setName("");
    setSystemPrompt("");
    setIntensity([50]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          Manage Personas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Add New Persona</DialogTitle>
          <DialogDescription>
            Create a custom identity and behavioral constraints for the Kernel.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input 
              id="name" 
              placeholder="e.g. Unfiltered, Architect" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background/50 border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea 
              id="systemPrompt" 
              placeholder="Define the core instructions and constraints..." 
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="h-24 resize-none bg-background/50 border-border/60"
            />
          </div>
          <div className="grid gap-4 mt-2">
            <div className="flex items-center justify-between">
              <Label>Intensity / Creativity</Label>
              <span className="text-xs text-muted-foreground">{intensity[0]}%</span>
            </div>
            <Slider 
              value={intensity} 
              onValueChange={setIntensity} 
              max={100} 
              step={1} 
              className="py-2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Persona</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}