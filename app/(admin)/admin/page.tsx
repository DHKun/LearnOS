import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, BookOpen, Radio, Users } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader, StatCard } from "@/components/page";
import { OnlineDot } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminAttention, getAdminOverview } from "@/lib/services/admin";
import { formatRelative } from "@/lib/utils";

export const metadata: Metadata = { title: "管理概览" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [overview, attention] = await Promise.all([getAdminOverview(), getAdminAttention()]);

  return (
    <div className="space-y-8">
      <AutoRefresh />
      <PageHeader
        eyebrow="Admin Console"
        title="学习概览"
        description="每 30 秒自动刷新。在线指最近 120 秒内收到页面心跳，与课程是否进行中相互独立。"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/students">
              查看学生 <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="学生总数" value={overview.studentCount} hint="不含管理员" />
        <StatCard label="进行中课程" value={overview.activeEnrollmentCount} hint="每人至多 1 门" />
        <StatCard
          label="最近在线"
          value={overview.onlineCount}
          hint="120 秒内有效心跳"
          accent
        />
        <StatCard
          label="课程"
          value={overview.courseCount}
          hint={`${overview.publishedCourseCount} 门已发布`}
        />
        <StatCard label="完成人次" value={overview.completedEnrollmentCount} hint="历史累计" />
      </div>


      <div className="grid gap-4 lg:grid-cols-2">
        {[
          {
            title: "已报名但未开始",
            hint: "没有已完成章节、没有当前章节，也没有有效交互",
            items: attention.notStarted,
          },
          {
            title: "长期未活动",
            hint: "最近有效交互超过 3 天；仅提示关注，不自动退课",
            items: attention.inactive,
          },
          {
            title: "可能卡在同一章节",
            hint: "当前章节停留超过 2 天且进度未满",
            items: attention.stuck,
          },
          {
            title: "最近完成课程",
            hint: "最近 7 天完成",
            items: attention.recentlyCompleted,
          },
        ].map((group) => (
          <Card key={group.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{group.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{group.hint}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">当前没有符合条件的学生。</p>
              ) : (
                group.items.map((item) => (
                  <Link
                    key={`${group.title}-${item.studentId}`}
                    href={`/admin/students/${item.studentId}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.courseTitle} · {item.currentLesson ?? "未开始"}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {item.progress}%
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" /> 最近活跃学生
            </CardTitle>
            <p className="text-sm text-muted-foreground">按最近心跳排序，最近 8 条进行中的学习记录</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Radio className="size-3.5 text-success" /> 30s 轮询
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {overview.recentActivity.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              还没有学生开始学习。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>学生</TableHead>
                  <TableHead>课程</TableHead>
                  <TableHead>当前章节</TableHead>
                  <TableHead>进度</TableHead>
                  <TableHead>最近在线</TableHead>
                  <TableHead>最近交互</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.recentActivity.map((row) => (
                  <TableRow key={`${row.studentId}-${row.courseTitle}`}>
                    <TableCell>
                      <Link
                        href={`/admin/students/${row.studentId}`}
                        className="font-medium hover:text-primary"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.courseTitle ?? "—"}</TableCell>
                    <TableCell>{row.currentLessonTitle ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${row.progress}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <OnlineDot online={row.online} />
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelative(row.lastSeenAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(row.lastInteractionAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/students"
          className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
        >
          <Users className="size-5 text-primary" />
          <p className="mt-3 font-serif text-lg font-semibold">学生管理</p>
          <p className="mt-1 text-sm text-muted-foreground">
            创建账号、停用/启用、查看当前课程、章节进度、最近在线与交互、完成记录和积分。
          </p>
        </Link>
        <Link
          href="/admin/courses"
          className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
        >
          <BookOpen className="size-5 text-primary" />
          <p className="mt-3 font-serif text-lg font-semibold">课程管理</p>
          <p className="mt-1 text-sm text-muted-foreground">
            查看章节结构、发布或下架课程、编辑标题与简介，并按状态查看课程学员。
          </p>
        </Link>
      </div>
    </div>
  );
}
