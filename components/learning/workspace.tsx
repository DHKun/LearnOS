"use client";

import * as React from "react";
import { BookOpen, Focus, PanelLeftClose, PanelLeftOpen, StickyNote, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LearningWorkspace({
  nav,
  notes,
  content,
  pager,
  lessonLabel,
}: {
  nav: React.ReactNode;
  notes: React.ReactNode;
  content: React.ReactNode;
  pager: React.ReactNode;
  lessonLabel: string;
}) {
  const [navOpen, setNavOpen] = React.useState(true);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [focusMode, setFocusMode] = React.useState(false);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotesOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    const locked = notesOpen || mobileNavOpen;
    document.body.style.overflow = locked ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen, notesOpen]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/80 px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="打开章节目录"
          >
            <BookOpen className="size-4" /> 目录
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={() => setNavOpen((open) => !open)}
            aria-label={navOpen ? "收起章节目录" : "展开章节目录"}
            aria-pressed={navOpen}
          >
            {navOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            {navOpen ? "收起目录" : "展开目录"}
          </Button>
          <span className="hidden max-w-[18rem] truncate text-xs text-muted-foreground sm:inline">
            {lessonLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant={focusMode ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setFocusMode((value) => !value);
              setNotesOpen(false);
              setMobileNavOpen(false);
            }}
            aria-pressed={focusMode}
          >
            <Focus className="size-4" /> {focusMode ? "退出专注" : "专注模式"}
          </Button>
          <Button
            type="button"
            variant={notesOpen ? "default" : "ghost"}
            size="sm"
            onClick={() => setNotesOpen((open) => !open)}
            aria-expanded={notesOpen}
          >
            <StickyNote className="size-4" /> 笔记
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-6",
          !focusMode && navOpen && "lg:grid-cols-[15rem_minmax(0,1fr)]",
        )}
      >
        {!focusMode && navOpen && (
          <aside className="hidden lg:block" aria-label="课程目录">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1">{nav}</div>
          </aside>
        )}
        <main className="min-w-0 space-y-6">
          {content}
          {pager}
        </main>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label="关闭章节目录"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 w-[min(86vw,20rem)] overflow-y-auto border-r border-border bg-card p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="课程目录"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">课程目录</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileNavOpen(false)}
                aria-label="关闭目录"
              >
                <X className="size-4" />
              </Button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div
        className={cn(
          "fixed inset-0 z-50",
          !notesOpen && "pointer-events-none invisible",
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
          aria-label="关闭笔记"
          tabIndex={notesOpen ? 0 : -1}
          onClick={() => setNotesOpen(false)}
        />
        <aside
          className="absolute inset-y-0 right-0 w-[min(94vw,26rem)] overflow-y-auto border-l border-border bg-card p-4 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-label="章节笔记"
          aria-hidden={!notesOpen}
          hidden={!notesOpen}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">章节笔记</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setNotesOpen(false)}
              aria-label="关闭笔记"
              tabIndex={notesOpen ? 0 : -1}
            >
              <X className="size-4" />
            </Button>
          </div>
          {notes}
        </aside>
      </div>

    </div>
  );
}
