/**
 * Vendored from Topabaem05/Falsify (MIT, Copyright (c) 2026 Topabaem05).
 * Upstream path: packages/domain/src/ticket-machine.ts
 * Local import paths point at monitor/src/falsify/types.ts instead of @falsify/contracts.
 * See ./LICENSE.
 */
/**
 * Ticket state machine (SDD §5.4).
 *
 * ```text
 * DRAFT →validate→ QUEUED →dependencies satisfied→ ELIGIBLE →claim→ CLAIMED
 *       →create node→ MATERIALIZED →node frozen→ COMPLETED
 * Side states: BLOCKED, CANCELLED
 * ```
 *
 * `transitionTicket` is the only way a ticket changes state. Every accepted
 * transition returns a new object with `version + 1` and `updatedAt = event.at`
 * (§5.4 `version`), so optimistic concurrency works on tickets as well as on
 * the project.
 */
import type { Id, IsoTimestamp, Ticket, TicketStatus } from "./types.js";

import { domainError } from "./errors.js";
import { validateRankFactors } from "./ranking.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

/** Statuses that never transition again (§5.4). */
export const TERMINAL_TICKET_STATUSES = ["COMPLETED", "CANCELLED"] as const;

export function isTerminalTicketStatus(status: TicketStatus): boolean {
  return (TERMINAL_TICKET_STATUSES as readonly TicketStatus[]).includes(status);
}

/** Events accepted by {@link transitionTicket}. */
export type TicketEvent =
  /** DRAFT → QUEUED. Rejects a ticket whose rank factors are out of range. */
  | { readonly kind: "validate"; readonly at: IsoTimestamp }
  /** QUEUED → ELIGIBLE, once every dependency ticket has COMPLETED. */
  | { readonly kind: "dependencies_satisfied"; readonly at: IsoTimestamp }
  /** ELIGIBLE → CLAIMED. Records the actor and why the ticket was selected. */
  | {
      readonly kind: "claim";
      readonly at: IsoTimestamp;
      readonly actor: string;
      readonly selectedReason?: string;
    }
  /** CLAIMED → ELIGIBLE. Drops the claim without losing the ticket. */
  | { readonly kind: "release"; readonly at: IsoTimestamp }
  /** CLAIMED → MATERIALIZED. Binds the ticket to its one node (§5.6 inv. 3). */
  | { readonly kind: "materialize"; readonly at: IsoTimestamp; readonly nodeId: Id }
  /** MATERIALIZED → COMPLETED, when the node freezes (§5.6 inv. 4). */
  | { readonly kind: "complete"; readonly at: IsoTimestamp }
  /** Any live state → BLOCKED (repair cap reached, missing dependency, …). */
  | { readonly kind: "block"; readonly at: IsoTimestamp; readonly reason: string }
  /** BLOCKED → QUEUED, after a human clears the blocker. */
  | { readonly kind: "unblock"; readonly at: IsoTimestamp }
  /** Any live state → CANCELLED. */
  | { readonly kind: "cancel"; readonly at: IsoTimestamp; readonly reason?: string };

export type TicketEventKind = TicketEvent["kind"];

/** Legal `status → event → status` edges. Anything absent is rejected. */
const TICKET_TRANSITIONS: Readonly<
  Record<TicketEventKind, { readonly from: readonly TicketStatus[]; readonly to: TicketStatus }>
> = {
  validate: { from: ["DRAFT"], to: "QUEUED" },
  dependencies_satisfied: { from: ["QUEUED"], to: "ELIGIBLE" },
  claim: { from: ["ELIGIBLE"], to: "CLAIMED" },
  release: { from: ["CLAIMED"], to: "ELIGIBLE" },
  materialize: { from: ["CLAIMED"], to: "MATERIALIZED" },
  complete: { from: ["MATERIALIZED"], to: "COMPLETED" },
  block: { from: ["DRAFT", "QUEUED", "ELIGIBLE", "CLAIMED", "MATERIALIZED"], to: "BLOCKED" },
  unblock: { from: ["BLOCKED"], to: "QUEUED" },
  cancel: {
    from: ["DRAFT", "QUEUED", "ELIGIBLE", "CLAIMED", "MATERIALIZED", "BLOCKED"],
    to: "CANCELLED",
  },
};

/** The events a ticket in `status` will accept — used by the UI and by tests. */
export function legalTicketEvents(status: TicketStatus): readonly TicketEventKind[] {
  return (Object.keys(TICKET_TRANSITIONS) as TicketEventKind[]).filter((kind) =>
    TICKET_TRANSITIONS[kind].from.includes(status),
  );
}

function illegal(ticket: Ticket, event: TicketEvent) {
  const terminal = isTerminalTicketStatus(ticket.status);
  return domainError(
    "illegal_ticket_transition",
    `Ticket ${ticket.id} in ${ticket.status} does not accept "${event.kind}".`,
    {
      details: {
        ticketId: ticket.id,
        status: ticket.status,
        event: event.kind,
        legalEvents: legalTicketEvents(ticket.status),
      },
      remediation: terminal
        ? `${ticket.status} is terminal — create a new ticket instead of reopening this one.`
        : `Legal events here: ${legalTicketEvents(ticket.status).join(", ") || "none"}.`,
    },
  );
}

/**
 * Applies one event. Returns a conflict for illegal edges, a validation error
 * for malformed payloads, and never mutates the input ticket.
 */
export function transitionTicket(ticket: Ticket, event: TicketEvent): Result<Ticket> {
  const edge = TICKET_TRANSITIONS[event.kind];
  if (!edge.from.includes(ticket.status)) {
    return err(illegal(ticket, event));
  }

  const next: Ticket = {
    ...ticket,
    status: edge.to,
    version: ticket.version + 1,
    updatedAt: event.at,
  };

  switch (event.kind) {
    case "validate": {
      const factors = validateRankFactors(ticket.rankFactors);
      if (!factors.ok) return factors;
      if (ticket.dependencies.includes(ticket.id)) {
        return err(
          domainError("invalid_field", `Ticket ${ticket.id} depends on itself.`, {
            details: { ticketId: ticket.id },
          }),
        );
      }
      return ok(next);
    }

    case "claim": {
      if (event.actor.trim() === "") {
        return err(
          domainError("missing_field", "A claim must record the claiming actor.", {
            details: { ticketId: ticket.id },
          }),
        );
      }
      if (ticket.claimedBy !== undefined && ticket.claimedBy !== event.actor) {
        return err(
          domainError(
            "ticket_already_claimed",
            `Ticket ${ticket.id} is already claimed by ${ticket.claimedBy}.`,
            { details: { ticketId: ticket.id, claimedBy: ticket.claimedBy, actor: event.actor } },
          ),
        );
      }
      const claimed: Ticket = { ...next, claimedBy: event.actor, claimedAt: event.at };
      return ok(
        event.selectedReason === undefined
          ? claimed
          : { ...claimed, selectedReason: event.selectedReason },
      );
    }

    case "release": {
      const released: Ticket = { ...next };
      delete released.claimedBy;
      delete released.claimedAt;
      return ok(released);
    }

    case "materialize": {
      // §5.6 invariant 3: one ticket materializes at most one node.
      if (ticket.nodeId !== undefined && ticket.nodeId !== event.nodeId) {
        return err(
          domainError(
            "ticket_already_materialized",
            `Ticket ${ticket.id} already materialized node ${ticket.nodeId}.`,
            {
              details: { ticketId: ticket.id, nodeId: ticket.nodeId, requested: event.nodeId },
              remediation:
                "A ticket owns exactly one node. Create a follow-up ticket for a different experiment.",
            },
          ),
        );
      }
      return ok({ ...next, nodeId: event.nodeId });
    }

    case "complete": {
      if (ticket.nodeId === undefined) {
        return err(
          domainError("missing_field", `Ticket ${ticket.id} has no materialized node.`, {
            details: { ticketId: ticket.id },
          }),
        );
      }
      return ok(next);
    }

    case "block":
      return ok({ ...next, selectedReason: event.reason });

    case "cancel":
      return event.reason === undefined ? ok(next) : ok({ ...next, selectedReason: event.reason });

    case "dependencies_satisfied":
    case "unblock":
      return ok(next);
  }
}

/**
 * Whether every dependency has COMPLETED — the guard behind the
 * `dependencies_satisfied` event (§5.4).
 */
export function areDependenciesSatisfied(
  ticket: Pick<Ticket, "dependencies">,
  statusById: ReadonlyMap<Id, TicketStatus>,
): boolean {
  return ticket.dependencies.every((id) => statusById.get(id) === "COMPLETED");
}
