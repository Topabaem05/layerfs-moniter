import { useCallback, useEffect, useState } from "react";

import type { ExperimentDraft, ExperimentRecord } from "./experiment.js";
import type { CreateTicketsInput } from "./falsify/create.js";
import type { Ticket } from "./falsify/types.js";
import type { StudioSnapshot } from "./model.js";

export interface BoardSlot {
  cardId: string;
  cell: number;
  agentId: string;
  percent: number;
}

export interface BoardState {
  assignments: { ticketId: string; agentId: string }[];
  slots: BoardSlot[];
}

export interface StudioPayload extends StudioSnapshot {
  tickets: Ticket[];
  revision: number;
  experiments: ExperimentRecord[];
  board: BoardState;
}

export interface TicketReceipt {
  ok: true;
  revision: number;
  tickets: Ticket[];
  queueTop: { id: string; title: string; status: string; rankScore: number; rank: number }[];
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export function useStudio() {
  const [payload, setPayload] = useState<StudioPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/studio");
    if (!response.ok) throw new Error(await readError(response));
    setPayload((await response.json()) as StudioPayload);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not read the studio.");
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function create(input: CreateTicketsInput, options?: { holdDraft?: boolean }): Promise<TicketReceipt> {
    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, hold_draft: options?.holdDraft === true }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const receipt = (await response.json()) as TicketReceipt;
    await load();
    return receipt;
  }

  async function saveExperiment(draft: ExperimentDraft): Promise<ExperimentRecord> {
    const response = await fetch("/api/experiments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { experiment: ExperimentRecord };
    await load();
    return body.experiment;
  }

  async function claim(ticketId: string, actor: string): Promise<void> {
    const response = await fetch("/api/tickets/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, actor }),
    });
    if (!response.ok) throw new Error(await readError(response));
    await load();
  }

  async function saveBoard(board: BoardState): Promise<void> {
    const response = await fetch("/api/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(board),
    });
    if (!response.ok) throw new Error(await readError(response));
    await load();
  }

  async function cancel(ticketId: string): Promise<void> {
    const response = await fetch("/api/tickets/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticket_id: ticketId,
        reason: "Operator cancelled the improvement ticket.",
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
    await load();
  }

  return { payload, error, create, cancel, claim, saveBoard, saveExperiment };
}
