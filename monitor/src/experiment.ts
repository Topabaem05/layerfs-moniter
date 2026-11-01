/**
 * Per-branch experiment record.
 *
 * An improvement branch is one subsystem plus the published commit it starts
 * from (`areaId:sha`). The record is the hypothesis, methodology, run, results
 * and conclusion for that branch. Edits append to `log`; the Agent Ledger
 * renders that log. Handoff items and the Falsify ticket copy the same fields.
 */
import type { TicketDraftInput } from "./falsify/create.js";
import type { HandoffItem, HistoryArea, HistoryCommit, LedgerEntry } from "./model.js";

export const EXPERIMENT_FIELDS = [
  ["hypothesis", "Hypothesis"],
  ["approach", "Approach"],
  ["setup", "Setup"],
  ["parameters", "Parameters"],
  ["runs", "What was run"],
  ["results", "Results"],
  ["conclusion", "Conclusion"],
] as const;

export type ExperimentField = (typeof EXPERIMENT_FIELDS)[number][0];

export interface ExperimentDraft {
  branchId: string;
  areaId: string;
  areaLabel: string;
  commitSha: string;
  commitShort: string;
  subject: string;
  hypothesis: string;
  approach: string;
  setup: string;
  parameters: string;
  runs: string;
  results: string;
  conclusion: string;
}

export interface ExperimentLogEntry {
  id: string;
  field: ExperimentField;
  label: string;
  before: string;
  after: string;
  at: string;
}

export interface ExperimentRecord extends ExperimentDraft {
  createdAt: string;
  updatedAt: string;
  log: ExperimentLogEntry[];
}

const LIMITS: Record<ExperimentField, number> = {
  hypothesis: 1200,
  approach: 2000,
  setup: 2000,
  parameters: 2000,
  runs: 2000,
  results: 2000,
  conclusion: 2000,
};

export function branchId(areaId: string, sha: string): string {
  return `${areaId}:${sha}`;
}

export function seedExperiment(area: HistoryArea, commit: HistoryCommit): ExperimentDraft {
  const subject = commit.subject.replace(/\s+/g, " ").trim();
  return {
    branchId: branchId(area.id, commit.sha),
    areaId: area.id,
    areaLabel: area.label,
    commitSha: commit.sha,
    commitShort: commit.short,
    subject,
    hypothesis: `A branch cut from ${commit.short} (${subject}) can improve ${area.blurb} while main stays on the published history.`,
    approach: "",
    setup: "",
    parameters: "",
    runs: "",
    results: "",
    conclusion: "",
  };
}

export function draftOf(record: ExperimentRecord): ExperimentDraft {
  return {
    branchId: record.branchId,
    areaId: record.areaId,
    areaLabel: record.areaLabel,
    commitSha: record.commitSha,
    commitShort: record.commitShort,
    subject: record.subject,
    hypothesis: record.hypothesis,
    approach: record.approach,
    setup: record.setup,
    parameters: record.parameters,
    runs: record.runs,
    results: record.results,
    conclusion: record.conclusion,
  };
}

function fieldValue(draft: ExperimentDraft, field: ExperimentField): string {
  return draft[field].trim().slice(0, LIMITS[field]);
}

/** Applies an edit. Unchanged fields do not add a log row. */
export function recordExperiment(
  previous: ExperimentRecord | undefined,
  draft: ExperimentDraft,
  now: string,
  newId: () => string,
): ExperimentRecord {
  const log = [...(previous?.log ?? [])];
  const next = { ...draft };
  for (const [field, label] of EXPERIMENT_FIELDS) {
    const after = fieldValue(draft, field);
    next[field] = after;
    const before = previous?.[field] ?? "";
    if (before === after) continue;
    log.push({ id: newId(), field, label, before, after, at: now });
  }
  return {
    ...next,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    log,
  };
}

export function ledgerFromRecord(record: ExperimentRecord): LedgerEntry[] {
  return record.log.map((entry) => ({
    id: entry.id,
    action: entry.before === "" ? `Recorded ${entry.label.toLowerCase()}` : `Updated ${entry.label.toLowerCase()}`,
    target: `${record.areaLabel} · ${record.commitShort}`,
    system: "Experiment",
    at: Date.parse(entry.at),
    change: [entry.before === "" ? "empty" : entry.before, entry.after === "" ? "cleared" : entry.after],
    reversible: false,
    dependsOn: [`base-${record.commitShort}`],
  }));
}

const HANDOFF_KIND: Record<ExperimentField, NonNullable<HandoffItem["kind"]>> = {
  hypothesis: "fact",
  approach: "note",
  setup: "note",
  parameters: "note",
  runs: "note",
  results: "fact",
  conclusion: "decision",
};

/** Fields that were written travel with the handoff. Empty ones are marked lost. */
export function experimentHandoffItems(draft: ExperimentDraft): HandoffItem[] {
  return EXPERIMENT_FIELDS.map(([field, label]) => {
    const value = draft[field].trim();
    if (value === "") {
      return {
        id: `exp-${field}`,
        label: label,
        kind: HANDOFF_KIND[field],
        lost: true,
        why: "Not recorded on this branch yet.",
      };
    }
    const clipped = value.length > 180 ? `${value.slice(0, 177)}...` : value;
    return { id: `exp-${field}`, label: `${label}: ${clipped}`, kind: HANDOFF_KIND[field] };
  });
}

function methodologyBlock(draft: ExperimentDraft): string {
  const lines = [
    draft.approach.trim() && `Approach: ${draft.approach.trim()}`,
    draft.setup.trim() && `Setup: ${draft.setup.trim()}`,
    draft.parameters.trim() && `Parameters: ${draft.parameters.trim()}`,
    draft.runs.trim() && `Ran: ${draft.runs.trim()}`,
    draft.results.trim() && `Results: ${draft.results.trim()}`,
    draft.conclusion.trim() && `Conclusion: ${draft.conclusion.trim()}`,
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

/** Copies the experiment into the Falsify draft. Hypothesis wins when it is long enough. */
export function applyExperiment(draft: TicketDraftInput, experiment: ExperimentDraft): TicketDraftInput {
  const hypothesis = experiment.hypothesis.trim();
  const block = methodologyBlock(experiment);
  const instruction =
    block === "" || draft.instruction.includes(block.slice(0, Math.min(40, block.length)))
      ? draft.instruction
      : `${draft.instruction}\n\n${block}`;
  const rationaleParts = [
    draft.rationale,
    experiment.results.trim() && `Results: ${experiment.results.trim()}`,
    experiment.conclusion.trim() && `Conclusion: ${experiment.conclusion.trim()}`,
  ].filter((part): part is string => Boolean(part));
  return {
    ...draft,
    hypothesis: hypothesis.length >= 10 ? hypothesis.slice(0, 1200) : draft.hypothesis,
    instruction: instruction.slice(0, 2000),
    rationale: rationaleParts.join("\n").slice(0, 2000),
  };
}

export function isExperimentDraft(value: unknown): value is ExperimentDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as ExperimentDraft;
  if (typeof draft.branchId !== "string" || typeof draft.areaId !== "string") return false;
  if (typeof draft.commitSha !== "string" || draft.branchId !== branchId(draft.areaId, draft.commitSha)) return false;
  if (typeof draft.areaLabel !== "string" || typeof draft.commitShort !== "string" || typeof draft.subject !== "string") {
    return false;
  }
  return EXPERIMENT_FIELDS.every(([field]) => typeof draft[field] === "string" && draft[field].length <= LIMITS[field]);
}
