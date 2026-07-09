/**
 * Bill extraction eval harness (v1 hardening slice 3).
 *
 * WHAT: run a DocumentExtractionPort against a fixture corpus and score field-level
 *       accuracy (precision/recall/F1) per OCR strategy PRD targets.
 * HOW: manifest.json lists files + golden expected fields; we compare extracted vs
 *      expected with tolerances (amount ±$0.01, exact string match elsewhere).
 * WHY: pick Docling vs GLM-OCR vs heuristics with measured accuracy, not vibes.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BillExtraction, DocumentExtractionPort } from "../ingest/document-port.js";

/** Golden fields we score (subset of BillExtraction). */
export interface BillExtractionExpected {
  payee: string;
  amountUsd: number;
  dueDate: string;
  cadence: BillExtraction["cadence"];
  autopay: boolean;
}

export interface EvalCase {
  id: string;
  file: string;
  expected: BillExtractionExpected;
}

export interface EvalManifest {
  version: number;
  description?: string;
  cases: EvalCase[];
}

export type EvalField = keyof BillExtractionExpected;

export interface FieldScore {
  field: EvalField;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface EvalCaseResult {
  id: string;
  file: string;
  passed: boolean;
  fieldMatches: Record<EvalField, boolean>;
  extracted: BillExtraction | null;
  error?: string;
}

export interface EvalReport {
  adapterMode: string;
  caseCount: number;
  casesPassed: number;
  fields: FieldScore[];
  cases: EvalCaseResult[];
  /** PRD OCR strategy targets for quick pass/fail summary. */
  meetsPrdTargets: {
    dueDateRecall: boolean;
    amountPrecision: boolean;
  };
}

const EVAL_FIELDS: EvalField[] = ["payee", "amountUsd", "dueDate", "cadence", "autopay"];

/** Default corpus shipped with @attache/core. */
export function defaultEvalManifestPath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../../fixtures/eval/manifest.json",
  );
}

export function defaultEvalFixturesDir(manifestPath = defaultEvalManifestPath()): string {
  return dirname(manifestPath);
}

export function loadEvalManifest(manifestPath = defaultEvalManifestPath()): EvalManifest {
  if (!existsSync(manifestPath)) {
    throw new Error(`Eval manifest not found: ${manifestPath}`);
  }
  const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as EvalManifest;
  if (!parsed.cases?.length) {
    throw new Error("Eval manifest has no cases");
  }
  return parsed;
}

function fieldMatch(
  field: EvalField,
  expected: BillExtractionExpected,
  extracted: BillExtraction,
): boolean {
  switch (field) {
    case "amountUsd":
      return Math.abs(extracted.amountUsd - expected.amountUsd) < 0.011;
    case "payee":
      return extracted.payee.trim().toLowerCase() === expected.payee.trim().toLowerCase();
    case "dueDate":
      return extracted.dueDate === expected.dueDate;
    case "cadence":
      return extracted.cadence === expected.cadence;
    case "autopay":
      return extracted.autopay === expected.autopay;
    default:
      return false;
  }
}

function computeFieldScores(results: EvalCaseResult[]): FieldScore[] {
  return EVAL_FIELDS.map((field) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const r of results) {
      if (!r.extracted) {
        fn += 1;
        continue;
      }
      if (r.fieldMatches[field]) tp += 1;
      else {
        fp += 1;
        fn += 1;
      }
    }
    const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { field, truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, f1 };
  });
}

/**
 * Run the eval corpus against `adapter` and return a structured report.
 */
export async function runBillExtractionEval(
  adapter: DocumentExtractionPort,
  manifestPath = defaultEvalManifestPath(),
): Promise<EvalReport> {
  const manifest = loadEvalManifest(manifestPath);
  const fixturesDir = defaultEvalFixturesDir(manifestPath);
  const caseResults: EvalCaseResult[] = [];

  for (const evalCase of manifest.cases) {
    const filePath = join(fixturesDir, evalCase.file);
    if (!existsSync(filePath)) {
      caseResults.push({
        id: evalCase.id,
        file: evalCase.file,
        passed: false,
        fieldMatches: emptyFieldMatches(false),
        extracted: null,
        error: `fixture missing: ${filePath}`,
      });
      continue;
    }

    const bytes = readFileSync(filePath);
    try {
      const extracted = await adapter.extract({
        filename: evalCase.file,
        mimeType: guessMime(evalCase.file),
        bytes,
      });
      const fieldMatches = {} as Record<EvalField, boolean>;
      for (const field of EVAL_FIELDS) {
        fieldMatches[field] = fieldMatch(field, evalCase.expected, extracted);
      }
      const passed = EVAL_FIELDS.every((f) => fieldMatches[f]);
      caseResults.push({
        id: evalCase.id,
        file: evalCase.file,
        passed,
        fieldMatches,
        extracted,
      });
    } catch (e) {
      caseResults.push({
        id: evalCase.id,
        file: evalCase.file,
        passed: false,
        fieldMatches: emptyFieldMatches(false),
        extracted: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const fields = computeFieldScores(caseResults);
  const dueDate = fields.find((f) => f.field === "dueDate")!;
  const amount = fields.find((f) => f.field === "amountUsd")!;

  return {
    adapterMode: adapter.mode,
    caseCount: caseResults.length,
    casesPassed: caseResults.filter((c) => c.passed).length,
    fields,
    cases: caseResults,
    meetsPrdTargets: {
      dueDateRecall: dueDate.recall >= 0.9,
      amountPrecision: amount.precision >= 0.95,
    },
  };
}

function emptyFieldMatches(value: boolean): Record<EvalField, boolean> {
  return {
    payee: value,
    amountUsd: value,
    dueDate: value,
    cadence: value,
    autopay: value,
  };
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}
