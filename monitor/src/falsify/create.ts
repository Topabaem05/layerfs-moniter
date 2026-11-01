/**
 * Improvement-branch ticket creation.
 *
 * The state machine, rank formula and dependency guard are the Falsify domain
 * files in this directory. The batch steps follow `buildTickets` in
 * Falsify `packages/application/src/commands/create-tickets.ts`:
 * validate the draft, score it in the domain, store it as DRAFT, then
 * `validate` (DRAFT → QUEUED) and `dependencies_satisfied` (QUEUED → ELIGIBLE)
 * when every dependency is already COMPLETED.
 *
 * Not ported, because they need the Falsify workspace graph: idempotency keys,
 * project revision checks, approval policy, node/round lookups, and the
 * WebMCP ToolResult envelope. Explicit parent ids are recorded and not
 * resolved against an experiment graph.
 */
import { areDependenciesSatisfied, transitionTicket } from "./ticket-machine.js";
import { computeRankScore } from "./ranking.js";
import type { DomainError } from "./errors.js";
import type {
  Id,
  ParentPolicy,
  ParentPolicyKind,
  RankFactors,
  Ticket,
  TicketSource,
  TicketStatus,
  TicketType,
} from "./types.js";

/** Neutral prior from Falsify create-tickets.ts. Every factor at 0.5. */
export const DEFAULT_RANK_FACTORS: RankFactors = {
  expectedGain: 0.5,
  informationGain: 0.5,
  uncertaintyReduction: 0.5,
  costEfficiency: 0.5,
  novelty: 0.5,
  risk: 0.5,
  duplicatePenalty: 0,
};

const TYPES = new Set<TicketType>([
  "experiment",
  "ablation",
  "literature",
  "analysis",
  "reproduction",
  "verification",
]);

const POLICIES = new Set<ParentPolicyKind>(["incumbent", "baseline", "explicit", "round-parent"]);

export interface RankFactorsInput {
  expected_gain: number;
  information_gain: number;
  uncertainty_reduction: number;
  cost_efficiency: number;
  novelty: number;
  risk: number;
  duplicate_penalty: number;
}

/** Wire draft. Field names match Falsify `TicketDraftInputSchema`. */
export interface TicketDraftInput {
  title: string;
  type: TicketType;
  hypothesis: string;
  instruction: string;
  parent_policy: ParentPolicyKind;
  parent_node_id?: string;
  required_evidence?: string[];
  rationale?: string;
  decision_axis?: string;
  round_id?: string;
  dependencies?: string[];
  provenance_refs?: string[];
  priority?: number;
  pinned?: boolean;
  rank_factors?: RankFactorsInput;
}

export interface CreateTicketsInput {
  project_id: string;
  tickets: TicketDraftInput[];
  source?: TicketSource;
}

export type CreateFailure =
  | { readonly kind: "domain"; readonly error: DomainError }
  | { readonly kind: "invalid"; readonly message: string };

export type CreateOutcome =
  | { readonly ok: true; readonly tickets: readonly Ticket[] }
  | ({ readonly ok: false } & CreateFailure);

function toRankFactors(input: RankFactorsInput | undefined): RankFactors {
  if (input === undefined) return { ...DEFAULT_RANK_FACTORS };
  return {
    expectedGain: input.expected_gain,
    informationGain: input.information_gain,
    uncertaintyReduction: input.uncertainty_reduction,
    costEfficiency: input.cost_efficiency,
    novelty: input.novelty,
    risk: input.risk,
    duplicatePenalty: input.duplicate_penalty,
  };
}

function lengthError(field: string, value: string, min: number, max: number): string | undefined {
  if (value.trim().length < min || value.length > max) {
    return `${field} must be ${min}–${max} characters.`;
  }
  return undefined;
}

function checkDraft(draft: TicketDraftInput, known: ReadonlyMap<Id, TicketStatus>): string | undefined {
  const title = lengthError("title", draft.title ?? "", 3, 120);
  if (title) return title;
  if (!TYPES.has(draft.type)) return `type must be a Falsify ticket type, got ${draft.type}.`;
  const hypothesis = lengthError("hypothesis", draft.hypothesis ?? "", 10, 1200);
  if (hypothesis) return hypothesis;
  const instruction = lengthError("instruction", draft.instruction ?? "", 10, 2000);
  if (instruction) return instruction;
  if (!POLICIES.has(draft.parent_policy)) {
    return `parent_policy must be incumbent, baseline, explicit or round-parent.`;
  }
  if (draft.parent_policy === "explicit" && (draft.parent_node_id ?? "").trim() === "") {
    return 'parent_policy "explicit" requires parent_node_id.';
  }
  if (draft.parent_policy === "round-parent" && draft.round_id === undefined) {
    return 'parent_policy "round-parent" requires round_id.';
  }
  if ((draft.rationale?.length ?? 0) > 2000) return "rationale must be at most 2000 characters.";
  if ((draft.decision_axis?.length ?? 0) > 120) return "decision_axis must be at most 120 characters.";
  const evidence = draft.required_evidence ?? [];
  if (evidence.length > 8 || evidence.some((item) => item.trim() === "" || item.length > 64)) {
    return "required_evidence accepts at most 8 non-empty names of at most 64 characters.";
  }
  const provenance = draft.provenance_refs ?? [];
  if (provenance.length > 32 || provenance.some((item) => item.length === 0 || item.length > 256)) {
    return "provenance_refs accepts at most 32 references of at most 256 characters.";
  }
  const dependencies = draft.dependencies ?? [];
  if (dependencies.length > 32) return "dependencies accepts at most 32 ticket ids.";
  for (const dependency of dependencies) {
    if (!known.has(dependency)) {
      return `dependency ${dependency} is not a ticket of this project.`;
    }
  }
  return undefined;
}

export interface BuildInput {
  readonly projectId: string;
  readonly drafts: readonly TicketDraftInput[];
  readonly source: TicketSource;
  readonly existing: readonly Ticket[];
  readonly now: string;
  readonly newId: () => string;
  /** When true, leave the ticket in DRAFT instead of QUEUED/ELIGIBLE. */
  readonly holdDraft?: boolean;
}

/**
 * Shared creation step. Returns tickets already advanced to QUEUED or ELIGIBLE
 * with scores computed by the domain.
 */
export function buildTickets(input: BuildInput): CreateOutcome {
  if (input.projectId.trim() === "") {
    return { ok: false, kind: "invalid", message: "project_id is required." };
  }
  if (input.drafts.length < 1 || input.drafts.length > 8) {
    return { ok: false, kind: "invalid", message: "A batch contains 1 to 8 tickets." };
  }

  const statusById = new Map<Id, TicketStatus>(
    input.existing.map((ticket) => [ticket.id, ticket.status]),
  );
  const built: Ticket[] = [];

  for (const draft of input.drafts) {
    const problem = checkDraft(draft, statusById);
    if (problem) return { ok: false, kind: "invalid", message: problem };

    let parentPolicy: ParentPolicy;
    if (draft.parent_policy === "explicit") {
      parentPolicy = { kind: "explicit", nodeId: draft.parent_node_id ?? "" };
    } else if (draft.parent_policy === "baseline") {
      parentPolicy = { kind: "baseline" };
    } else if (draft.parent_policy === "round-parent") {
      parentPolicy = { kind: "round-parent" };
    } else {
      parentPolicy = { kind: "incumbent" };
    }

    const factors = toRankFactors(draft.rank_factors);
    const priority = draft.priority ?? 0;
    const pinned = draft.pinned ?? false;
    const score = computeRankScore(factors, { pinned, priority });
    if (!score.ok) return { ok: false, kind: "domain", error: score.error };

    const ticket: Ticket = {
      id: input.newId(),
      projectId: input.projectId,
      title: draft.title,
      type: draft.type,
      hypothesis: draft.hypothesis,
      instruction: draft.instruction,
      parentPolicy,
      requiredEvidence: [...(draft.required_evidence ?? [])],
      dependencies: [...(draft.dependencies ?? [])],
      provenanceRefs: [...(draft.provenance_refs ?? [])].slice(0, 32),
      source: input.source,
      priority,
      pinned,
      rankFactors: factors,
      rankScore: score.value,
      status: "DRAFT",
      version: 0,
      createdAt: input.now,
      updatedAt: input.now,
    };
    if (draft.rationale !== undefined) ticket.rationale = draft.rationale;
    if (draft.decision_axis !== undefined) ticket.decisionAxis = draft.decision_axis;
    if (draft.round_id !== undefined) ticket.roundId = draft.round_id;

    if (input.holdDraft) {
      statusById.set(ticket.id, ticket.status);
      built.push(ticket);
      continue;
    }

    const queued = transitionTicket(ticket, { kind: "validate", at: input.now });
    if (!queued.ok) return { ok: false, kind: "domain", error: queued.error };

    let current = queued.value;
    if (areDependenciesSatisfied(current, statusById)) {
      const eligible = transitionTicket(current, { kind: "dependencies_satisfied", at: input.now });
      if (!eligible.ok) return { ok: false, kind: "domain", error: eligible.error };
      current = eligible.value;
    }

    statusById.set(current.id, current.status);
    built.push(current);
  }

  return { ok: true, tickets: built };
}
