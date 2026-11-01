/**
 * Studio HTTP API. History comes from git. Tickets are created by the vendored
 * Falsify kernel and stored in monitor/.data, which is local to this checkout.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { buildTickets, type CreateTicketsInput, type TicketDraftInput } from "../falsify/create.js";
import { explainRankScore, rankTickets } from "../falsify/ranking.js";
import { transitionTicket } from "../falsify/ticket-machine.js";
import type { Ticket, TicketSource, TicketType } from "../falsify/types.js";
import { isExperimentDraft, recordExperiment, type ExperimentRecord } from "../experiment.js";
import { readStudio } from "./history.js";

interface Store {
  revision: number;
  tickets: Ticket[];
}

interface ExperimentStore {
  records: ExperimentRecord[];
}

const TYPES = new Set<TicketType>([
  "experiment",
  "ablation",
  "literature",
  "analysis",
  "reproduction",
  "verification",
]);

const SOURCES = new Set<TicketSource>(["human", "agent", "system", "literature"]);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function loadStore(file: string): Store {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Store;
    if (!parsed || !Array.isArray(parsed.tickets)) return { revision: 0, tickets: [] };
    return { revision: parsed.revision ?? 0, tickets: parsed.tickets };
  } catch {
    return { revision: 0, tickets: [] };
  }
}

function saveJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

function saveStore(file: string, store: Store) {
  saveJson(file, store);
}

function loadExperiments(file: string): ExperimentRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ExperimentStore;
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

function asDraft(value: unknown): TicketDraftInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const draft = value as TicketDraftInput;
  if (typeof draft.title !== "string" || typeof draft.hypothesis !== "string") return undefined;
  if (typeof draft.instruction !== "string" || !TYPES.has(draft.type)) return undefined;
  return draft;
}

function asInput(value: unknown): CreateTicketsInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as CreateTicketsInput;
  if (typeof body.project_id !== "string" || !Array.isArray(body.tickets)) return undefined;
  const tickets = body.tickets.map(asDraft);
  if (tickets.some((draft) => draft === undefined)) return undefined;
  return {
    project_id: body.project_id,
    tickets: tickets as TicketDraftInput[],
    source: body.source,
  };
}

export function createApi(options: { repoRoot: string; dataDir: string }) {
  const file = path.join(options.dataDir, "tickets.json");
  const experimentFile = path.join(options.dataDir, "experiments.json");
  const projectId = "layerfs-moniter";

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://studio.local");
    if (!url.pathname.startsWith("/api/")) return false;

    if (req.method === "GET" && url.pathname === "/api/studio") {
      const studio = readStudio(options.repoRoot);
      const store = loadStore(file);
      send(res, 200, {
        ...studio,
        tickets: store.tickets,
        revision: store.revision,
        experiments: loadExperiments(experimentFile),
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/experiments") {
      const raw = await readBody(req);
      let parsed: unknown;
      try {
        parsed = raw.trim() === "" ? {} : JSON.parse(raw);
      } catch {
        send(res, 400, { ok: false, message: "Request body must be JSON." });
        return true;
      }
      if (!isExperimentDraft(parsed)) {
        send(res, 400, { ok: false, message: "Experiment fields are missing or too long." });
        return true;
      }
      const records = loadExperiments(experimentFile);
      const previous = records.find((record) => record.branchId === parsed.branchId);
      let sequence = records.reduce((sum, record) => sum + record.log.length, 0);
      const next = recordExperiment(previous, parsed, new Date().toISOString(), () => {
        sequence += 1;
        return `exp_${randomBytes(3).toString("hex")}_${sequence}`;
      });
      const stored = previous
        ? records.map((record) => (record.branchId === next.branchId ? next : record))
        : [...records, next];
      saveJson(experimentFile, { records: stored });
      send(res, 200, { ok: true, experiment: next });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/tickets") {
      const raw = await readBody(req);
      let parsed: unknown;
      try {
        parsed = raw.trim() === "" ? {} : JSON.parse(raw);
      } catch {
        send(res, 400, { ok: false, message: "Request body must be JSON." });
        return true;
      }
      const input = asInput(parsed);
      if (!input) {
        send(res, 400, { ok: false, message: "Expected project_id and a tickets array." });
        return true;
      }
      if (input.project_id !== projectId) {
        send(res, 400, { ok: false, message: `project_id must be ${projectId}.` });
        return true;
      }
      const source = input.source ?? "human";
      if (!SOURCES.has(source)) {
        send(res, 400, { ok: false, message: "source must be human, agent, system or literature." });
        return true;
      }
      const store = loadStore(file);
      const outcome = buildTickets({
        projectId,
        drafts: input.tickets,
        source,
        existing: store.tickets,
        now: new Date().toISOString(),
        newId: () => `tkt_${randomBytes(6).toString("hex")}`,
      });
      if (!outcome.ok) {
        const message = outcome.kind === "domain" ? outcome.error.message : outcome.message;
        send(res, 400, { ok: false, message });
        return true;
      }
      const tickets = [...store.tickets, ...outcome.tickets];
      const ranked = rankTickets(tickets);
      if (!ranked.ok) {
        send(res, 400, { ok: false, message: ranked.error.message });
        return true;
      }
      const next: Store = { revision: store.revision + 1, tickets: ranked.value.map((entry) => entry.ticket) };
      saveStore(file, next);
      send(res, 201, {
        ok: true,
        revision: next.revision,
        tickets: outcome.tickets,
        queueTop: ranked.value
          .filter((entry) => entry.ticket.status === "ELIGIBLE" || entry.ticket.status === "QUEUED")
          .slice(0, 5)
          .map((entry) => ({
            id: entry.ticket.id,
            title: entry.ticket.title,
            status: entry.ticket.status,
            rankScore: entry.rankScore,
            rank: entry.rank,
          })),
        explanations: outcome.tickets.map((ticket) => ({
          id: ticket.id,
          terms: explainRankScore(ticket.rankFactors, { pinned: ticket.pinned, priority: ticket.priority }),
        })),
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/tickets/cancel") {
      const raw = await readBody(req);
      let body: { ticket_id?: string; reason?: string };
      try {
        body = JSON.parse(raw) as { ticket_id?: string; reason?: string };
      } catch {
        send(res, 400, { ok: false, message: "Request body must be JSON." });
        return true;
      }
      const store = loadStore(file);
      const current = store.tickets.find((ticket) => ticket.id === body.ticket_id);
      if (!current) {
        send(res, 404, { ok: false, message: `No ticket ${body.ticket_id ?? ""}.` });
        return true;
      }
      const cancelled = transitionTicket(current, {
        kind: "cancel",
        at: new Date().toISOString(),
        reason: body.reason,
      });
      if (!cancelled.ok) {
        send(res, 409, { ok: false, message: cancelled.error.message, remediation: cancelled.error.remediation });
        return true;
      }
      const tickets = store.tickets.map((ticket) => (ticket.id === cancelled.value.id ? cancelled.value : ticket));
      const next = { revision: store.revision + 1, tickets };
      saveStore(file, next);
      send(res, 200, { ok: true, revision: next.revision, ticket: cancelled.value });
      return true;
    }

    send(res, 404, { ok: false, message: `No route ${req.method ?? ""} ${url.pathname}.` });
    return true;
  };
}
