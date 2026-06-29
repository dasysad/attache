import { z } from "zod";

/**
 * Published pass-through rates (USD). Update when vendor pricing changes.
 * Shown transparently to users — not Attache margin.
 */
export const PASS_THROUGH_RATES = {
  plaidPerAccountMonth: 1.0,
  snaptradePerUserMonth: 1.0,
  cloudOcrPerPage: 0.02,
  cloudLlmPerMillionTokens: 0.15,
  r2PerGbMonth: 0.03,
} as const;

/** Platform subscription (Attache-owned). */
export const PLATFORM_PRICING = {
  monthlyUsd: 4.99,
  annualUsd: 49,
  introAnnualUsd: 39,
} as const;

export const CostEstimateInputSchema = z.object({
  platformEnabled: z.boolean().default(false),
  plaidAccountCount: z.number().int().min(0).max(20).default(0),
  snaptradeUserCount: z.number().int().min(0).max(10).default(0),
  cloudOcrPages: z.number().int().min(0).max(500).default(0),
  cloudLlmTokensM: z.number().min(0).max(100).default(0),
  r2StorageGb: z.number().min(0).max(100).default(0),
});

export type CostEstimateInput = z.input<typeof CostEstimateInputSchema>;
export type CostEstimateResolved = z.infer<typeof CostEstimateInputSchema>;

export interface CostLineItem {
  id: string;
  label: string;
  category: "platform" | "pass_through" | "usage";
  quantity: number;
  unitLabel: string;
  unitUsd: number;
  totalUsd: number;
  optional: boolean;
  vendor?: string;
}

export interface CostEstimate {
  lineItems: CostLineItem[];
  platformSubtotalUsd: number;
  passThroughSubtotalUsd: number;
  usageSubtotalUsd: number;
  totalUsd: number;
  disclaimer: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Transparent monthly cost receipt. Pass-through lines use zero markup (v1).
 */
export function estimateMonthlyCost(raw: CostEstimateInput): CostEstimate {
  const input = CostEstimateInputSchema.parse(raw);
  const lines: CostLineItem[] = [];

  if (input.platformEnabled) {
    lines.push({
      id: "platform",
      label: "Attache platform",
      category: "platform",
      quantity: 1,
      unitLabel: "month",
      unitUsd: PLATFORM_PRICING.monthlyUsd,
      totalUsd: PLATFORM_PRICING.monthlyUsd,
      optional: false,
    });
  }

  if (input.plaidAccountCount > 0) {
    const unit = PASS_THROUGH_RATES.plaidPerAccountMonth;
    lines.push({
      id: "plaid",
      label: "Plaid bank sync",
      category: "pass_through",
      quantity: input.plaidAccountCount,
      unitLabel: "linked account / mo",
      unitUsd: unit,
      totalUsd: round2(unit * input.plaidAccountCount),
      optional: true,
      vendor: "Plaid",
    });
  }

  if (input.snaptradeUserCount > 0) {
    const unit = PASS_THROUGH_RATES.snaptradePerUserMonth;
    lines.push({
      id: "snaptrade",
      label: "SnapTrade brokerage (read-only)",
      category: "pass_through",
      quantity: input.snaptradeUserCount,
      unitLabel: "connected user / mo",
      unitUsd: unit,
      totalUsd: round2(unit * input.snaptradeUserCount),
      optional: true,
      vendor: "SnapTrade",
    });
  }

  if (input.cloudOcrPages > 0) {
    const unit = PASS_THROUGH_RATES.cloudOcrPerPage;
    lines.push({
      id: "cloud_ocr",
      label: "Cloud document OCR",
      category: "usage",
      quantity: input.cloudOcrPages,
      unitLabel: "page",
      unitUsd: unit,
      totalUsd: round2(unit * input.cloudOcrPages),
      optional: true,
    });
  }

  if (input.cloudLlmTokensM > 0) {
    const unit = PASS_THROUGH_RATES.cloudLlmPerMillionTokens;
    lines.push({
      id: "cloud_llm",
      label: "Cloud agent inference",
      category: "usage",
      quantity: input.cloudLlmTokensM,
      unitLabel: "M tokens",
      unitUsd: unit,
      totalUsd: round2(unit * input.cloudLlmTokensM),
      optional: true,
    });
  }

  if (input.r2StorageGb > 0) {
    const unit = PASS_THROUGH_RATES.r2PerGbMonth;
    lines.push({
      id: "r2",
      label: "Encrypted cloud backup",
      category: "usage",
      quantity: input.r2StorageGb,
      unitLabel: "GB / mo",
      unitUsd: unit,
      totalUsd: round2(unit * input.r2StorageGb),
      optional: true,
    });
  }

  const platformSubtotalUsd = round2(
    lines
      .filter((l) => l.category === "platform")
      .reduce((s, l) => s + l.totalUsd, 0),
  );
  const passThroughSubtotalUsd = round2(
    lines
      .filter((l) => l.category === "pass_through")
      .reduce((s, l) => s + l.totalUsd, 0),
  );
  const usageSubtotalUsd = round2(
    lines
      .filter((l) => l.category === "usage")
      .reduce((s, l) => s + l.totalUsd, 0),
  );

  return {
    lineItems: lines,
    platformSubtotalUsd,
    passThroughSubtotalUsd,
    usageSubtotalUsd,
    totalUsd: round2(
      platformSubtotalUsd + passThroughSubtotalUsd + usageSubtotalUsd,
    ),
    disclaimer:
      "Estimates use published vendor rates at cost (zero markup v1). Local-first usage (mesh sync, on-device OCR, BYOK agents) is $0.",
  };
}

/** Preset scenarios for marketing / onboarding copy. */
export const PRICING_SCENARIOS = {
  free: {
    label: "Free — manual only",
    input: {
      platformEnabled: false,
      plaidAccountCount: 0,
      snaptradeUserCount: 0,
      cloudOcrPages: 0,
      cloudLlmTokensM: 0,
      r2StorageGb: 0,
    },
  },
  typical: {
    label: "Typical household",
    input: {
      platformEnabled: true,
      plaidAccountCount: 3,
      snaptradeUserCount: 0,
      cloudOcrPages: 8,
      cloudLlmTokensM: 0.5,
      r2StorageGb: 2,
    },
  },
  premium: {
    label: "Platform + investments",
    input: {
      platformEnabled: true,
      plaidAccountCount: 4,
      snaptradeUserCount: 2,
      cloudOcrPages: 15,
      cloudLlmTokensM: 2,
      r2StorageGb: 5,
    },
  },
} as const;
