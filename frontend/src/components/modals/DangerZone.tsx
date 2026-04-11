"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, AlertOctagon } from "lucide-react";
import { ConfirmAction } from "./ConfirmAction";

export function DangerZone() {
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [purgeDbOpen, setPurgeDbOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg border border-destructive/20 bg-destructive/5 max-w-lg w-full">
      <div className="flex items-center gap-2 text-destructive font-semibold">
        <AlertOctagon className="h-5 w-5" />
        <h2>Danger Zone</h2>
      </div>
      
      <p className="text-sm text-muted-foreground mb-2">
        These actions are destructive and cannot be undone. Proceed with caution.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Clear Current Chat</span>
          <Button 
            variant="destructive" 
            size="sm" 
            className="flex items-center gap-2"
            onClick={() => setClearChatOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>
        </div>
        
        <div className="flex items-center justify-between pt-3 border-t border-destructive/10">
          <span className="text-sm font-medium text-destructive">Purge Entire Database</span>
          <Button 
            variant="destructive" 
            size="sm" 
            className="flex items-center gap-2"
            onClick={() => setPurgeDbOpen(true)}
          >
            <AlertOctagon className="h-4 w-4" />
            Purge DB
          </Button>
        </div>
      </div>

      <ConfirmAction
        open={clearChatOpen}
        onOpenChange={setClearChatOpen}
        title="Clear Current Chat"
        description="Are you sure you want to delete all messages in the current session? This action is irreversible."
        onConfirm={() => console.log("Chat cleared.")}
      />

      <ConfirmAction
        open={purgeDbOpen}
        onOpenChange={setPurgeDbOpen}
        title="Purge Entire Database"
        description="WARNING: This will permanently delete ALL chat histories, personas, and system logs from the database. Are you absolutely certain?"
        onConfirm={() => console.log("Database purged.")}
      />
    </div>
  );
}