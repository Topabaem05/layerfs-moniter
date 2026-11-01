/**
 * Maps the checkout, experiments and Falsify tickets onto the studio sections.
 */
import type { BoardState } from "./useStudio.js";
import type { ExperimentRecord } from "./experiment.js";
import type { Ticket } from "./falsify/types.js";
import type { HistoryArea, HistoryCommit } from "./model.js";
import type { HandoffCard, HandoffLane, HandoffPerson } from "./components/agent-handoff.js";
import type { TreeNode } from "./components/agent-tree.js";
import type { QueueJob, QueueWorker } from "./components/agent-queue.js";
import type { DelegateAgent, DelegateTask } from "./components/delegate-board.js";
import type { RunCard } from "./components/scheduled-runs.js";

export const ROLES = [
  { id: "scout", name: "History scout", model: "git log", rate: "reads main" },
  { id: "implementer", name: "Implementer", model: "branch cutter", rate: "cuts the branch" },
  { id: "reviewer", name: "Reviewer", model: "Falsify", rate: "files the ticket" },
  { id: "ops", name: "Ops", model: "daemon", rate: "watches custody" },
] as const;

function age(at: number): string {
  const hours = Math.max(0, Math.round((Date.now() - at) / 3_600_000));
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function methodRecorded(record: ExperimentRecord | undefined): boolean {
  if (!record) return false;
  return Boolean(record.approach.trim() || record.setup.trim() || record.parameters.trim());
}

export function coverage(areas: HistoryArea[], experiments: ExperimentRecord[]): number {
  if (areas.length === 0) return 0;
  const covered = areas.filter((area) => experiments.some((record) => record.areaId === area.id && methodRecorded(record))).length;
  return Math.round((100 * covered) / areas.length);
}

export function handoffView(areas: HistoryArea[], experiments: ExperimentRecord[]): { agents: HandoffPerson[]; lanes: HandoffLane[] } {
  const newest = areas[0];
  const agents: HandoffPerson[] = [
    {
      id: "scout",
      name: "History scout",
      model: "git log",
      cost: `${areas.reduce((sum, area) => sum + area.commits.length, 0)} commits`,
      status: "idle",
      description: "Reads what main already published",
      now: newest ? "upnext" : "idle",
      task: newest ? `Survey ${newest.label}` : undefined,
      more: Math.max(0, areas.length - 1),
    },
    {
      id: "implementer",
      name: "Implementer",
      model: "branch cutter",
      cost: `${areas.length} branches`,
      status: areas.some((area) => !methodRecorded(experiments.find((record) => record.areaId === area.id))) ? "working" : "idle",
      description: "Cuts the improvement branch and records the method",
      now: "working",
      task: newest ? `Cut ${newest.label}` : "Ready for a task",
      note: "Waiting on a subsystem",
    },
    {
      id: "reviewer",
      name: "Reviewer",
      model: "Falsify",
      cost: `${experiments.length} records`,
      status: "idle",
      description: "Checks the experiment before the ticket is filed",
      now: "idle",
    },
  ];
  const scoutCards: HandoffCard[] = areas.slice(0, 4).map((area) => {
    const commit = area.commits[0];
    const files = commit?.files ?? [];
    return {
      id: `survey-${area.id}`,
      title: commit?.subject ?? area.label,
      status: methodRecorded(experiments.find((record) => record.areaId === area.id)) ? "done" : "working",
      items: [
        ...files.slice(0, 3).map((file, index) => ({ id: `${area.id}-f${index}`, label: file.split("/").pop() ?? file, kind: "file" })),
        ...(files.length > 3
          ? [{ id: `${area.id}-lost`, label: `${files.length - 3} more paths`, kind: "note", lost: true, why: "Left in the commit." }]
          : []),
      ],
    };
  });
  const reviewCards: HandoffCard[] = experiments.slice(0, 3).map((record) => ({
    id: `review-${record.branchId}`,
    title: record.subject,
    status: record.conclusion.trim() ? "done" : "working",
    items: [
      { id: `${record.branchId}-h`, label: record.hypothesis.slice(0, 80) || "Hypothesis missing", kind: "fact", lost: !record.hypothesis.trim() },
      { id: `${record.branchId}-m`, label: record.approach || "Methodology not recorded", kind: "note", lost: !record.approach.trim(), why: "Not recorded on this branch yet." },
    ],
  }));
  const lanes: HandoffLane[] = [
    { from: "scout", to: "implementer", cards: scoutCards },
    { from: "implementer", to: "reviewer", cards: reviewCards },
  ];
  return { agents, lanes };
}

function commitStatus(commit: HistoryCommit, experiments: ExperimentRecord[], tickets: Ticket[]): TreeNode["status"] {
  const record = experiments.find((item) => item.commitSha === commit.sha);
  const ticket = tickets.find((item) => item.provenanceRefs.includes(commit.sha));
  if (ticket?.status === "CANCELLED" || ticket?.status === "BLOCKED") return "failed";
  if (methodRecorded(record) || ticket?.status === "COMPLETED") return "done";
  return "running";
}

export function treeView(areas: HistoryArea[], experiments: ExperimentRecord[], tickets: Ticket[]): TreeNode {
  return {
    id: "studio",
    name: "Branch studio",
    model: "LayerFS",
    task: "Cut a better improvement branch from published history",
    status: "running",
    costLabel: `${areas.length} branches`,
    timeLabel: "live",
    branchTitle: "The whole improvement tree",
    children: areas.slice(0, 4).map((area) => ({
      id: area.id,
      name: `${area.label} scout`,
      model: "git",
      task: area.commits[0]?.subject ?? area.blurb,
      status: area.commits[0] ? commitStatus(area.commits[0], experiments, tickets) : "running",
      costLabel: `${area.commits.length} commits`,
      timeLabel: area.commits[0] ? age(area.commits[0].at) : "—",
      children: area.commits.slice(0, 2).map((commit) => ({
        id: commit.sha,
        name: commit.short,
        model: area.label,
        task: commit.subject,
        status: commitStatus(commit, experiments, tickets),
        costLabel: `${commit.files.length} files`,
        timeLabel: age(commit.at),
      })),
    })),
  };
}

export function queueView(tickets: Ticket[], areas: HistoryArea[]): { jobs: QueueJob[]; workers: QueueWorker[] } {
  const firstEligible = { used: false };
  const jobs: QueueJob[] = tickets.map((ticket) => {
    let status: QueueJob["status"] = "queued";
    if (ticket.status === "CANCELLED" || ticket.status === "BLOCKED") status = "failed";
    else if (ticket.status === "COMPLETED" || ticket.status === "MATERIALIZED") status = "done";
    else if (ticket.status === "CLAIMED") status = "running";
    else if (ticket.status === "ELIGIBLE") {
      status = firstEligible.used ? "queued" : "running";
      firstEligible.used = true;
    }
    return { id: ticket.id, name: ticket.title, status, meta: ticket.status, kind: "agent" as const };
  });
  if (jobs.filter((job) => job.status === "queued" || job.status === "running").length === 0) {
    areas.slice(0, 4).forEach((area) => {
      const commit = area.commits[0];
      if (!commit) return;
      jobs.push({ id: `area-${area.id}`, name: `Cut ${area.label}`, status: "queued", meta: commit.short, kind: "tool" });
    });
  }
  const running = jobs.find((job) => job.status === "running");
  const workers = ROLES.slice(0, 4).map((role, index) => ({
    id: role.id,
    name: index === 0 && running ? role.name : role.name,
  }));
  return { jobs, workers };
}

export function delegateView(
  areas: HistoryArea[],
  tickets: Ticket[],
  board: BoardState,
): { tasks: DelegateTask[]; agents: DelegateAgent[] } {
  const ticketed = new Set(tickets.flatMap((ticket) => ticket.provenanceRefs));
  const tasks: DelegateTask[] = [];
  for (const area of areas) {
    const commit = area.commits[0];
    if (!commit || ticketed.has(commit.sha)) continue;
    tasks.push({
      id: `commit:${commit.sha}`,
      title: `Improve ${area.label}: ${commit.subject}`.slice(0, 80),
      meta: `${commit.short} · ${commit.files.length} files`,
    });
  }
  for (const ticket of tickets) {
    if (board.assignments.some((item) => item.ticketId === ticket.id)) continue;
    if (ticket.status === "CANCELLED" || ticket.status === "COMPLETED") continue;
    tasks.push({ id: `ticket:${ticket.id}`, title: ticket.title, meta: ticket.status, ticketId: ticket.id });
  }
  const agents: DelegateAgent[] = ROLES.map((role) => {
    const queue = board.assignments
      .filter((item) => item.agentId === role.id)
      .map((item) => {
        const ticket = tickets.find((entry) => entry.id === item.ticketId);
        return { id: item.ticketId, title: ticket?.title ?? item.ticketId, running: ticket?.status === "CLAIMED" || ticket?.status === "ELIGIBLE" };
      });
    return {
      id: role.id,
      name: role.name,
      model: role.model,
      rate: role.rate,
      busy: queue.some((item) => item.running) ? "next session" : undefined,
      queue,
    };
  });
  return { tasks: tasks.slice(0, 8), agents };
}

export function runCards(areas: HistoryArea[]): RunCard[] {
  return areas.flatMap((area) =>
    area.commits.slice(0, 2).map((commit) => {
      const percent = Math.min(140, 15 + commit.files.length * 7);
      const role = percent > 80 ? "ops" : area.risk === "high" ? "implementer" : "scout";
      return {
        id: commit.sha,
        title: commit.subject.slice(0, 64),
        agentId: role,
        agentName: ROLES.find((item) => item.id === role)?.name ?? role,
        detail: `${area.label} · ${commit.short}`,
        percent,
        stats: `${commit.files.length} files`,
      };
    }),
  );
}

export function weekDays(now = new Date()): { label: string; date: string; today?: boolean }[] {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [0, 1, 2].map((offset) => {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    return { label: labels[day.getDay()] ?? "", date: String(day.getDate()), today: offset === 0 };
  });
}
