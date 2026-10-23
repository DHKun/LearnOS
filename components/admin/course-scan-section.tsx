"use client";

import * as React from "react";

import { CourseScanPanel } from "@/components/admin/course-scan-panel";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import type { DeploymentScan } from "@/lib/deployments/types";

export function CourseScanSection({ initialScan }: { initialScan: DeploymentScan }) {
  const [scan, setScan] = React.useState(initialScan);
  const [scanning, setScanning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const next = await apiFetch<DeploymentScan>("/api/admin/deployments/scan");
      setScan(next);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "扫描失败");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <CourseScanPanel scan={scan} onScan={() => void runScan()} scanning={scanning} compact />
    </div>
  );
}
