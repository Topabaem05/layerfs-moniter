import { useEffect, useState } from "react";

import type { DecisionChoice } from "./components/decision-tree.js";
import { HomeScreen } from "./home-screen.js";
import {
  applyExperiment,
  branchId,
  draftOf,
  ledgerFromRecord,
  seedExperiment,
  type ExperimentDraft,
} from "./experiment.js";
import type { TicketDraftInput } from "./falsify/create.js";
import { baseDecision, commitFromLabel, draftFromBranch, handDecision } from "./followups.js";
import type { Decision, HistoryArea, HistoryCommit, LedgerEntry } from "./model.js";
import { useStudio } from "./useStudio.js";

export function Studio() {
  const { payload, error, create, cancel, claim, saveBoard, saveExperiment } = useStudio();
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [area, setArea] = useState<HistoryArea | null>(null);
  const [commit, setCommit] = useState<HistoryCommit | null>(null);
  const [extraLedger, setExtraLedger] = useState<LedgerEntry[]>([]);
  const [undone, setUndone] = useState<string[]>([]);
  const [draft, setDraft] = useState<TicketDraftInput | null>(null);
  const [experiment, setExperiment] = useState<ExperimentDraft | null>(null);
  const [experimentBranch, setExperimentBranch] = useState<string | null>(null);
  const [experimentMessage, setExperimentMessage] = useState<string | null>(null);
  const [savingExperiment, setSavingExperiment] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!payload || decisions !== null) return;
    setDecisions(payload.decisions);
  }, [payload, decisions]);

  useEffect(() => {
    if (!area || !commit) return;
    const id = branchId(area.id, commit.sha);
    if (experimentBranch === id) return;
    const saved = payload?.experiments.find((record) => record.branchId === id);
    setExperiment(saved ? draftOf(saved) : seedExperiment(area, commit));
    setExperimentBranch(id);
    setExperimentMessage(null);
  }, [area, commit, payload, experimentBranch]);

  function pushLedger(entry: LedgerEntry) {
    setExtraLedger((current) => [entry, ...current]);
  }

  function rememberArea(next: HistoryArea) {
    setArea(next);
    setDecisions([baseDecision(next)]);
    setExtraLedger((current) => {
      if (current.some((entry) => entry.id === `area-${next.id}`)) return current;
      return [
        {
          id: `area-${next.id}`,
          action: "Chose subsystem",
          target: next.label,
          system: "Branch cutter",
          at: Date.now(),
          change: ["undecided", next.label] as [string, string],
          reversible: true,
        },
        ...current,
      ];
    });
  }

  function carriedExperiment(nextArea: HistoryArea, nextCommit: HistoryCommit): ExperimentDraft {
    const id = branchId(nextArea.id, nextCommit.sha);
    if (experiment && experiment.branchId === id) return experiment;
    return seedExperiment(nextArea, nextCommit);
  }

  function openDesk(nextArea: HistoryArea, nextCommit: HistoryCommit, instruction?: string) {
    const record = carriedExperiment(nextArea, nextCommit);
    const base = draftFromBranch(nextArea, nextCommit, instruction);
    setDraft(applyExperiment(base, record));
    setOpenId(nextCommit.sha);
  }

  async function onChoose(decision: Decision, choice: DecisionChoice) {
    if (!payload) return;
    if ("other" in choice) {
      const chosenArea = area ?? payload.areas[0];
      const chosenCommit = commit ?? chosenArea?.commits[0];
      if (!chosenArea || !chosenCommit) return "There is no published commit to attach that instruction to.";
      setArea(chosenArea);
      setCommit(chosenCommit);
      openDesk(chosenArea, chosenCommit, choice.other);
      return "The ticket desk will file that instruction. The rank score still comes from the Falsify domain.";
    }
    if (decision.id === "subsystem") {
      if (choice.option.label === "Stay on main") {
        setDecisions([]);
        pushLedger({
          id: `stay-${payload.head.short}`,
          action: "Stayed on main",
          target: payload.head.short,
          system: "Branch cutter",
          at: Date.now(),
          change: ["new branch", payload.head.short],
          reversible: true,
        });
        return "No branch was cut.";
      }
      const next = payload.areas.find((item) => choice.option.label === `Branch from ${item.label}`);
      if (!next) return;
      rememberArea(next);
      return `The ${next.label} scout laid out ${Math.min(3, next.commits.length)} published changes.`;
    }
    if (decision.id.startsWith("base-") && area) {
      const fresh = choice.option.label.startsWith("Start a fresh");
      const next: HistoryCommit | undefined = fresh
        ? {
            sha: payload.head.sha,
            short: payload.head.short,
            subject: payload.head.subject,
            at: Date.now(),
            files: [],
            area: area.id,
          }
        : commitFromLabel(area, choice.option.label);
      if (!next) return;
      setCommit(next);
      setDecisions([handDecision(area, next)]);
      pushLedger({
        id: `base-${next.short}`,
        action: "Chose branch base",
        target: next.subject,
        system: area.label,
        at: Date.now(),
        change: [payload.head.short, next.short],
        detail: next.files.slice(0, 3).join(", "),
        reversible: true,
        dependsOn: [`area-${area.id}`],
      });
      return `Base is ${next.short}. Hand it to the ticket desk, or keep it here.`;
    }
    if (decision.id.startsWith("hand-") && area && commit) {
      if (choice.option.label.startsWith("Keep")) {
        setDecisions([]);
        pushLedger({
          id: `keep-${commit.short}`,
          action: "Kept with the branch cutter",
          target: commit.subject,
          system: "Branch cutter",
          at: Date.now(),
          reversible: true,
          dependsOn: [`base-${commit.short}`],
        });
        return "Held with the branch cutter. No ticket was filed.";
      }
      setDecisions([]);
      const record = carriedExperiment(area, commit);
      const nextDraft = applyExperiment(draftFromBranch(area, commit), record);
      setDraft(nextDraft);
      setOpenId(commit.sha);
      void fileTicket(area, commit, nextDraft);
      return "Approved, running. The Falsify ticket is being filed.";
    }
    return undefined;
  }

  async function saveCurrentExperiment() {
    if (!experiment) return null;
    setSavingExperiment(true);
    setExperimentMessage(null);
    try {
      const saved = await saveExperiment(experiment);
      const next = draftOf(saved);
      setExperiment(next);
      setExperimentBranch(saved.branchId);
      setExperimentMessage(`Saved ${saved.log.length} log ${saved.log.length === 1 ? "row" : "rows"} for ${saved.commitShort}.`);
      if (draft && area && commit && branchId(area.id, commit.sha) === saved.branchId) {
        setDraft(applyExperiment({ ...draftFromBranch(area, commit), title: draft.title }, next));
      }
      return saved;
    } catch (cause) {
      setExperimentMessage(cause instanceof Error ? cause.message : "Experiment was not saved.");
      return null;
    } finally {
      setSavingExperiment(false);
    }
  }

  async function fileTicket(nextArea = area, nextCommit = commit, nextDraft = draft) {
    if (!nextDraft || !nextCommit || !nextArea) return;
    try {
      const record =
        experiment && experiment.branchId === branchId(nextArea.id, nextCommit.sha)
          ? experiment
          : seedExperiment(nextArea, nextCommit);
      const saved = await saveExperiment(record);
      const filed = applyExperiment({ ...draftFromBranch(nextArea, nextCommit), title: nextDraft.title }, draftOf(saved));
      setExperiment(draftOf(saved));
      setExperimentBranch(saved.branchId);
      const result = await create({ project_id: "layerfs-moniter", source: "human", tickets: [filed] });
      const ticket = result.tickets[0];
      if (!ticket) return;
      const queued = result.queueTop.find((item) => item.id === ticket.id);
      setReceipt(
        `${ticket.id} is ${ticket.status}${queued ? `, rank ${queued.rankScore.toFixed(3)}, queue #${queued.rank}` : ""}.`,
      );
      pushLedger({
        id: `filed-${ticket.id}`,
        action: "Filed ticket",
        target: ticket.title,
        system: "Falsify",
        at: Date.now(),
        change: ["no ticket", `${ticket.status} · ${ticket.id}`],
        detail: ticket.hypothesis,
        reversible: false,
        dependsOn: [`base-${nextCommit.short}`],
      });
      setDraft(null);
    } catch (cause) {
      setExperimentMessage(cause instanceof Error ? cause.message : "Ticket was not created.");
    }
  }

  async function cancelTicket(id: string) {
    setCancelError(null);
    try {
      await cancel(id);
    } catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : "Cancel was rejected.");
    }
  }

  const ledger = [
    ...(payload?.experiments ?? []).flatMap(ledgerFromRecord),
    ...extraLedger,
    ...(payload?.ledger ?? []),
  ];
  async function createDraft(note: string, areaId: string) {
    const chosen = payload?.areas.find((item) => item.id === areaId) ?? payload?.areas[0];
    if (!chosen) return;
    const base = chosen.commits[0];
    const hypothesis = note.length >= 10 ? note.slice(0, 1200) : `${note} for the ${chosen.label} branch.`;
    let title = `Improve ${chosen.label}: ${note}`;
    if (title.length > 120) title = `${title.slice(0, 117)}...`;
    await create(
      {
        project_id: "layerfs-moniter",
        source: "human",
        tickets: [
          {
            title,
            type: "experiment",
            hypothesis,
            instruction: `Start from ${base?.short ?? "HEAD"} in ${chosen.label}. ${note}`.slice(0, 2000),
            parent_policy: "incumbent",
            required_evidence: ["diff"],
            provenance_refs: base ? [base.sha] : [],
            decision_axis: chosen.id,
            priority: 4,
            pinned: false,
          },
        ],
      },
      { holdDraft: true },
    );
    setReceipt("Draft ticket filed from the composer.");
  }

  async function assignTask(taskId: string, agentId: string) {
    if (!payload) return;
    let ticketId = taskId.startsWith("ticket:") ? taskId.slice("ticket:".length) : "";
    if (taskId.startsWith("commit:")) {
      const sha = taskId.slice("commit:".length);
      const chosen = payload.areas.find((item) => item.commits.some((commit) => commit.sha === sha));
      const base = chosen?.commits.find((commit) => commit.sha === sha);
      if (!chosen || !base) return;
      const receipt = await create({
        project_id: "layerfs-moniter",
        source: "human",
        tickets: [draftFromBranch(chosen, base)],
      });
      ticketId = receipt.tickets[0]?.id ?? "";
    }
    if (!ticketId) return;
    try {
      await claim(ticketId, agentId);
    } catch {
      // A DRAFT ticket cannot be claimed until it is ELIGIBLE. The board still records the role.
    }
    const assignments = [
      ...(payload.board?.assignments ?? []).filter((item) => item.ticketId !== ticketId),
      { ticketId, agentId },
    ];
    await saveBoard({ assignments, slots: payload.board?.slots ?? [] });
  }

  function openBranch(id: string) {
    setOpenId(id);
    const chosen = payload?.areas.find((item) => item.id === id || item.commits.some((commit) => commit.sha === id));
    if (!chosen) return;
    setArea(chosen);
    const base = chosen.commits.find((commit) => commit.sha === id) ?? chosen.commits[0];
    if (base) setCommit(base);
  }

  const panelArea = payload?.areas.find((item) => item.id === openId || item.commits.some((commit) => commit.sha === openId));
  const panelCommit = panelArea?.commits.find((commit) => commit.sha === openId) ?? panelArea?.commits[0];
  const panelSaved = payload?.experiments.find((record) => record.commitSha === panelCommit?.sha);

  if (!payload || !decisions) {
    return (
      <main className="studio">
        {error ? <p role="alert">{error}</p> : <p>Reading the checkout’s git history…</p>}
      </main>
    );
  }

  return (
    <HomeScreen
      areas={payload.areas}
      experiments={payload.experiments}
      tickets={payload.tickets}
      board={payload.board ?? { assignments: [], slots: [] }}
      ledger={ledger}
      decisions={decisions}
      undone={undone}
      head={`${payload.refName} @ ${payload.head.short} — ${payload.head.subject}${receipt ? ` · ${receipt}` : ""}`}
      onChoose={onChoose}
      onUndo={(ids) => setUndone((current) => [...new Set([...current, ...ids])])}
      onRedo={(ids) => setUndone((current) => current.filter((id) => !ids.includes(id)))}
      onCreateDraft={createDraft}
      onAssign={assignTask}
      onBook={async (slots) => {
        await saveBoard({ assignments: payload.board?.assignments ?? [], slots });
      }}
      onOpenBranch={openBranch}
      panel={
        panelArea && panelCommit
          ? {
              title: `${panelArea.label} · ${panelCommit.short}`,
              body: panelCommit.subject,
              experiment:
                experiment && experiment.commitSha === panelCommit.sha
                  ? experiment
                  : panelSaved
                    ? draftOf(panelSaved)
                    : seedExperiment(panelArea, panelCommit),
              saved: panelSaved,
              saving: savingExperiment,
              message: experimentMessage ?? cancelError,
              onChange: setExperiment,
              onSave: () => void saveCurrentExperiment(),
              onCancel: () => {
                const ticket = payload?.tickets.find((item) => panelCommit && item.provenanceRefs.includes(panelCommit.sha));
                if (ticket) void cancelTicket(ticket.id);
              },
            }
          : null
      }
    />
  );
}
