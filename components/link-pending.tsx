"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

/**
 * Inline pending indicator for App Router links. `useLinkStatus` flips as soon
 * as navigation starts, giving immediate feedback even before the RSC arrives.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      data-link-pending="true"
      aria-label="正在加载"
      className={cn(
        "inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.1em]",
        className,
      )}
    />
  );
}
