import { useState } from "react";

import { AppShell } from "./components/app-shell.js";
import { AgentHandoff } from "./components/agent-handoff.js";
import { AgentLedger } from "./components/agent-ledger.js";
import { AgentQueue } from "./components/agent-queue.js";
import { AgentTree } from "./components/agent-tree.js";
import { DecisionTree, type DecisionChoice } from "./components/decision-tree.js";
import { DelegateBoard } from "./components/delegate-board.js";
import { ExperimentPanel } from "./components/experiment-panel.js";
import { ScheduledRuns } from "./components/scheduled-runs.js";
import type { ExperimentDraft, ExperimentRecord } from "./experiment.js";
import type { Decision, HistoryArea, LedgerEntry } from "./model.js";
import type { BoardState } from "./useStudio.js";
import { coverage, delegateView, handoffView, queueView, ROLES, runCards, treeView, weekDays } from "./view.js";
import type { Ticket } from "./falsify/types.js";

const TEMPLATES = [
  { id: "custody", label: "Unmount custody", text: "Record the stalled-unmount method and keep abort custody on the branch." },
  { id: "sdk", label: "SDK compatibility", text: "Keep the JavaScript SDK and daemon contract aligned on this branch." },
  { id: "docs", label: "Docs only", text: "Limit this branch to the contract records. Do not change the daemon." },
];

const CHIPS = [
  ["New hypothesis", "top"],
  ["Record experiment", "sec-runs"],
  ["Record methodology", "branch-panel"],
  ["Compare branches", "sec-tree"],
  ["Schedule run", "sec-runs"],
  ["Delegate ticket", "sec-delegate"],
] as const;

export function HomeScreen({
  areas,
  experiments,
  tickets,
  board,
  ledger,
  decisions,
  undone,
  head,
  onChoose,
  onUndo,
  onRedo,
  onCreateDraft,
  onAssign,
  onBook,
  onOpenBranch,
  panel,
}: {
  areas: HistoryArea[];
  experiments: ExperimentRecord[];
  tickets: Ticket[];
  board: BoardState;
  ledger: LedgerEntry[];
  decisions: Decision[];
  undone: string[];
  head: string;
  onChoose: (decision: Decision, choice: DecisionChoice) => Promise<string | void>;
  onUndo: (ids: string[]) => void;
  onRedo: (ids: string[]) => void;
  onCreateDraft: (text: string, areaId: string) => Promise<void>;
  onAssign: (taskId: string, agentId: string) => Promise<void>;
  onBook: (slots: BoardState["slots"]) => Promise<void>;
  onOpenBranch: (id: string) => void;
  panel: { title: string; body: string; experiment: ExperimentDraft | null; onChange: (draft: ExperimentDraft) => void; onSave: () => void; saving: boolean; saved?: ExperimentRecord; message: string | null; onCancel?: () => void } | null;
}) {
  const [text, setText] = useState("");
  const [scout, setScout] = useState(areas[0]?.id ?? "engine");
  const [plugins, setPlugins] = useState(false);
  const [notice, setNotice] = useState("");
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const handoff = handoffView(areas, experiments);
  const tree = treeView(areas, experiments, tickets);
  const queue = queueView(tickets, areas);
  const delegate = delegateView(areas, tickets, board);
  const cards = runCards(areas);
  const news = areas.flatMap((area) => area.commits.slice(0, 1).map((commit) => ({ title: commit.subject, kicker: "New on main" }))).slice(0, 2);

  function go(id: string) {
    if (id === "top") {
      document.querySelector(".ui-as-main")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <AppShell
      repo="layerfs-moniter"
      areas={areas.map((area) => ({ id: area.id, label: area.label }))}
      news={news}
      coverage={coverage(areas, experiments)}
      user="Topabaem05"
      onNavigate={go}
      onArea={(id) => {
        onOpenBranch(id);
        go("sec-tree");
      }}
      panel={
        panel ? (
          <div id="branch-panel">
            <h2>{panel.title}</h2>
            <p>{panel.body}</p>
            {panel.onCancel ? (
              <button type="button" className="ui-as-ghost" onClick={panel.onCancel}>
                Cancel ticket
              </button>
            ) : null}
            <ExperimentPanel draft={panel.experiment} saved={panel.saved} saving={panel.saving} message={panel.message} onChange={panel.onChange} onSave={panel.onSave} />
          </div>
        ) : null
      }
    >
      <button type="button" className="ui-as-invite" onClick={() => go("sec-delegate")}>
        Invite a scout
      </button>
      <section className="ui-as-start" data-phase="start">
        <h1 className="ui-as-start__title">{hello}! Which improvement branch is next?</h1>
        <div className="ui-as-start__composer">
          <form
            className="ui-as-composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim().length < 10) {
                setNotice("Write at least a sentence. That becomes the ticket hypothesis.");
                return;
              }
              void onCreateDraft(text.trim(), scout).then(() => {
                setNotice("Draft ticket filed.");
                setText("");
              });
            }}
          >
            <div className="ui-as-composer__card">
              <textarea
                className="ui-as-composer__field"
                placeholder="Describe the improvement branch to file…"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <div className="ui-as-composer__bar">
                <button type="button" className="ui-as-ghost" onClick={() => setPlugins((value) => !value)}>
                  Plugins
                </button>
                {plugins ? (
                  <div className="ui-as-menu" role="menu">
                    {TEMPLATES.map((template) => (
                      <button key={template.id} type="button" onClick={() => { setText(template.text); setPlugins(false); }}>
                        {template.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <span className="ui-as-composer__end">
                  <button type="button" className="ui-as-ghost ui-as-ghost--model" aria-haspopup="menu" onClick={() => {
                    const ids = areas.map((area) => area.id);
                    const index = ids.indexOf(scout);
                    setScout(ids[(index + 1) % Math.max(1, ids.length)] ?? scout);
                  }}>
                    {areas.find((area) => area.id === scout)?.label ?? "Auto"}
                  </button>
                  <button type="submit" className="ui-as-send" disabled={text.trim() === ""}>
                    Send
                  </button>
                </span>
              </div>
            </div>
          </form>
          <p className="ui-as-start__note">{notice || head}</p>
          <div className="ui-as-chips">
            {CHIPS.map(([label, target]) => (
              <button key={label} type="button" className="ui-as-chip" onClick={() => (target === "top" ? (document.querySelector(".ui-as-composer__field") as HTMLTextAreaElement | null)?.focus() : go(target))}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="ui-as-sections">
        <div className="ui-as-split">
          <section id="sec-delegate" className="ui-as-section">
            <h2>Delegate Board</h2>
            <DelegateBoard tasks={delegate.tasks} agents={delegate.agents} onAssign={(taskId, agentId) => void onAssign(taskId, agentId)} />
          </section>
          <section id="sec-queue" className="ui-as-section">
            <h2>Agent Queue</h2>
            <AgentQueue jobs={queue.jobs} workers={queue.workers} onOpen={(job) => onOpenBranch(job.id)} />
          </section>
        </div>
        <section id="sec-runs" className="ui-as-section">
          <h2>Scheduled Runs</h2>
          <ScheduledRuns
            cards={cards}
            slots={board.slots}
            days={weekDays()}
            agents={ROLES.map((role) => ({ id: role.id, name: role.name }))}
            onBook={(slots) => void onBook(slots)}
          />
        </section>
        <section id="sec-handoff" className="ui-as-section">
          <h2>Agent Handoff</h2>
          <AgentHandoff agents={handoff.agents} lanes={handoff.lanes} onOpen={(card) => onOpenBranch(card.id)} />
        </section>
        <div className="ui-as-split">
          <section id="sec-tree" className="ui-as-section">
            <h2>Agent Tree</h2>
            <AgentTree root={tree} onSelect={(node) => onOpenBranch(node.id)} />
          </section>
          <section id="sec-ledger" className="ui-as-section">
            <h2>Agent Ledger</h2>
            <AgentLedger entries={ledger} agent="Branch studio" undone={undone} onUndo={onUndo} onRedo={onRedo} />
          </section>
        </div>
        <section id="sec-decisions" className="ui-as-section">
          <h2>Decision Tree</h2>
          <DecisionTree decisions={decisions} onChoose={onChoose} title="Decisions" />
        </section>
      </div>
    </AppShell>
  );
}
