import { CONCEPT_META, type ConceptId } from "@/lib/education/concepts";

const LABELS: Record<string, string> = {
  session_start: "开始学习本章",
  concept_viewed: "查看概念动画",
  concept_step_viewed: "查看动画步骤",
  concept_play: "播放概念动画",
  concept_pause: "暂停概念动画",
  concept_restart: "重新播放概念动画",
  concept_step: "单步查看动画",
  concept_completed: "完成概念动画",
  concept_variant_changed: "切换动画案例",
  checkpoint_answered: "完成知识检查",
  defence_toggled: "调整防御措施",
  payload_selected: "选择注入载荷",
  audit_run: "运行安全审计",
  audit_passed: "实验审计通过",
  audit_failed: "实验审计未通过",
  retry_simulation_run: "运行支付重试模拟",
  retry_strategy_passed: "提交幂等策略并通过",
  retry_strategy_failed: "提交幂等策略未通过",
  lesson_completed: "完成章节",
  quiz_submitted: "提交测验",
  note_saved: "保存笔记",
  heartbeat: "学习心跳",
};

export function describeEvent(
  type: string,
  payload: Record<string, unknown>,
): { label: string; detail: string | null } {
  const label = LABELS[type] ?? type;
  if (type.startsWith("concept_")) {
    const conceptId = typeof payload.conceptId === "string" ? payload.conceptId : null;
    const meta = conceptId ? CONCEPT_META[conceptId as ConceptId] : null;
    const step = typeof payload.step === "number" ? `第 ${payload.step} 步` : null;
    return {
      label,
      detail: [meta?.title, step].filter(Boolean).join(" · ") || null,
    };
  }
  if (type === "checkpoint_answered") {
    return {
      label,
      detail:
        payload.correct === true
          ? "回答正确"
          : payload.correct === false
            ? "回答错误"
            : null,
    };
  }
  if (type === "audit_run") {
    const blocked = typeof payload.blocked === "number" ? payload.blocked : null;
    return { label, detail: blocked === null ? null : `${blocked} 个载荷被阻止` };
  }
  if (type === "defence_toggled") {
    const defence = typeof payload.defence === "string" ? payload.defence : null;
    return { label, detail: defence ? `${defence} · ${payload.enabled ? "启用" : "关闭"}` : null };
  }
  return { label, detail: null };
}
