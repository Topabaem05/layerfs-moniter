/**
 * Vendored from Topabaem05/Falsify (MIT, Copyright (c) 2026 Topabaem05).
 * Upstream path: packages/domain/src/ranking.ts
 * Local import paths point at monitor/src/falsify/types.ts instead of @falsify/contracts.
 * See ./LICENSE.
 */
/**
 * Deterministic ticket ranking (SDD §5.4 "Ticket ranking").
 *
 * ```text
 * score =
 *   0.30 × expectedGain
 * + 0.25 × informationGain
 * + 0.15 × uncertaintyReduction
 * + 0.15 × costEfficiency
 * + 0.10 × novelty
 * - 0.15 × risk
 * - duplicatePenalty
 * + pinBoost
 * + userPriorityBoost
 * ```
 *
 * An agent proposes the factors and an explanation; the score itself is only
 * ever computed here, by deterministic code (§5.4, §12.2 — a ranking an agent
 * could write directly would let a prompt injection reorder the queue).
 */
import type { IsoTimestamp, RankFactors, Ticket } from "./types.js";

import { domainError } from "./errors.js";
import type { Check, Result } from "./result.js";
import { err, ok } from "./result.js";

/** The §5.4 weights, verbatim. `risk` is subtracted. */
export const RANK_WEIGHTS = {
  expectedGain: 0.3,
  informationGain: 0.25,
  uncertaintyReduction: 0.15,
  costEfficiency: 0.15,
  novelty: 0.1,
  risk: -0.15,
} as const;

/**
 * `pinBoost`. Chosen constants (the SDD leaves them to the implementation):
 *
 * - The weighted part of the score is bounded by `[-0.15, 0.95]`.
 * - `userPriorityBoost` adds at most `10 × 0.01 = 0.10`.
 * - `duplicatePenalty` subtracts at most {@link MAX_DUPLICATE_PENALTY} = 10.
 *
 * `PIN_BOOST = 1000` therefore puts the worst possible pinned ticket
 * (`1000 − 0.15 − 10 = 989.85`) above the best possible unpinned one
 * (`0.95 + 0.10 = 1.05`) by construction, which is what §5.4's "pinned ticket
 * 은 queue 상단에 고정된다" requires as an arithmetic property rather than a
 * sorting special case.
 */
export const PIN_BOOST = 1000;

/** `userPriorityBoost = priority × 0.01`; `priority` is 0–10 (§5.4). */
export const USER_PRIORITY_BOOST_PER_POINT = 0.01;

/** Maximum ticket priority accepted here; matches `TicketSchema.priority`. */
export const MAX_TICKET_PRIORITY = 10;

/**
 * Upper bound on `duplicatePenalty`. `RankFactorsSchema` only requires
 * non-negative, but an unbounded penalty would let a duplicate-heavy ticket
 * sink below a pinned one and break the pin guarantee above, so the domain
 * tightens the range to `[0, 10]`.
 */
export const MAX_DUPLICATE_PENALTY = 10;

const UNIT_FACTORS = [
  "expectedGain",
  "informationGain",
  "uncertaintyReduction",
  "costEfficiency",
  "novelty",
  "risk",
] as const satisfies readonly (keyof RankFactors)[];

/** Rejects factors outside `[0, 1]` (or a `duplicatePenalty` outside `[0, 10]`). */
export function validateRankFactors(factors: RankFactors): Check {
  for (const key of UNIT_FACTORS) {
    const value = factors[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return err(
        domainError("out_of_range", `Rank factor "${key}" must be in [0, 1], got ${value}.`, {
          details: { factor: key, value },
        }),
      );
    }
  }
  const penalty = factors.duplicatePenalty;
  if (!Number.isFinite(penalty) || penalty < 0 || penalty > MAX_DUPLICATE_PENALTY) {
    return err(
      domainError(
        "out_of_range",
        `duplicatePenalty must be in [0, ${MAX_DUPLICATE_PENALTY}], got ${penalty}.`,
        { details: { factor: "duplicatePenalty", value: penalty } },
      ),
    );
  }
  return ok();
}

export interface RankOptions {
  readonly pinned: boolean;
  /** Human priority, 0–10 (§5.4 `priority`). */
  readonly priority: number;
}

/**
 * The §5.4 formula. Deterministic: identical input always yields the identical
 * `number`, including the floating-point summation order.
 */
export function computeRankScore(
  factors: RankFactors,
  options: RankOptions,
): Result<number> {
  const factorCheck = validateRankFactors(factors);
  if (!factorCheck.ok) return factorCheck;

  const { priority } = options;
  if (!Number.isFinite(priority) || priority < 0 || priority > MAX_TICKET_PRIORITY) {
    return err(
      domainError(
        "out_of_range",
        `priority must be in [0, ${MAX_TICKET_PRIORITY}], got ${priority}.`,
        { details: { priority } },
      ),
    );
  }

  const weighted =
    RANK_WEIGHTS.expectedGain * factors.expectedGain +
    RANK_WEIGHTS.informationGain * factors.informationGain +
    RANK_WEIGHTS.uncertaintyReduction * factors.uncertaintyReduction +
    RANK_WEIGHTS.costEfficiency * factors.costEfficiency +
    RANK_WEIGHTS.novelty * factors.novelty +
    RANK_WEIGHTS.risk * factors.risk;

  const pinBoost = options.pinned ? PIN_BOOST : 0;
  const userPriorityBoost = priority * USER_PRIORITY_BOOST_PER_POINT;

  return ok(weighted - factors.duplicatePenalty + pinBoost + userPriorityBoost);
}

/** A ticket with its recomputed score and its 1-based position in the queue. */
export interface RankedTicket {
  /** The input ticket with `rankScore` replaced by the computed value. */
  readonly ticket: Ticket;
  readonly rankScore: number;
  readonly rank: number;
}

/**
 * Orders the queue: pinned first, then score descending, with a stable
 * tiebreak on `createdAt` then `id` so two runs over the same set always
 * produce the same order regardless of input order.
 *
 * The returned tickets carry the freshly computed `rankScore`. Ranking is a
 * derived projection, not a state transition, so `version` is left alone.
 */
export function rankTickets(tickets: readonly Ticket[]): Result<RankedTicket[]> {
  const scored: { ticket: Ticket; rankScore: number }[] = [];

  for (const ticket of tickets) {
    const score = computeRankScore(ticket.rankFactors, {
      pinned: ticket.pinned,
      priority: ticket.priority,
    });
    if (!score.ok) {
      return err({
        ...score.error,
        details: { ...score.error.details, ticketId: ticket.id },
      });
    }
    scored.push({ ticket: { ...ticket, rankScore: score.value }, rankScore: score.value });
  }

  scored.sort((a, b) => {
    if (a.ticket.pinned !== b.ticket.pinned) return a.ticket.pinned ? -1 : 1;
    if (a.rankScore !== b.rankScore) return b.rankScore - a.rankScore;
    if (a.ticket.createdAt !== b.ticket.createdAt) {
      return a.ticket.createdAt < b.ticket.createdAt ? -1 : 1;
    }
    if (a.ticket.id === b.ticket.id) return 0;
    return a.ticket.id < b.ticket.id ? -1 : 1;
  });

  return ok(scored.map((entry, index) => ({ ...entry, rank: index + 1 })));
}

/** Human-readable breakdown shown next to the score in the queue UI (§17.3). */
export interface RankExplanation {
  readonly term: string;
  readonly weight: number;
  readonly factor: number;
  readonly contribution: number;
}

export function explainRankScore(
  factors: RankFactors,
  options: RankOptions,
): readonly RankExplanation[] {
  const terms: RankExplanation[] = UNIT_FACTORS.map((key) => ({
    term: key,
    weight: RANK_WEIGHTS[key],
    factor: factors[key],
    contribution: RANK_WEIGHTS[key] * factors[key],
  }));

  terms.push({
    term: "duplicatePenalty",
    weight: -1,
    factor: factors.duplicatePenalty,
    contribution: -factors.duplicatePenalty,
  });
  terms.push({
    term: "pinBoost",
    weight: PIN_BOOST,
    factor: options.pinned ? 1 : 0,
    contribution: options.pinned ? PIN_BOOST : 0,
  });
  terms.push({
    term: "userPriorityBoost",
    weight: USER_PRIORITY_BOOST_PER_POINT,
    factor: options.priority,
    contribution: options.priority * USER_PRIORITY_BOOST_PER_POINT,
  });

  return terms;
}

/** Convenience for the application layer: persist a recomputed score. */
export function withRankScore(ticket: Ticket, score: number, at: IsoTimestamp): Ticket {
  return { ...ticket, rankScore: score, updatedAt: at };
}
