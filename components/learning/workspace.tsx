"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BookOpen, Focus, PanelLeftClose, PanelLeftOpen, StickyNote, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Learning workspace shell.
 *
 * The notes affordance is intentionally a viewport-fixed button: it must stay
 * reachable while the chapter is scrolled. On large screens the notes panel is
 * a non-modal column (no backdrop, page keeps scrolling); below `lg` it turns
 * into a right drawer.
 */
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
  const [isDesktop, setIsDesktop] = React.useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Navigating to another chapter must not leave the mobile directory open.
  const lessonParam = searchParams.get("lesson");
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, lessonParam]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (notesOpen) {
        setNotesOpen(false);
        return;
      }
      setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notesOpen]);

  // Only the mobile drawer locks page scroll; the desktop notes column is
  // non-modal so the student can keep reading and scrolling.
  React.useEffect(() => {
    const locked = mobileNavOpen || (notesOpen && !isDesktop);
    document.body.style.overflow = locked ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDesktop, mobileNavOpen, notesOpen]);

  const closeNotes = () => setNotesOpen(false);

  return (
    <div
      className={cn(
        "space-y-4 pb-24 lg:pb-16",
        notesOpen && "lg:pr-[23rem]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
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
              setMobileNavOpen(false);
            }}
            aria-pressed={focusMode}
          >
            <Focus className="size-4" /> {focusMode ? "退出专注" : "专注模式"}
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
            className="absolute inset-0 bg-black/40"
            aria-label="关闭章节目录遮罩"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 w-[min(86vw,20rem)] overflow-y-auto border-r border-border bg-card p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="课程章节"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">课程章节</span>
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

      {/* Floating trigger: fixed to the viewport so it never scrolls away. */}
      <button
        type="button"
        data-testid="notes-toggle"
        aria-controls="chapter-notes-panel"
        aria-expanded={notesOpen}
        aria-label={notesOpen ? "收起笔记" : "打开笔记"}
        onClick={() => setNotesOpen((open) => !open)}
        className={cn(
          "fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-primary/20 bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg ring-1 ring-black/5 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-6 sm:right-6",
          notesOpen && "lg:right-[23.5rem]",
        )}
      >
        <StickyNote className="size-4" aria-hidden />
        <span className="hidden sm:inline">{notesOpen ? "收起笔记" : "笔记"}</span>
      </button>

      {notesOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="关闭笔记遮罩"
          onClick={closeNotes}
        />
      )}

      {notesOpen && (
        <aside
          id="chapter-notes-panel"
          data-testid="notes-panel"
          aria-label="章节笔记"
          className="fixed inset-y-0 right-0 z-50 flex w-[min(94vw,26rem)] flex-col border-l border-border bg-card shadow-xl lg:top-14 lg:w-[23rem]"
        >
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">笔记</p>
              <p className="text-[11px] text-muted-foreground">边读边记 · 自动保存 · 仅自己可见</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={closeNotes}
              aria-label="关闭笔记"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{notes}</div>
        </aside>
      )}
    </div>
  );
}
