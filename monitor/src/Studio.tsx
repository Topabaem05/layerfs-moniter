import { useEffect, useState } from "react";

import { AgentHandoff } from "./components/agent-handoff.js";
import { AgentLedger } from "./components/agent-ledger.js";
import { AgentTree } from "./components/agent-tree.js";
import { DecisionTree, type DecisionChoice } from "./components/decision-tree.js";
import { ExperimentPanel } from "./components/experiment-panel.js";
import {
  applyExperiment,
  branchId,
  draftOf,
  experimentHandoffItems,
  ledgerFromRecord,
  seedExperiment,
  type ExperimentDraft,
} from "./experiment.js";
import { explainRankScore } from "./falsify/ranking.js";
import type { TicketDraftInput } from "./falsify/create.js";
import { baseDecision, commitFromLabel, draftFromBranch, handDecision } from "./followups.js";
import type { Decision, Handoff, HandoffAgent, HandoffItem, HandoffTask, HistoryArea, HistoryCommit, LedgerEntry } from "./model.js";
import { useStudio } from "./useStudio.js";

export function Studio() {
  const { payload, error, create, cancel, saveExperiment } = useStudio();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [area, setArea] = useState<HistoryArea | null>(null);
  const [commit, setCommit] = useState<HistoryCommit | null>(null);
  const [extraLedger, setExtraLedger] = useState<LedgerEntry[]>([]);
  const [undone, setUndone] = useState<string[]>([]);
  const [tasks, setTasks] = useState<HandoffTask[] | null>(null);
  const [handoffs, setHandoffs] = useState<Handoff[] | null>(null);
  const [restored, setRestored] = useState<string[]>([]);
  const [draft, setDraft] = useState<TicketDraftInput | null>(null);
  const [experiment, setExperiment] = useState<ExperimentDraft | null>(null);
  const [experimentBranch, setExperimentBranch] = useState<string | null>(null);
  const [experimentMessage, setExperimentMessage] = useState<string | null>(null);
  const [savingExperiment, setSavingExperiment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!payload || decisions !== null) return;
    setDecisions(payload.decisions);
    setTasks(payload.tasks);
    setHandoffs(payload.handoffs);
  }, [payload, decisions]);

  useEffect(() => {
    if (draft) document.getElementById("ticket-desk")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [draft]);

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
    setTasks((current) =>
      current?.map((task) => (task.id === "cut" ? { ...task, note: `Cutting from ${next.label}` } : task)) ?? current,
    );
    setHandoffs((current) => {
      const id = `pick-${next.id}`;
      if ((current ?? []).some((handoff) => handoff.id === id)) return current;
      return [
        ...(current ?? []),
        {
          id,
          from: "scout",
          to: "cutter",
          task: "Survey main",
          items: [
            { id: "picked", label: next.label, kind: "decision" },
            { id: "why", label: next.blurb, kind: "fact" },
          ],
        },
      ];
    });
  }

  function carriedExperiment(nextArea: HistoryArea, nextCommit: HistoryCommit): ExperimentDraft {
    const id = branchId(nextArea.id, nextCommit.sha);
    if (experiment && experiment.branchId === id) return experiment;
    return seedExperiment(nextArea, nextCommit);
  }

  function handoffWithExperiment(items: HandoffItem[], record: ExperimentDraft): HandoffItem[] {
    return [...items.filter((item) => !item.id.startsWith("exp-")), ...experimentHandoffItems(record)];
  }

  function openDesk(nextArea: HistoryArea, nextCommit: HistoryCommit, instruction?: string) {
    const record = carriedExperiment(nextArea, nextCommit);
    const base = draftFromBranch(nextArea, nextCommit, instruction);
    setDraft(applyExperiment(base, record));
    setHandoffs((current) => {
      const id = `file-${nextCommit.short}`;
      const items = handoffWithExperiment(
        [
          { id: "base", label: `${nextCommit.short} · ${nextCommit.subject}`, kind: "decision" },
          ...nextCommit.files.slice(0, 3).map((file, index) => ({
            id: `path-${index}`,
            label: file,
            kind: "file" as const,
          })),
          ...(nextCommit.files.length > 3
            ? [
                {
                  id: "lost-paths",
                  label: `${nextCommit.files.length - 3} more paths`,
                  kind: "note" as const,
                  lost: true,
                  why: "The ticket keeps the commit id. The rest of the patch stays in git.",
                },
              ]
            : []),
        ],
        record,
      );
      const existing = current ?? [];
      if (existing.some((handoff) => handoff.id === id)) {
        return existing.map((handoff) => (handoff.id === id ? { ...handoff, items } : handoff));
      }
      return [
        ...existing,
        {
          id,
          from: "cutter",
          to: "desk",
          task: "File the branch as a ticket",
          items,
        },
      ];
    });
    setTasks((current) =>
      current?.map((task) =>
        task.id === "file" ? { ...task, agent: "desk", status: "working", note: "Review and file" } : task,
      ) ?? current,
    );
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
        setTasks((current) =>
          current?.map((task) => (task.id === "cut" ? { ...task, status: "done", note: "Held locally" } : task)) ?? current,
        );
        return "Held with the branch cutter. No ticket was filed.";
      }
      setDecisions([]);
      openDesk(area, commit);
      return "Approved, running. Review the ticket, then file it.";
    }
    return undefined;
  }

  function onAssign(task: HandoffTask, agent: HandoffAgent) {
    if (agent.id === "desk") {
      if (!area || !commit) {
        setReceipt("Choose a base commit in the decision tree before handing it to the ticket desk.");
        return;
      }
      openDesk(area, commit);
      return;
    }
    setTasks((current) =>
      current?.map((item) => (item.id === task.id ? { ...item, agent: agent.id, status: "working" } : item)) ?? current,
    );
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
      setHandoffs((current) =>
        (current ?? []).map((handoff) =>
          handoff.id === `file-${saved.commitShort}`
            ? { ...handoff, items: handoffWithExperiment(handoff.items, next) }
            : handoff,
        ),
      );
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

  async function fileTicket() {
    if (!draft || !commit || !area) return;
    setSaving(true);
    setFormError(null);
    try {
      const record =
        experiment && experiment.branchId === branchId(area.id, commit.sha) ? experiment : seedExperiment(area, commit);
      const saved = await saveExperiment(record);
      const filed = applyExperiment({ ...draftFromBranch(area, commit), title: draft.title }, draftOf(saved));
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
        dependsOn: [`base-${commit.short}`],
      });
      setTasks((current) =>
        current?.map((task) => (task.id === "file" ? { ...task, status: "done", note: ticket.id } : task)) ?? current,
      );
      setDraft(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Ticket was not created.");
    } finally {
      setSaving(false);
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
  const visibleHandoffs = (handoffs ?? []).map((handoff) => ({
    ...handoff,
    items: handoff.items.map((item) =>
      restored.includes(`${handoff.id}:${item.id}`) ? { ...item, lost: false, why: undefined } : item,
    ),
  }));

  return (
    <main className="studio">
      <header className="studio-top">
        <div>
          <p className="eyebrow">LayerFS monitor</p>
          <h1>Better improvement branches</h1>
          <p className="lede">
            Each branch is a candidate improvement cut from published history. The tree asks which layer to carry, the
            ledger records the attempt, and the handoff passes a chosen branch to the ticket desk.
          </p>
          {payload ? (
            <p className="studio-ref">
              {payload.refName} @ {payload.head.short} — {payload.head.subject}
            </p>
          ) : null}
        </div>
        <button type="button" className="theme" onClick={() => setTheme((value) => (value === "light" ? "dark" : "light"))}>
          {theme === "light" ? "Dark" : "Light"}
        </button>
      </header>

      {error ? <p role="alert" className="studio-error">{error}</p> : null}
      {!payload && !error ? <p className="studio-wait">Reading the checkout’s git history…</p> : null}

      {payload && decisions && tasks && handoffs ? (
        <>
          <h2 className="studio-label" id="agent-tree-label">
            Agent Tree
          </h2>
          <AgentTree
            root={payload.tree}
            formatCost={(amount) => `${amount} commit${amount === 1 ? "" : "s"}`}
            onSelect={(agent) => {
              const next = payload.areas.find((item) => item.id === agent.id);
              if (next) rememberArea(next);
            }}
            onResolve={(agent, action) => {
              if (action !== "approve") return;
              const next = payload.areas.find((item) => item.id === agent.id);
              if (next) rememberArea(next);
            }}
          />
          <h2 className="studio-label" id="decision-tree-label">
            Decision Tree
          </h2>
          <DecisionTree decisions={decisions} onChoose={onChoose} title="Decisions" />
          <ExperimentPanel
            draft={experiment}
            saved={payload.experiments.find((record) => record.branchId === experiment?.branchId)}
            saving={savingExperiment}
            message={experimentMessage}
            onChange={setExperiment}
            onSave={() => void saveCurrentExperiment()}
          />
          <h2 className="studio-label" id="agent-handoff-label">
            Agent Handoff
          </h2>
          <AgentHandoff
            agents={payload.agents}
            tasks={tasks}
            handoffs={visibleHandoffs}
            onAssign={onAssign}
            onRestore={(handoff, item) => setRestored((current) => [...current, `${handoff.id}:${item.id}`])}
          />
          <h2 className="studio-label" id="agent-ledger-label">
            Agent Ledger
          </h2>
          <AgentLedger
            entries={ledger}
            agent="Branch studio"
            undone={undone}
            onUndo={(ids) => setUndone((current) => [...new Set([...current, ...ids])])}
            onRedo={(ids) => setUndone((current) => current.filter((id) => !ids.includes(id)))}
          />
          <section id="ticket-desk" className="ticket-desk" data-testid="ticket-desk">
            <header>
              <h2>Ticket desk</h2>
              <p>Filed with the Falsify ticket machine: DRAFT, then QUEUED, then ELIGIBLE. Rank is computed in that domain.</p>
            </header>
            {receipt ? <p className="ticket-receipt" aria-live="polite">{receipt}</p> : null}
            {draft ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void fileTicket();
                }}
              >
                <label>
                  Title
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </label>
                <label>
                  Hypothesis
                  <textarea
                    rows={3}
                    value={draft.hypothesis}
                    onChange={(event) => setDraft({ ...draft, hypothesis: event.target.value })}
                  />
                </label>
                <label>
                  Instruction
                  <textarea
                    rows={3}
                    value={draft.instruction}
                    onChange={(event) => setDraft({ ...draft, instruction: event.target.value })}
                  />
                </label>
                <p className="ticket-meta">
                  {draft.type} · parent {draft.parent_policy} · priority {draft.priority ?? 0} · source human
                </p>
                {formError ? <p role="alert">{formError}</p> : null}
                <button type="submit" data-testid="create-ticket" disabled={saving}>
                  {saving ? "Filing…" : "Create ticket"}
                </button>
              </form>
            ) : (
              <p className="ticket-empty">Choose a branch in the decision tree, or hand the waiting task to the ticket desk.</p>
            )}
            <ul className="ticket-list" aria-label="Filed tickets">
              {[...payload.tickets].reverse().map((ticket) => {
                const terms = explainRankScore(ticket.rankFactors, {
                  pinned: ticket.pinned,
                  priority: ticket.priority,
                });
                return (
                  <li key={ticket.id} data-testid={`ticket-${ticket.id}`}>
                    <header>
                      <strong>{ticket.title}</strong>
                      <span className={`ticket-status is-${ticket.status.toLowerCase()}`}>{ticket.status}</span>
                    </header>
                    <p>{ticket.hypothesis}</p>
                    <p className="ticket-instruction">{ticket.instruction}</p>
                    <p className="ticket-meta">
                      {ticket.id} · {ticket.type} · rank {ticket.rankScore.toFixed(3)} · version {ticket.version}
                    </p>
                    <p className="ticket-score">
                      {terms
                        .filter((term) => term.contribution !== 0)
                        .map((term) => `${term.term} ${term.contribution.toFixed(2)}`)
                        .join(" · ")}
                    </p>
                    {ticket.status !== "CANCELLED" && ticket.status !== "COMPLETED" ? (
                      <button type="button" onClick={() => void cancelTicket(ticket.id)}>
                        Cancel ticket
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {cancelError ? <p role="alert">{cancelError}</p> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
