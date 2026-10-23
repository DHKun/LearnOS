import type { Metadata } from "next";

import { DeploymentsConsole } from "@/components/admin/deployments-console";
import { PageHeader } from "@/components/page";
import { requireAdmin } from "@/lib/auth/session";
import { getDeploymentOverview } from "@/lib/services/deployments";

export const metadata: Metadata = { title: "部署" };

export default async function AdminDeploymentsPage() {
  await requireAdmin();
  const overview = await getDeploymentOverview();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Console"
        title="部署更新"
        description="复制课程目录到 content/courses/，扫描更新，然后由 updater 容器执行固定快照、构建、同步与容器替换。构建或健康检查失败不会破坏旧版本。"
      />
      <DeploymentsConsole initial={overview} />
    </div>
  );
}
