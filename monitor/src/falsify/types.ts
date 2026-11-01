/**
 * Ticket types used by the vendored Falsify kernel.
 *
 * Shape follows packages/contracts/src/ticket.ts in Topabaem05/Falsify.
 * The Zod schemas stayed upstream; monitor/src/falsify/create.ts checks the
 * same bounds before a ticket is built.
 */

export type Id = string;
export type IsoTimestamp = string;

export type ErrorCategory =
  | "validation"
  | "conflict"
  | "policy"
  | "implementation"
  | "runtime_technical"
  | "scientific"
  | "infrastructure";

export type TicketType =
  | "experiment"
  | "ablation"
  | "literature"
  | "analysis"
  | "reproduction"
  | "verification";

export type TicketStatus =
  | "DRAFT"
  | "QUEUED"
  | "ELIGIBLE"
  | "CLAIMED"
  | "MATERIALIZED"
  | "COMPLETED"
  | "BLOCKED"
  | "CANCELLED";

export type TicketSource = "human" | "agent" | "system" | "literature";

export type ParentPolicy =
  | { kind: "incumbent" }
  | { kind: "baseline" }
  | { kind: "explicit"; nodeId: Id }
  | { kind: "round-parent" };

export type ParentPolicyKind = ParentPolicy["kind"];

export interface RankFactors {
  expectedGain: number;
  informationGain: number;
  uncertaintyReduction: number;
  costEfficiency: number;
  novelty: number;
  risk: number;
  duplicatePenalty: number;
}

export interface Ticket {
  id: Id;
  projectId: Id;
  roundId?: Id;
  title: string;
  type: TicketType;
  hypothesis: string;
  instruction: string;
  rationale?: string;
  decisionAxis?: string;
  parentPolicy: ParentPolicy;
  requiredEvidence: string[];
  dependencies: Id[];
  provenanceRefs: string[];
  source: TicketSource;
  priority: number;
  pinned: boolean;
  rankFactors: RankFactors;
  rankScore: number;
  selectedReason?: string;
  status: TicketStatus;
  claimedBy?: string;
  claimedAt?: IsoTimestamp;
  nodeId?: Id;
  version: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
