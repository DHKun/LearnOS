import { describe, expect, it } from "vitest";

import { canonicalJson } from "@/lib/crypto/canonical-json";

describe("canonicalJson", () => {
  it("忽略对象键顺序", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it("保留数组顺序", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("对嵌套值稳定序列化", () => {
    expect(canonicalJson({ z: [true, null, "x"], a: 1 })).toBe(
      '{"a":1,"z":[true,null,"x"]}',
    );
  });
});
