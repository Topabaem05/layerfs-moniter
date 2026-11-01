/**
 * Agent tree.
 *
 * Original implementation of the public affectUI Agent Tree props contract
 * (https://www.affectui.com/components/agent-tree). Pro source is not included.
 * See monitor/NOTICE.md.
 */
import { useMemo, useState } from "react";

import type { TreeAgent } from "../model.js";

export type { TreeAgent };

type TreeStatus = TreeAgent["status"];
type ResolveAction = "approve" | "reject" | "retry" | "dismiss";

export interface AgentTreeProps {
  root: TreeAgent;
  onSelect?: (agent: TreeAgent) => void;
  onResolve?: (agent: TreeAgent, action: ResolveAction) => void;
  onCollapsedChange?: (collapsed: string[]) => void;
  collapsed?: string[];
  defaultCollapsed?: string[];
  now?: number;
  formatCost?: (amount: number) => string;
  title?: string;
  className?: string;
}

const STATUS_LABEL: Record<TreeStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Needs you",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

function branchCost(agent: TreeAgent): number {
  return (agent.cost ?? 0) + (agent.children ?? []).reduce((sum, child) => sum + branchCost(child), 0);
}

function flatten(agent: TreeAgent): TreeAgent[] {
  return [agent, ...(agent.children ?? []).flatMap(flatten)];
}

function formatSpan(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function AgentTree({
  root,
  onSelect,
  onResolve,
  onCollapsedChange,
  collapsed,
  defaultCollapsed = [],
  now = Date.now(),
  formatCost = (amount) => `${amount} commit${amount === 1 ? "" : "s"}`,
  title = "Agents",
  className,
}: AgentTreeProps) {
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);
  const [openId, setOpenId] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const folded = collapsed ?? localCollapsed;
  const agents = useMemo(() => flatten(root), [root]);
  const running = agents.filter((agent) => agent.status === "running").length;
  const waiting = agents.filter((agent) => agent.status === "waiting").length;
  const failed = agents.filter((agent) => agent.status === "failed").length;

  function toggle(id: string) {
    const next = folded.includes(id) ? folded.filter((item) => item !== id) : [...folded, id];
    if (collapsed === undefined) setLocalCollapsed(next);
    onCollapsedChange?.(next);
  }

  return (
    <section className={["ui-agt", className].filter(Boolean).join(" ")} data-testid="agent-tree">
      <header className="ui-agt-bar">
        <h2>{title}</h2>
        <p aria-live="polite">
          {agents.length} agents · {running} running · {waiting} need you · {failed} failed ·{" "}
          {formatCost(branchCost(root))}
        </p>
      </header>
      <div className="ui-agt-canvas" role="tree" aria-label={title}>
        <TreeNode
          agent={root}
          depth={0}
          folded={folded}
          now={now}
          formatCost={formatCost}
          openId={openId}
          onToggle={toggle}
          onOpen={setOpenId}
          onSelect={onSelect}
          onResolve={(agent, action) => {
            setLive(`${action} ${agent.name}`);
            setOpenId(null);
            onResolve?.(agent, action);
          }}
        />
      </div>
      <p className="ui-dct-live" aria-live="polite">
        {live}
      </p>
    </section>
  );
}

function TreeNode({
  agent,
  depth,
  folded,
  now,
  formatCost,
  openId,
  onToggle,
  onOpen,
  onSelect,
  onResolve,
}: {
  agent: TreeAgent;
  depth: number;
  folded: string[];
  now: number;
  formatCost: (amount: number) => string;
  openId: string | null;
  onToggle: (id: string) => void;
  onOpen: (id: string | null) => void;
  onSelect?: (agent: TreeAgent) => void;
  onResolve: (agent: TreeAgent, action: ResolveAction) => void;
}) {
  const children = agent.children ?? [];
  const isFolded = folded.includes(agent.id);
  const elapsed = agent.ended !== undefined && agent.started !== undefined
    ? agent.ended - agent.started
    : agent.started !== undefined
      ? now - agent.started
      : undefined;
  const showCost = children.length > 0 ? branchCost(agent) : agent.cost;
  const dialogOpen = openId === agent.id && (agent.status === "waiting" || agent.status === "failed");

  return (
    <div className="ui-agt-node" role="group" style={{ marginLeft: depth === 0 ? 0 : undefined }}>
      <div className="ui-agt-card" role="treeitem" aria-expanded={children.length > 0 ? !isFolded : undefined} aria-label={`${agent.name}, ${STATUS_LABEL[agent.status]}`}>
        <div className="ui-agt-card-top">
          {children.length > 0 ? (
            <button
              type="button"
              className="ui-agt-fold"
              aria-label={`${isFolded ? "Show" : "Hide"} ${children.length} sub-agents of ${agent.name}`}
              onClick={() => onToggle(agent.id)}
            >
              {isFolded ? "▸" : "▾"}
            </button>
          ) : (
            <span className="ui-agt-fold" aria-hidden="true" />
          )}
          <button
            type="button"
            className="ui-agt-select"
            onClick={() => onSelect?.(agent)}
            disabled={!onSelect}
          >
            <strong>{agent.name}</strong>
            {agent.model ? <span>{agent.model}</span> : null}
          </button>
          <span className={`ui-agt-status ui-agt-status-${agent.status}`}>{STATUS_LABEL[agent.status]}</span>
        </div>
        <p className="ui-agt-task">{agent.task}</p>
        <p className="ui-agt-meta">
          {showCost !== undefined ? <span>{formatCost(showCost)}</span> : null}
          {elapsed !== undefined ? <span>{formatSpan(elapsed)}</span> : null}
          {(agent.status === "waiting" || agent.status === "failed") && (agent.ask || agent.error) ? (
            <button
              type="button"
              className="ui-agt-ask"
              aria-expanded={dialogOpen}
              onClick={() => onOpen(dialogOpen ? null : agent.id)}
            >
              {agent.status === "waiting" ? "needs you" : "failed"}
            </button>
          ) : null}
        </p>
        {dialogOpen ? (
          <div role="dialog" aria-label={agent.name} className="ui-agt-dialog">
            <p>{agent.ask ?? agent.error}</p>
            <div>
              {agent.status === "waiting" ? (
                <>
                  <button type="button" onClick={() => onResolve(agent, "approve")}>
                    Use this scout
                  </button>
                  <button type="button" onClick={() => onResolve(agent, "reject")}>
                    Not this one
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => onResolve(agent, "retry")}>
                  Retry
                </button>
              )}
              <button type="button" onClick={() => onOpen(null)}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {children.length > 0 && !isFolded ? (
        <div className={depth === 0 ? "ui-agt-children" : "ui-agt-stack"}>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              agent={child}
              depth={depth + 1}
              folded={folded}
              now={now}
              formatCost={formatCost}
              openId={openId}
              onToggle={onToggle}
              onOpen={onOpen}
              onSelect={onSelect}
              onResolve={onResolve}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
