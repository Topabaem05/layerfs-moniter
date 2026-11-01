import { describe, expect, it } from "vitest";

import { buildTickets, type TicketDraftInput } from "./create.js";
import { transitionTicket } from "./ticket-machine.js";

const draft: TicketDraftInput = {
  title: "Improve Engine: preserve unmount abort custody",
  type: "experiment",
  hypothesis: "A branch cut from the unmount fix can improve daemon custody while main stays published.",
  instruction: "Start the improvement branch at the published unmount commit and carry the daemon change.",
  parent_policy: "incumbent",
  required_evidence: ["diff"],
  provenance_refs: ["69fedcacf"],
  priority: 0,
  pinned: false,
  rank_factors: {
    expected_gain: 1,
    information_gain: 1,
    uncertainty_reduction: 1,
    cost_efficiency: 1,
    novelty: 1,
    risk: 0,
    duplicate_penalty: 0,
  },
};

describe("Falsify ticket entry path", () => {
  it("advances a free ticket from DRAFT to ELIGIBLE and scores it in the domain", () => {
    const outcome = buildTickets({
      projectId: "layerfs-moniter",
      drafts: [draft],
      source: "human",
      existing: [],
      now: "2026-11-01T00:00:00.000Z",
      newId: () => "tkt_fixed",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const ticket = outcome.tickets[0];
    expect(ticket?.status).toBe("ELIGIBLE");
    expect(ticket?.version).toBe(2);
    expect(ticket?.rankScore).toBeCloseTo(0.95);
    expect(ticket?.parentPolicy).toEqual({ kind: "incumbent" });
  });

  it("leaves a ticket QUEUED when a dependency is not COMPLETED", () => {
    const first = buildTickets({
      projectId: "layerfs-moniter",
      drafts: [draft],
      source: "human",
      existing: [],
      now: "2026-11-01T00:00:00.000Z",
      newId: () => "tkt_first",
    });
    if (!first.ok) throw new Error("first ticket failed");
    const second = buildTickets({
      projectId: "layerfs-moniter",
      drafts: [{ ...draft, title: "Follow the unmount branch", dependencies: ["tkt_first"] }],
      source: "agent",
      existing: first.tickets,
      now: "2026-11-01T00:01:00.000Z",
      newId: () => "tkt_second",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.tickets[0]?.status).toBe("QUEUED");
  });

  it("rejects a second cancel because CANCELLED is terminal", () => {
    const outcome = buildTickets({
      projectId: "layerfs-moniter",
      drafts: [draft],
      source: "human",
      existing: [],
      now: "2026-11-01T00:00:00.000Z",
      newId: () => "tkt_cancel",
    });
    if (!outcome.ok) throw new Error("ticket failed");
    const ticket = outcome.tickets[0];
    if (!ticket) throw new Error("missing ticket");
    const once = transitionTicket(ticket, { kind: "cancel", at: "2026-11-01T00:02:00.000Z", reason: "stop" });
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = transitionTicket(once.value, { kind: "cancel", at: "2026-11-01T00:03:00.000Z" });
    expect(twice.ok).toBe(false);
    if (twice.ok) return;
    expect(twice.error.code).toBe("illegal_ticket_transition");
  });

  it("rejects a title that is too short", () => {
    const outcome = buildTickets({
      projectId: "layerfs-moniter",
      drafts: [{ ...draft, title: "no" }],
      source: "human",
      existing: [],
      now: "2026-11-01T00:00:00.000Z",
      newId: () => "tkt_bad",
    });
    expect(outcome.ok).toBe(false);
  });
});
