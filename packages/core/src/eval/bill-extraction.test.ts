import { describe, expect, it } from "vitest";
import { FakeDocumentAdapter } from "../ingest/fake-document-adapter.js";
import { runBillExtractionEval } from "./bill-extraction.js";

describe("runBillExtractionEval", () => {
  it("scores FakeDocumentAdapter at 100% on the 50-bill text corpus", async () => {
    const report = await runBillExtractionEval(new FakeDocumentAdapter());
    expect(report.caseCount).toBe(50);
    expect(report.casesPassed).toBe(report.caseCount);
    expect(report.meetsPrdTargets.dueDateRecall).toBe(true);
    expect(report.meetsPrdTargets.amountPrecision).toBe(true);

    const dueDate = report.fields.find((f) => f.field === "dueDate")!;
    expect(dueDate.recall).toBe(1);
    const amount = report.fields.find((f) => f.field === "amountUsd")!;
    expect(amount.precision).toBe(1);
  });

  it("reports failures when adapter throws", async () => {
    const broken = {
      mode: "sandbox" as const,
      extract: async () => {
        throw new Error("sidecar down");
      },
    };
    const report = await runBillExtractionEval(broken);
    expect(report.casesPassed).toBe(0);
    expect(report.cases.every((c) => c.error)).toBe(true);
  });

  it("flags wrong payee as a field miss", async () => {
    const wrongPayee = {
      mode: "sandbox" as const,
      extract: async () => ({
        payee: "Wrong Vendor",
        amountUsd: 64.2,
        dueDate: "2026-07-18",
        cadence: "monthly" as const,
        autopay: false,
        classifier: "bill" as const,
        confidence: 0.9,
      }),
    };
    const report = await runBillExtractionEval(wrongPayee);
    expect(report.casesPassed).toBe(0);
    const payee = report.fields.find((f) => f.field === "payee")!;
    expect(payee.truePositives).toBe(0);
  });
});
