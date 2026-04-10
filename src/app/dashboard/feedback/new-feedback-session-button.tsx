"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface NewFeedbackSessionButtonProps {
  tenantId: string;
  userId: string;
}

export function NewFeedbackSessionButton({ tenantId, userId }: NewFeedbackSessionButtonProps) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    const { error } = await supabase.from("ui_feedback_sessions").insert([{
      tenant_id: tenantId,
      created_by: userId,
      title: "Feedback Session",
      status: "open",
    }]);
    setLoading(false);
    if (error) {
      toast.error("Failed to create session");
    } else {
      toast.success("New feedback session created");
      router.refresh();
    }
  }

  return (
    <Button
      onClick={handleCreate}
      disabled={loading}
      size="sm"
      className="bg-blue-50 dark:bg-blue-950/50 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 text-xs"
    >
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      New Session
    </Button>
  );
}
