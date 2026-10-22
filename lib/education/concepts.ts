export const CONCEPT_IDS = [
  "sql.data-vs-instruction",
  "sql.parameter-binding",
  "idempotency.lost-response",
  "idempotency.deduplication",
] as const;

export type ConceptId = (typeof CONCEPT_IDS)[number];

export const CONCEPT_META: Record<ConceptId, { title: string; analogy: string }> = {
  "sql.data-vs-instruction": {
    title: "数据与指令：一句话为什么能改变程序",
    analogy: "餐厅点餐：订单内容不应该变成厨房的新规则",
  },
  "sql.parameter-binding": {
    title: "参数化查询：固定表格与填空",
    analogy: "表格结构固定，学生只能填写数据栏",
  },
  "idempotency.lost-response": {
    title: "支付回执丢失：一次请求为什么扣了两次",
    analogy: "付款成功但小票没打印，顾客又付了一次",
  },
  "idempotency.deduplication": {
    title: "订单号去重：重复请求只执行一次",
    analogy: "同一个快递订单号，仓库只发货一次",
  },
};

export function isConceptId(value: string): value is ConceptId {
  return (CONCEPT_IDS as readonly string[]).includes(value);
}
