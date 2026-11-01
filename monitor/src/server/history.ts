/**
 * Reads the checkout's git history and turns it into improvement-branch state.
 * The studio does not invent a sample project: every option is a real commit.
 */
import { execFileSync } from "node:child_process";

import type {
  Decision,
  DecisionOption,
  DecisionText,
  Handoff,
  HandoffAgent,
  HandoffItem,
  HandoffTask,
  HistoryArea,
  HistoryCommit,
  LedgerEntry,
  Risk,
  StudioHead,
  StudioSnapshot,
  TreeAgent,
} from "../model.js";

interface AreaMeta {
  label: string;
  risk: Risk;
  blurb: string;
}

export const AREA_META: Record<string, AreaMeta> = {
  engine: {
    label: "Engine",
    risk: "high",
    blurb: "the daemon, FUSE, the overlay and the Store",
  },
  core: {
    label: "Core",
    risk: "high",
    blurb: "content, storage and history algorithms",
  },
  api: {
    label: "API",
    risk: "medium",
    blurb: "the JavaScript SDK and the layerfs command",
  },
  plugins: {
    label: "Plugins",
    risk: "medium",
    blurb: "host listings that mount LayerFS",
  },
  docs: {
    label: "Docs",
    risk: "low",
    blurb: "contracts and architecture records",
  },
  tools: {
    label: "Tools",
    risk: "low",
    blurb: "CI selection and local tooling",
  },
  other: {
    label: "Repository",
    risk: "medium",
    blurb: "root files outside a layer",
  },
};

const PREFIX: Record<string, string> = {
  engine: "engine",
  core: "core",
  api: "api",
  plugins: "plugins",
  docs: "docs",
  tools: "tools",
  ".agents": "tools",
  ".github": "tools",
};

const RISKY = /abort|dirty|unmount|conflict|custody|truncat/i;

export function areaOf(files: readonly string[], subject: string): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    const top = file.split("/")[0] ?? "";
    const area = PREFIX[top] ?? "other";
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const winner = ranked.find(([area]) => area !== "other") ?? ranked[0];
  if (winner && winner[0] !== "other") return winner[0];
  const text = subject.toLowerCase();
  if (/daemon|fuse|unmount|overlay|workspace|store/.test(text)) return "engine";
  if (/plugin/.test(text)) return "plugins";
  if (/sdk|\bapi\b|\bcli\b/.test(text)) return "api";
  if (/doc|readme|contract/.test(text)) return "docs";
  return winner?.[0] ?? "other";
}

/** Parses `git log --name-only` output produced by {@link readStudio}. */
export function parseLog(raw: string): HistoryCommit[] {
  const commits: HistoryCommit[] = [];
  let current: HistoryCommit | undefined;
  for (const line of raw.split("\n")) {
    if (line.startsWith("COMMIT\t")) {
      if (current) commits.push(current);
      const [, sha = "", ct = "0", subject = ""] = line.split("\t");
      current = {
        sha,
        short: sha.slice(0, 9),
        subject,
        at: Number(ct) * 1000,
        files: [],
        area: "other",
      };
      continue;
    }
    if (line.trim() && current) current.files.push(line.trim());
  }
  if (current) commits.push(current);
  return commits
    .filter((commit) => commit.sha !== "" && !commit.subject.startsWith("Merge "))
    .map((commit) => ({ ...commit, area: areaOf(commit.files, commit.subject) }));
}

function meta(id: string): AreaMeta {
  return AREA_META[id] ?? AREA_META.other;
}

export function groupAreas(commits: readonly HistoryCommit[]): HistoryArea[] {
  const grouped = new Map<string, HistoryCommit[]>();
  for (const commit of commits) {
    const list = grouped.get(commit.area) ?? [];
    list.push(commit);
    grouped.set(commit.area, list);
  }
  const areas = [...grouped.entries()].map(([id, list]) => {
    const info = meta(id);
    const sorted = [...list].sort((a, b) => b.at - a.at || a.sha.localeCompare(b.sha));
    return { id, label: info.label, risk: info.risk, blurb: info.blurb, commits: sorted };
  });
  areas.sort((a, b) => {
    const at = (b.commits[0]?.at ?? 0) - (a.commits[0]?.at ?? 0);
    return at !== 0 ? at : a.label.localeCompare(b.label);
  });
  return areas;
}

function subjectEffect(commit: HistoryCommit): DecisionText {
  if (!RISKY.test(commit.subject)) return `Latest: ${commit.subject}`;
  return [
    "Latest: ",
    {
      text: commit.subject,
      note: "This change touches abort, dirty state, or unmount custody. A new branch keeps main as it was published.",
      source: commit.short,
    },
  ];
}

function subsystemDecision(head: StudioHead, areas: readonly HistoryArea[], total: number): Decision {
  const options: DecisionOption[] = areas.slice(0, 4).map((area, index) => ({
    label: `Branch from ${area.label}`,
    pick: index === 0,
    effects: [
      `${area.commits.length} published commit${area.commits.length === 1 ? "" : "s"} in this window`,
      area.commits[0] ? subjectEffect(area.commits[0]) : `No commit in ${area.label}`,
      area.risk === "low"
        ? `Low risk · ${area.blurb}`
        : [
            `${area.risk === "high" ? "High" : "Medium"} risk · `,
            {
              text: area.blurb,
              note:
                area.risk === "high"
                  ? "Engine and core changes move the filesystem daemon. Review the branch before it is handed on."
                  : "This layer is shared by hosts. The branch should stay compatible with the current SDK.",
              source: area.id,
            },
          ],
    ],
  }));
  if (options.length === 1) {
    options.push({
      label: "Stay on main",
      pick: false,
      effects: ["No new branch is cut", "The ledger keeps the published commits as they are"],
    });
  }
  const newest = areas[0];
  return {
    id: "subsystem",
    question: `main is “${head.subject}”. Which subsystem should the next improvement branch start from?`,
    context: `${total} recent non-merge commits on this checkout. The scout’s pick is the subsystem that moved last${newest ? `: ${newest.label}` : ""}.`,
    agent: "History scout",
    model: "git log",
    risk: newest?.risk ?? "medium",
    options,
  };
}

function buildTree(head: StudioHead, areas: readonly HistoryArea[]): TreeAgent {
  const started = areas.reduce((min, area) => {
    const oldest = area.commits[area.commits.length - 1]?.at ?? min;
    return Math.min(min, oldest);
  }, areas[0]?.commits[0]?.at ?? Date.now());
  return {
    id: "studio",
    name: "Branch studio",
    model: "LayerFS",
    task: `Cut a better improvement branch from ${head.short}`,
    status: "running",
    cost: areas.length,
    started,
    children: areas.map((area, index) => {
      const newest = area.commits[0];
      const oldest = area.commits[area.commits.length - 1];
      const waiting = index === 0;
      return {
        id: area.id,
        name: `${area.label} scout`,
        model: "git",
        task: newest?.subject ?? `No recent ${area.label} commits`,
        status: waiting ? "waiting" : "done",
        ask: waiting
          ? `Pick ${area.label} or another subsystem before a branch is cut.`
          : undefined,
        cost: area.commits.length,
        started: oldest?.at,
        ended: waiting ? undefined : newest?.at,
      };
    }),
  };
}

function buildLedger(areas: readonly HistoryArea[]): LedgerEntry[] {
  const commits = areas
    .flatMap((area) => area.commits.map((commit) => ({ commit, area })))
    .sort((a, b) => b.commit.at - a.commit.at)
    .slice(0, 8);
  return commits.map(({ commit, area }) => ({
    id: `published-${commit.short}`,
    action: "Published on main",
    target: commit.subject,
    system: area.label,
    at: commit.at,
    change: [commit.short, commit.subject],
    detail: commit.files.slice(0, 3).join(", "),
    reversible: false,
  }));
}

function buildRelay(areas: readonly HistoryArea[]): {
  agents: HandoffAgent[];
  tasks: HandoffTask[];
  handoffs: Handoff[];
} {
  const agents: HandoffAgent[] = [
    {
      id: "scout",
      name: "History scout",
      model: "git log",
      description: "Reads what main already published",
    },
    {
      id: "cutter",
      name: "Branch cutter",
      model: "decision",
      description: "Chooses the improvement branch",
    },
    {
      id: "desk",
      name: "Ticket desk",
      model: "Falsify",
      description: "Files the branch as a research ticket",
    },
  ];
  const newest = areas[0]?.commits[0];
  const files = newest?.files ?? [];
  const shown = files.slice(0, 3).map((file, index) => ({
    id: `file-${index}`,
    label: file,
    kind: "file" as const,
  }));
  const items: HandoffItem[] = [
    ...shown,
    {
      id: "decision",
      label: "Which subsystem the next branch starts from",
      kind: "decision" as const,
    },
  ];
  if (files.length > 3) {
    items.push({
      id: "rest",
      label: `${files.length - 3} more paths from ${newest?.short ?? "HEAD"}`,
      kind: "note" as const,
      lost: true,
      why: "Left in the commit. The cutter’s context keeps the decision, not the whole patch.",
    });
  }
  const handoffs: Handoff[] = newest
    ? [
        {
          id: `survey-${newest.short}`,
          from: "scout",
          to: "cutter",
          task: "Survey main",
          items,
        },
      ]
    : [];
  const tasks: HandoffTask[] = [
    { id: "survey", title: "Survey main", status: "done", agent: "scout", note: "History is loaded" },
    {
      id: "cut",
      title: "Cut the improvement branch",
      status: "working",
      agent: "cutter",
      note: "Waiting for a subsystem",
    },
    { id: "file", title: "File the branch as a ticket", status: "todo", note: "Hand off after a base commit is chosen" },
  ];
  return { agents, tasks, handoffs };
}

export function studioFromCommits(
  commits: readonly HistoryCommit[],
  head: StudioHead,
  refName: string,
  now = Date.now(),
): StudioSnapshot {
  const areas = groupAreas(commits);
  const relay = buildRelay(areas);
  return {
    generatedAt: now,
    refName,
    head,
    areas,
    decisions: [subsystemDecision(head, areas, commits.length)],
    tree: buildTree(head, areas),
    ledger: buildLedger(areas),
    agents: relay.agents,
    tasks: relay.tasks,
    handoffs: relay.handoffs,
  };
}

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

export function readStudio(repoRoot: string): StudioSnapshot {
  const raw = git(repoRoot, [
    "log",
    "-n",
    "40",
    "--name-only",
    "--pretty=format:COMMIT%x09%H%x09%ct%x09%s",
  ]);
  const sha = git(repoRoot, ["rev-parse", "HEAD"]);
  const subject = git(repoRoot, ["log", "-1", "--pretty=%s"]);
  const refName = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return studioFromCommits(parseLog(raw), { sha, short: sha.slice(0, 9), subject }, refName);
}
