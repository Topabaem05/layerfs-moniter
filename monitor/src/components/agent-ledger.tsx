/**
 * Agent ledger.
 *
 * Original implementation of the public affectUI Agent Ledger props contract
 * (https://www.affectui.com/components/agent-ledger). Pro source is not included.
 * See monitor/NOTICE.md.
 */
import { useState } from "react";

import type { LedgerEntry } from "../model.js";

export type { LedgerEntry };

export interface AgentLedgerProps {
  entries: LedgerEntry[];
  agent?: string;
  now?: number;
  undone?: string[];
  defaultUndone?: string[];
  onUndo?: (ids: string[]) => void;
  onRedo?: (ids: string[]) => void;
  pointAt?: string | null;
  title?: string;
  className?: string;
}

function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function dependents(entries: readonly LedgerEntry[], id: string): { undo: string[]; kept: string[] } {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const root = byId.get(id);
  if (!root || root.reversible === false) return { undo: [], kept: [] };
  const undo = new Set<string>([id]);
  const kept = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const entry of entries) {
      if (!(entry.dependsOn ?? []).includes(current)) continue;
      if (entry.reversible === false) {
        kept.add(entry.id);
        continue;
      }
      if (undo.has(entry.id)) continue;
      undo.add(entry.id);
      queue.push(entry.id);
    }
  }
  return { undo: [...undo], kept: [...kept] };
}

export function AgentLedger({
  entries,
  agent,
  now = Date.now(),
  undone,
  defaultUndone = [],
  onUndo,
  onRedo,
  pointAt = null,
  title = "Ledger",
  className,
}: AgentLedgerProps) {
  const [localUndone, setLocalUndone] = useState(defaultUndone);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const done = new Set(undone ?? localUndone);
  const ordered = [...entries].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  const focusId = hoverId ?? pointAt;
  const marked = focusId ? dependents(entries, focusId) : { undo: [], kept: [] };

  function undo(id: string) {
    const chain = dependents(entries, id);
    if (chain.undo.length === 0) return;
    if (undone === undefined) setLocalUndone((current) => [...new Set([...current, ...chain.undo])]);
    onUndo?.(chain.undo);
  }

  function redo(id: string) {
    const chain = dependents(entries, id).undo;
    const ids = chain.length > 0 ? chain : [id];
    if (undone === undefined) setLocalUndone((current) => current.filter((item) => !ids.includes(item)));
    onRedo?.(ids);
  }

  return (
    <section className={["ui-al", className].filter(Boolean).join(" ")} data-testid="agent-ledger">
      <div className="ui-al-sheet">
        <header className="ui-al-bar">
          <h2>
            <span className="ui-al-mark" aria-hidden="true" />
            {title}
            {agent ? <span>{agent}</span> : null}
          </h2>
          <p>
            {ordered.length} change{ordered.length === 1 ? "" : "s"}
          </p>
        </header>
        <ol aria-label={title}>
          {ordered.map((entry) => {
            const isUndone = done.has(entry.id);
            const reversible = entry.reversible !== false;
            const also = marked.undo.includes(entry.id);
            const kept = marked.kept.includes(entry.id);
            const chain = dependents(entries, entry.id);
            return (
              <li
                key={entry.id}
                className={isUndone ? "is-undone" : undefined}
                data-mark={also ? "also" : kept ? "kept" : undefined}
              >
                <span className="ui-al-icon" aria-hidden="true">
                  {entry.system.slice(0, 1)}
                </span>
                <div className="ui-al-main">
                  <strong>
                    {entry.action}
                    {entry.target ? ` ${entry.target}` : ""}
                  </strong>
                  {entry.change ? (
                    <p className="ui-al-change">
                      <s>{entry.change[0]}</s>
                      <span aria-label="to"> → </span>
                      <span>{entry.change[1]}</span>
                    </p>
                  ) : (
                    <p className="ui-al-change">{entry.detail ?? entry.system}</p>
                  )}
                  {also && entry.id !== focusId ? <em className="ui-al-also">Also undone</em> : null}
                  {kept ? <em className="ui-al-kept">Can’t undo</em> : null}
                </div>
                <div className="ui-al-side">
                  <time dateTime={new Date(entry.at).toISOString()}>{ago(entry.at, now)}</time>
                  {isUndone ? (
                    <button type="button" onClick={() => redo(entry.id)} aria-label={`Redo ${entry.action}`}>
                      <span aria-hidden="true">↻</span> Redo
                    </button>
                  ) : reversible ? (
                    <button
                      type="button"
                      onFocus={() => setHoverId(entry.id)}
                      onBlur={() => setHoverId((current) => (current === entry.id ? null : current))}
                      onMouseEnter={() => setHoverId(entry.id)}
                      onMouseLeave={() => setHoverId((current) => (current === entry.id ? null : current))}
                      onClick={() => undo(entry.id)}
                      aria-label={
                        chain.undo.length > 1
                          ? `Undo ${entry.action}, and ${chain.undo.length - 1} changes that build on it`
                          : `Undo ${entry.action}`
                      }
                    >
                      <span aria-hidden="true">↺</span> Undo
                    </button>
                  ) : (
                    <span className="ui-al-lock">Kept</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
