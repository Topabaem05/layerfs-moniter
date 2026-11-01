/** Shared studio model. Serializable, no React and no Node APIs. */

export type Risk = "high" | "medium" | "low";

export interface DecisionFlag {
  text: string;
  note: string;
  source?: string;
}

export type DecisionText = string | Array<string | DecisionFlag>;

export interface DecisionOption {
  label: string;
  effects?: DecisionText[];
  pick?: boolean;
}

export interface Decision {
  id: string;
  question: string;
  context?: string;
  agent: string;
  model?: string;
  risk?: Risk;
  options: DecisionOption[];
}

export interface HistoryCommit {
  sha: string;
  short: string;
  subject: string;
  at: number;
  files: string[];
  area: string;
}

export interface HistoryArea {
  id: string;
  label: string;
  risk: Risk;
  blurb: string;
  commits: HistoryCommit[];
}

export interface TreeAgent {
  id: string;
  name: string;
  task: string;
  model?: string;
  status: "queued" | "running" | "waiting" | "done" | "failed" | "stopped";
  ask?: string;
  error?: string;
  cost?: number;
  started?: number;
  ended?: number;
  children?: TreeAgent[];
}

export interface LedgerEntry {
  id: string;
  action: string;
  target?: string;
  system: string;
  at: number;
  change?: [string, string];
  detail?: string;
  reversible?: boolean;
  dependsOn?: string[];
}

export interface HandoffAgent {
  id: string;
  name: string;
  model?: string;
  description?: string;
}

export interface HandoffItem {
  id: string;
  label: string;
  kind?: "file" | "source" | "fact" | "decision" | "note";
  lost?: boolean;
  why?: string;
}

export interface Handoff {
  id: string;
  from: string;
  to: string;
  task: string;
  items: HandoffItem[];
}

export interface HandoffTask {
  id: string;
  title: string;
  status: "todo" | "working" | "done" | "warning";
  agent?: string;
  note?: string;
}

export interface StudioHead {
  sha: string;
  short: string;
  subject: string;
}

export interface StudioSnapshot {
  generatedAt: number;
  refName: string;
  head: StudioHead;
  areas: HistoryArea[];
  decisions: Decision[];
  tree: TreeAgent;
  ledger: LedgerEntry[];
  agents: HandoffAgent[];
  tasks: HandoffTask[];
  handoffs: Handoff[];
}
