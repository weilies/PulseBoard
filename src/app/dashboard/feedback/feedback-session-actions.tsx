"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Copy, Check, Link2, MoreHorizontal, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface FeedbackSessionActionsProps {
  sessionId: string;
  sessionTitle: string;
  status: string;
  tenantId: string;
}

export function FeedbackSessionActions({ sessionId, sessionTitle, status, tenantId }: FeedbackSessionActionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const url = `${window.location.origin}/api/feedback/${sessionId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied — paste to Claude Code to batch-fix");
    setTimeout(() => setCopied(false), 2000);
  }

  async function markComplete() {
    await supabase
      .from("ui_feedback_sessions")
      .update({ status: "completed" })
      .eq("id", sessionId)
      .eq("tenant_id", tenantId);
    toast.success(`"${sessionTitle}" marked as completed`);
    router.refresh();
  }

  async function newSession() {
    await supabase
      .from("ui_feedback_sessions")
      .insert([{ tenant_id: tenantId, title: "Feedback Session", status: "open" }]);
    toast.success("New session created");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={copyLink}
        className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        title="Copy export link"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white border-gray-200">
          <DropdownMenuItem onClick={copyLink} className="text-gray-700 focus:bg-gray-100 text-xs">
            <Link2 className="mr-2 h-3.5 w-3.5" />
            Copy export link
          </DropdownMenuItem>
          {status === "open" && (
            <DropdownMenuItem onClick={markComplete} className="text-gray-700 focus:bg-gray-100 text-xs">
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
              Mark as completed
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
