"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MessageSquarePlus, X, CheckCircle } from "lucide-react";

interface FeedbackOverlayProps {
  tenantId: string;
  userId: string;
}

interface AnnotationTarget {
  elementText: string;
  cssClasses: string;
  parentChain: string;
  outerHtml: string;
  x: number;
  y: number;
}

interface ActiveSession {
  id: string;
  title: string;
  itemCount: number;
}

export function FeedbackOverlay({ tenantId, userId }: FeedbackOverlayProps) {
  const pathname = usePathname();
  const supabase = createClient();

  const [target, setTarget] = useState<AnnotationTarget | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Load or create the open session for this tenant
  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase
        .from("ui_feedback_sessions")
        .select("id, title")
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const { count } = await supabase
          .from("ui_feedback_items")
          .select("id", { count: "exact", head: true })
          .eq("session_id", data.id);
        setSession({ id: data.id, title: data.title, itemCount: count ?? 0 });
      } else {
        // Auto-create a session
        const { data: newSession } = await supabase
          .from("ui_feedback_sessions")
          .insert([{ tenant_id: tenantId, created_by: userId, title: "Feedback Session" }])
          .select("id, title")
          .single();
        if (newSession) setSession({ id: newSession.id, title: newSession.title, itemCount: 0 });
      }
    }
    loadSession();
  }, [tenantId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Right-click handler
  const handleContextMenu = useCallback((e: MouseEvent) => {
    const el = e.target as HTMLElement;
    // Skip our own overlay elements
    if (el.closest("[data-feedback-overlay]")) return;

    e.preventDefault();

    const getParentChain = (node: HTMLElement): string => {
      const parts: string[] = [];
      let current: HTMLElement | null = node.parentElement;
      let depth = 0;
      while (current && current !== document.body && depth < 4) {
        parts.push(current.tagName);
        current = current.parentElement;
        depth++;
      }
      return parts.join(" > ");
    };

    const outerHtml = el.outerHTML.slice(0, 500);

    setTarget({
      elementText: (el.textContent ?? "").trim().slice(0, 120),
      cssClasses: el.className,
      parentChain: getParentChain(el),
      outerHtml,
      x: e.clientX,
      y: e.clientY,
    });
    setComment("");
    setTimeout(() => commentRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, [handleContextMenu]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTarget(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!target) return;
    const onMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setTarget(null);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [target]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  async function handleSave() {
    if (!target || !session || !comment.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("ui_feedback_items").insert([{
      session_id: session.id,
      tenant_id: tenantId,
      page: pathname,
      element_text: target.elementText || null,
      css_classes: target.cssClasses || null,
      parent_chain: target.parentChain || null,
      outer_html: target.outerHtml || null,
      comment: comment.trim(),
    }]);

    setSaving(false);
    if (!error) {
      setSession((s) => s ? { ...s, itemCount: s.itemCount + 1 } : s);
      setTarget(null);
      showToast("Annotation saved");
    }
  }

  // Clamp popover position so it stays within viewport
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const popoverW = 300;
  const popoverH = 220;
  const left = target ? Math.min(target.x, viewportW - popoverW - 16) : 0;
  const top = target ? Math.min(target.y, viewportH - popoverH - 16) : 0;

  return (
    <>
      {/* Feedback badge — bottom right */}
      {session && (
        <Link
          href="/dashboard/feedback"
          data-feedback-overlay
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg select-none hover:bg-blue-700 transition-colors"
          title="View feedback sessions"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          <span>Feedback</span>
          {session.itemCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-blue-600">
              {session.itemCount}
            </span>
          )}
        </Link>
      )}

      {/* Annotation popover */}
      {target && (
        <div
          data-feedback-overlay
          ref={popoverRef}
          style={{ position: "fixed", left, top, zIndex: 9999, width: popoverW }}
          className="rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Annotate element</span>
            <button
              data-feedback-overlay
              onClick={() => setTarget(null)}
              className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {target.elementText && (
            <div className="border-b border-gray-100 px-3 py-1.5 dark:border-gray-700">
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">&ldquo;{target.elementText}&rdquo;</p>
            </div>
          )}
          <div className="p-3">
            <textarea
              ref={commentRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSave();
              }}
              placeholder="Describe the issue... (Ctrl+Enter to save)"
              rows={3}
              className="w-full resize-none rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Page: {pathname}</span>
              <button
                onClick={handleSave}
                disabled={saving || !comment.trim()}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div
          data-feedback-overlay
          className="fixed bottom-14 right-4 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-lg"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          {toastMsg}
        </div>
      )}
    </>
  );
}
