"use client";

import * as React from "react";
import { Check, Cloud, CloudOff, Eye, Pencil } from "lucide-react";

import { ApiClientError, apiFetch } from "@/lib/client/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NoteData } from "@/lib/types";

const MAX_BYTES = 64 * 1024;

export function NotesPanel({
  lessonId,
  lessonTitle,
  initialNote,
}: {
  lessonId: string;
  lessonTitle: string;
  initialNote?: NoteData;
}) {
  const hasInitial = initialNote !== undefined;
  const [content, setContent] = React.useState(initialNote?.content ?? "");
  const [savedContent, setSavedContent] = React.useState(initialNote?.content ?? "");
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(initialNote?.updatedAt ?? null);
  const [ready, setReady] = React.useState(hasInitial);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const requestRef = React.useRef(0);
  const dirtyRef = React.useRef(false);

  React.useEffect(() => {
    if (mode !== "preview") return;
    if (!content.trim()) {
      setPreviewHtml("");
      setPreviewLoading(false);
      return;
    }

    let active = true;
    setPreviewLoading(true);
    void import("markdown-it")
      .then(({ default: MarkdownIt }) => {
        if (!active) return;
        const renderer = new MarkdownIt({ html: false, linkify: true, breaks: true });
        setPreviewHtml(renderer.render(content));
        setPreviewLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setPreviewHtml("<p>预览加载失败，请重试。</p>");
        setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mode, content]);

  React.useEffect(() => {
    if (hasInitial) {
      dirtyRef.current = false;
      setReady(true);
      return;
    }

    let active = true;
    dirtyRef.current = false;
    setStatus("idle");
    setError(null);
    apiFetch<NoteData>(`/api/notes/${lessonId}`)
      .then((data) => {
        if (!active) return;
        // Do not overwrite text the student started typing before the fetch
        // resolved (typing can happen while the panel is loading).
        if (dirtyRef.current) return;
        setContent(data.content);
        setSavedContent(data.content);
        setUpdatedAt(data.updatedAt);
        setReady(true);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof ApiClientError ? caught.message : "笔记加载失败");
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, [hasInitial, lessonId]);

  React.useEffect(() => {
    if (content === savedContent) return;
    const timer = setTimeout(async () => {
      const requestId = ++requestRef.current;
      setStatus("saving");
      setError(null);
      try {
        const data = await apiFetch<NoteData>(`/api/notes/${lessonId}`, {
          method: "PUT",
          body: JSON.stringify({ content }),
        });
        if (requestRef.current !== requestId) return;
        setSavedContent(content);
        setUpdatedAt(data.updatedAt);
        setStatus("saved");
      } catch (caught) {
        if (requestRef.current !== requestId) return;
        setStatus("error");
        setError(caught instanceof ApiClientError ? caught.message : "自动保存失败");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [content, lessonId, savedContent]);

  const bytes = new TextEncoder().encode(content).length;
  const overLimit = bytes > MAX_BYTES;

  return (
    <Card className="flex h-fit flex-col xl:sticky xl:top-20" data-note-ready={ready ? "true" : "false"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">章节笔记</CardTitle>
          <div className="flex rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs",
                mode === "edit" ? "bg-muted font-medium" : "text-muted-foreground",
              )}
            >
              <Pencil className="size-3" /> 编辑
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs",
                mode === "preview" ? "bg-muted font-medium" : "text-muted-foreground",
              )}
            >
              <Eye className="size-3" /> 预览
            </button>
          </div>
        </div>
        <p className="truncate text-xs text-muted-foreground">{lessonTitle} · 仅自己可见</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {mode === "edit" ? (
          <Textarea
            value={content}
            onChange={(event) => {
              dirtyRef.current = true;
              setContent(event.target.value);
            }}
            placeholder="输入本章节笔记，支持 Markdown。"
            className="min-h-[260px] resize-y font-mono text-[13px] leading-relaxed"
            aria-label="章节笔记"
          />
        ) : (
          <div className="prose-learn min-h-[260px] rounded-md border border-border bg-muted/20 p-3 text-sm">
            {previewLoading ? (
              <p className="text-muted-foreground">正在生成预览…</p>
            ) : content.trim() ? (
              <div dangerouslySetInnerHTML={{ __html: previewHtml ?? "" }} />
            ) : (
              <p className="text-muted-foreground">暂无笔记。</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1",
              status === "error" && "text-destructive",
              status === "saved" && "text-success",
            )}
          >
            {status === "saving" ? (
              <>
                <Cloud className="size-3.5" /> 保存中…
              </>
            ) : status === "error" ? (
              <>
                <CloudOff className="size-3.5" /> 保存失败
              </>
            ) : status === "saved" ? (
              <>
                <Check className="size-3.5" /> 已自动保存
              </>
            ) : updatedAt ? (
              <>更新于 {new Date(updatedAt).toLocaleTimeString()}</>
            ) : (
              <>自动保存</>
            )}
          </span>
          <span className={overLimit ? "text-destructive" : undefined}>
            {(bytes / 1024).toFixed(1)} / 64 KB
          </span>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          支持 Markdown；原始 HTML 将被转义。笔记仅本人可见。
        </p>
      </CardContent>
    </Card>
  );
}
