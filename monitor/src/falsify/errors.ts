/**
 * Vendored from Topabaem05/Falsify (MIT, Copyright (c) 2026 Topabaem05).
 * Upstream path: packages/domain/src/errors.ts
 * Local import paths point at monitor/src/falsify/types.ts instead of @falsify/contracts.
 * See ./LICENSE.
 */
/**
 * Domain error model (SDD §13.1).
 *
 * Every failure carries the §13.1 `category` — that is what the application
 * layer maps onto the WebMCP `ToolResult.status` (§7.2) — plus a stable machine
 * `code`, a human message and, where it helps an agent recover, a `remediation`
 * sentence. `AC-03` in particular requires that a rejected mutation of a frozen
 * node tells the caller to create a child ticket instead.
 */
import type { ErrorCategory } from "./types.js";

/**
 * Stable error codes. Grouped by the §13.1 category they always carry so the
 * mapping stays reviewable; `errorCategoryOf` is the single source of truth.
 */
export const DOMAIN_ERROR_CODES = [
  // validation — bad input, no mutation happened (§13.1 "Validation")
  "invalid_field",
  "out_of_range",
  "missing_field",
  "unknown_entity_reference",
  "run_not_terminal",

  // conflict — stale revision, already-claimed, immutability (§13.1 "Conflict")
  "stale_revision",
  "illegal_ticket_transition",
  "illegal_node_transition",
  "ticket_already_claimed",
  "ticket_already_materialized",
  "node_frozen",
  "node_not_frozen",
  "already_incumbent",
  "round_already_resolved",

  // policy — contract, budget and approval rules (§13.1 "Policy")
  "contract_frozen",
  "immutable_config_key",
  "contract_hash_mismatch",
  "budget_exhausted",
  "parallelism_exhausted",
  "compute_budget_exhausted",
  "round_capacity_exhausted",
  "promote_requires_improvement",
  "baseline_required",

  // implementation — harness produced something the contract forbids (§13.1)
  "forbidden_change",
  "hypothesis_changed",
  "graph_cycle",
  "parent_not_frozen",
  "missing_parent",

  // runtime_technical — the run itself broke (§13.1, §6.3)
  "technical_failure",
  "repair_cap_exhausted",

  // scientific — a valid but negative result (§13.1)
  "scientific_regression",

  // infrastructure — store/worker level (§13.1)
  "storage_unavailable",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

const CATEGORY_BY_CODE: Readonly<Record<DomainErrorCode, ErrorCategory>> = {
  invalid_field: "validation",
  out_of_range: "validation",
  missing_field: "validation",
  unknown_entity_reference: "validation",
  run_not_terminal: "validation",

  stale_revision: "conflict",
  illegal_ticket_transition: "conflict",
  illegal_node_transition: "conflict",
  ticket_already_claimed: "conflict",
  ticket_already_materialized: "conflict",
  node_frozen: "conflict",
  node_not_frozen: "conflict",
  already_incumbent: "conflict",
  round_already_resolved: "conflict",

  contract_frozen: "policy",
  immutable_config_key: "policy",
  contract_hash_mismatch: "policy",
  budget_exhausted: "policy",
  parallelism_exhausted: "policy",
  compute_budget_exhausted: "policy",
  round_capacity_exhausted: "policy",
  promote_requires_improvement: "policy",
  baseline_required: "policy",

  forbidden_change: "implementation",
  hypothesis_changed: "implementation",
  graph_cycle: "implementation",
  parent_not_frozen: "implementation",
  missing_parent: "implementation",

  technical_failure: "runtime_technical",
  repair_cap_exhausted: "runtime_technical",

  scientific_regression: "scientific",

  storage_unavailable: "infrastructure",
};

/** The §13.1 category a code always belongs to. */
export function errorCategoryOf(code: DomainErrorCode): ErrorCategory {
  return CATEGORY_BY_CODE[code];
}

export interface DomainErrorDetails {
  readonly [key: string]: unknown;
}

/**
 * A domain rule rejection. Discriminated by `category` for envelope mapping and
 * by `code` for precise handling; both are always present.
 */
export interface DomainError {
  readonly category: ErrorCategory;
  readonly code: DomainErrorCode;
  readonly message: string;
  /** Structured context (offending keys, limits, current revision, …). */
  readonly details?: DomainErrorDetails;
  /** What the caller should do instead — surfaced to agents and to the UI. */
  readonly remediation?: string;
}

export interface DomainErrorInit {
  readonly details?: DomainErrorDetails;
  readonly remediation?: string;
}

/** Builds a `DomainError`; the category is derived from the code. */
export function domainError(
  code: DomainErrorCode,
  message: string,
  init: DomainErrorInit = {},
): DomainError {
  const base = {
    category: errorCategoryOf(code),
    code,
    message,
  } satisfies Omit<DomainError, "details" | "remediation">;

  if (init.details !== undefined && init.remediation !== undefined) {
    return { ...base, details: init.details, remediation: init.remediation };
  }
  if (init.details !== undefined) return { ...base, details: init.details };
  if (init.remediation !== undefined) return { ...base, remediation: init.remediation };
  return base;
}

/** True when the error is one an agent may retry after re-reading state. */
export function isRetryable(error: DomainError): boolean {
  return error.category === "conflict" || error.category === "infrastructure";
}

/**
 * Rejection used whenever a caller tries to mutate a frozen node
 * (SDD §5.6 invariant 5, AC-03).
 */
export function frozenNodeError(nodeId: string, attempted: string): DomainError {
  return domainError(
    "node_frozen",
    `Node ${nodeId} is frozen; ${attempted} is not allowed.`,
    {
      details: { nodeId, attempted },
      remediation:
        "Frozen nodes are permanent scientific records. Create a new ticket and materialize a child node instead.",
    },
  );
}
