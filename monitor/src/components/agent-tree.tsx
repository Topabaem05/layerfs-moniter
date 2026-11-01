/**
 * Agent Tree. Class structure follows the live affectUI DOM (`.ui-agtc`).
 * Elbow links use pathLength=1. Marks are letters, not vendor logos.
 */
import { useMemo, useState } from "react";

import { Mark, Spark } from "./marks.js";

export interface TreeNode {
  id: string;
  name: string;
  model: string;
  task: string;
  status: "running" | "done" | "failed";
  costLabel: string;
  timeLabel: string;
  branchTitle?: string;
  children?: TreeNode[];
}

interface Placed {
  node: TreeNode;
  depth: number;
  y: number;
  parentId?: string;
}

function walk(node: TreeNode, depth: number, y: number, folded: Set<string>, out: Placed[]): number {
  out.push({ node, depth, y });
  if (folded.has(node.id)) return y + 108;
  let cursor = y + 108;
  for (const child of node.children ?? []) {
    cursor = walk(child, depth + 1, cursor, folded, out);
  }
  return cursor;
}

function elbow(rail: number, fromY: number, toY: number): string {
  const radius = 5.5;
  const entry = rail + 11;
  return `M${rail} ${fromY}V${toY - radius}Q${rail} ${toY} ${rail + radius} ${toY}H${entry}`;
}

export function AgentTree({
  root,
  title = "Agents",
  onSelect,
}: {
  root: TreeNode;
  title?: string;
  onSelect?: (node: TreeNode) => void;
}) {
  const [folded, setFolded] = useState<string[]>([]);
  const foldedSet = useMemo(() => new Set(folded), [folded]);
  const placed = useMemo(() => {
    const rows: Placed[] = [];
    walk(root, 0, 0, foldedSet, rows);
    return rows;
  }, [root, foldedSet]);
  const byId = new Map(placed.map((row) => [row.node.id, row]));
  const height = Math.max(220, placed.reduce((max, row) => Math.max(max, row.y + 108), 0));
  const failed = placed.filter((row) => row.node.status === "failed").length;
  const cost = root.costLabel;

  function links() {
    const paths: { d: string; key: string }[] = [];
    const dots: { x: number; y: number; key: string }[] = [];
    for (const row of placed) {
      const children = foldedSet.has(row.node.id) ? [] : row.node.children ?? [];
      if (children.length === 0) continue;
      const rail = 21 + row.depth * 32;
      const fromY = row.y + 96;
      dots.push({ x: rail, y: fromY, key: row.node.id });
      children.forEach((child) => {
        const childRow = byId.get(child.id);
        if (!childRow) return;
        paths.push({ key: `${row.node.id}-${child.id}`, d: elbow(rail, fromY, childRow.y + 36) });
      });
    }
    return { paths, dots };
  }
  const { paths, dots } = links();

  return (
    <div className="ui-agtc" data-testid="agent-tree">
      <header className="ui-agtc__bar">
        <Spark />
        <span className="ui-agtc__title">{title}</span>
        <span className="ui-agtc__sum" aria-live="polite">
          <span>{placed.length} agents</span>
          {failed > 0 ? (
            <button type="button" className="ui-agtc__sum-btn" data-kind="failed">
              {failed} failed
            </button>
          ) : null}
          <span className="ui-agtc__sum-cost">{cost}</span>
        </span>
      </header>
      <div className="ui-agtc__tree" role="tree" style={{ ["--ui-agtc-depth" as string]: "2", height }}>
        <svg className="ui-agtc__links" viewBox={`0 0 640 ${height}`} width="640" height={height} aria-hidden="true">
          {paths.map((path) => (
            <path key={path.key} d={path.d} pathLength={1} />
          ))}
        </svg>
        <svg className="ui-agtc__links ui-agtc__dots" viewBox={`0 0 640 ${height}`} width="640" height={height} aria-hidden="true">
          {dots.map((dot) => (
            <circle key={dot.key} cx={dot.x} cy={dot.y} r="3.25" />
          ))}
        </svg>
        {placed.map((row, index) => {
          const kids = row.node.children ?? [];
          const isOpen = !foldedSet.has(row.node.id);
          const Tag = row.depth === 0 ? "div" : "div";
          return (
            <Tag
              key={row.node.id}
              className={row.depth === 0 ? "ui-agtc__root" : "ui-agtc__hang"}
              role="treeitem"
              aria-expanded={kids.length > 0 ? isOpen : undefined}
              style={{ ["--ui-agtc-col" as string]: "1", top: row.y }}
            >
              <div
                className="ui-agtc__node"
                data-status={row.node.status}
                data-depth={row.depth}
                style={{ animationDelay: `${index * 160}ms` }}
                onClick={() => onSelect?.(row.node)}
              >
                <div className="ui-agtc__top">
                  <span className="ui-agtc__avatar">
                    <Mark letter={row.node.name} tone={row.node.status} />
                  </span>
                  <span className="ui-agtc__who">
                    <span className="ui-agtc__name">{row.node.name}</span>
                    <span className="ui-agtc__model">{row.node.model}</span>
                  </span>
                  <span className="ui-agtc__status" data-status={row.node.status}>
                    {row.node.status === "done" ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 14L8.5 17.5L19 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    ) : row.node.status === "failed" ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 4 3 20h18L12 4Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    ) : (
                      <span className="ui-agtc__pulse" />
                    )}
                    <span>{row.node.status === "done" ? "Done" : row.node.status === "failed" ? "Failed" : "Running"}</span>
                  </span>
                </div>
                <p className="ui-agtc__task">{row.node.task}</p>
                <div className="ui-agtc__meta">
                  <span className="ui-agtc__cost" title={row.node.branchTitle ?? "This branch, with its sub-agents"}>
                    <span className="ui-agtc__amount">{row.node.costLabel}</span>
                    <span className="ui-agtc__time"> · {row.node.timeLabel}</span>
                  </span>
                  {kids.length > 0 ? (
                    <button
                      type="button"
                      className="ui-agtc__fold"
                      aria-expanded={isOpen}
                      onClick={(event) => {
                        event.stopPropagation();
                        setFolded((current) =>
                          current.includes(row.node.id) ? current.filter((id) => id !== row.node.id) : [...current, row.node.id],
                        );
                      }}
                    >
                      {isOpen ? kids.length : `+${kids.length}`}
                      <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
