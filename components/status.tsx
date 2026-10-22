import { Badge } from "@/components/ui/badge";
import type { EnrollmentStatus } from "@/lib/types";

const LABELS: Record<EnrollmentStatus, string> = {
  active: "进行中",
  completed: "已完成",
  abandoned: "已退出",
};

const VARIANTS: Record<EnrollmentStatus, "default" | "success" | "warning"> = {
  active: "default",
  completed: "success",
  abandoned: "warning",
};

export function StatusBadge({ status }: { status: EnrollmentStatus | null }) {
  if (!status) return <Badge variant="outline">未参加</Badge>;
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}

export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={
          online
            ? "size-1.5 rounded-full bg-success shadow-[0_0_0_3px] shadow-success/15"
            : "size-1.5 rounded-full bg-muted-foreground/40"
        }
      />
      <span className={online ? "text-success" : "text-muted-foreground"}>
        {online ? "最近在线" : "离线"}
      </span>
    </span>
  );
}
