/**
 * Later questions and the ticket draft. Both are derived from the commit the
 * operator just chose, so the tree stays attached to the checkout.
 */
import type { TicketDraftInput } from "./falsify/create.js";
import type { Decision, HistoryArea, HistoryCommit } from "./model.js";

const RISKY = /abort|dirty|unmount|conflict|custody|truncat/i;

export function baseDecision(area: HistoryArea): Decision {
  const commits = area.commits.slice(0, 3);
  const options = commits.map((commit, index) => ({
    label: `${commit.short} · ${commit.subject}`.slice(0, 96),
    pick: index === 0,
    effects: [
      `${commit.files.length} file${commit.files.length === 1 ? "" : "s"} on ${commit.short}`,
      RISKY.test(commit.subject)
        ? [
            "Published, so ",
            {
              text: "main already has this change",
              note: "The branch starts from it. It does not rewrite the published commit.",
              source: commit.short,
            },
          ]
        : `Published on main · ${commit.files[0] ?? area.label}`,
    ],
  }));
  if (options.length < 2) {
    options.push({
      label: "Start a fresh branch from HEAD",
      pick: false,
      effects: ["No earlier commit is reused as the theme", "The branch still opens against current main"],
    });
  }
  return {
    id: `base-${area.id}`,
    question: `Cut the ${area.label} branch from which published change?`,
    context: `${area.label} covers ${area.blurb}. The scout’s pick is the newest commit in that layer.`,
    agent: "Branch cutter",
    model: "decision",
    risk: area.risk,
    options,
  };
}

export function handDecision(area: HistoryArea, commit: HistoryCommit): Decision {
  return {
    id: `hand-${commit.short}`,
    question: `Hand “${commit.subject}” to the ticket desk?`,
    context: `The branch would start at ${commit.short} in ${area.label}. Filing uses the Falsify ticket machine. Nothing is merged.`,
    agent: "Branch cutter",
    model: "Falsify",
    risk: area.risk,
    options: [
      {
        label: "File a Falsify ticket",
        pick: true,
        effects: [
          "Enters DRAFT, then QUEUED, then ELIGIBLE when nothing blocks it",
          "Rank is computed in the Falsify domain, not typed in by the scout",
          [
            "Irreversible once filed · ",
            {
              text: "cancel is a new transition, not a silent delete",
              note: "COMPLETED and CANCELLED are terminal. A second cancel is rejected.",
              source: "ticket-machine",
            },
          ],
        ],
      },
      {
        label: "Keep it with the branch cutter",
        pick: false,
        effects: ["The choice stays in the ledger", "No ticket is filed"],
      },
    ],
  };
}

export function commitFromLabel(area: HistoryArea, label: string): HistoryCommit | undefined {
  return area.commits.find((commit) => label.startsWith(commit.short));
}

export function draftFromBranch(
  area: HistoryArea,
  commit: HistoryCommit,
  instruction?: string,
): TicketDraftInput {
  const subject = commit.subject.replace(/\s+/g, " ").trim();
  let title = `Improve ${area.label}: ${subject}`;
  if (title.length > 120) title = `${title.slice(0, 117)}...`;
  const files = commit.files.slice(0, 5);
  const fileLine = files.length > 0 ? files.join(", ") : "the committed paths";
  const hypothesis = `A branch cut from ${commit.short} (${subject}) can improve ${area.blurb} while main stays on the published history.`;
  const fallback = `Start the improvement branch at ${commit.short} and carry the ${area.label} change. Paths: ${fileLine}.`;
  const note = instruction?.trim() ?? "";
  return {
    title,
    type: area.id === "docs" || area.id === "tools" ? "analysis" : "experiment",
    hypothesis,
    instruction: note.length >= 10 ? note.slice(0, 2000) : fallback,
    parent_policy: "incumbent",
    required_evidence: ["diff"],
    rationale: "Chosen in the LayerFS improvement studio from the checkout's git history.",
    decision_axis: area.id.slice(0, 120),
    provenance_refs: [commit.sha],
    priority: area.risk === "high" ? 7 : area.risk === "medium" ? 5 : 3,
    pinned: false,
    rank_factors: {
      expected_gain: 0.72,
      information_gain: 0.64,
      uncertainty_reduction: 0.58,
      cost_efficiency: area.risk === "low" ? 0.8 : 0.45,
      novelty: 0.4,
      risk: area.risk === "high" ? 0.8 : area.risk === "medium" ? 0.45 : 0.2,
      duplicate_penalty: 0,
    },
  };
}
