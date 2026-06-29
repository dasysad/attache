import type { TransferProposalResult } from "./transfer.js";

export type TransferProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed";

export type TransferProposedBy = "agent" | "cli" | "mcp" | "web";

export interface TransferProposalRecord {
  id: string;
  tenantId: string;
  fromAccountId: string;
  toAccountId: string | null;
  amountUsd: number;
  memo: string | null;
  status: TransferProposalStatus;
  allowed: boolean;
  proposedBy: TransferProposedBy;
  simulation: TransferProposalResult;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransferProposalInput {
  fromAccountId: string;
  toAccountId?: string;
  amountUsd: number;
  memo?: string;
  horizonDays?: number;
  proposedBy?: TransferProposedBy;
}

export interface ListTransferProposalsOptions {
  status?: TransferProposalStatus | "pending";
  limit?: number;
}
