/**
 * Agent handoff.
 *
 * Original implementation of the public affectUI Agent Handoff props contract
 * (https://www.affectui.com/components/agent-handoff). Pro source is not included.
 * Assignment uses the documented keyboard path: pick up a task, then give it to
 * an agent further down the relay. See monitor/NOTICE.md.
 */
import { useState } from "react";

import type { Handoff, HandoffAgent, HandoffItem, HandoffTask } from "../model.js";

export type { Handoff, HandoffAgent, HandoffItem, HandoffTask };

export interface AgentHandoffProps {
  agents: HandoffAgent[];
  handoffs: Handoff[];
  tasks?: HandoffTask[];
  onAssign?: (task: HandoffTask, agent: HandoffAgent) => void;
  onRestore?: (handoff: Handoff, item: HandoffItem) => void;
  className?: string;
}

export function AgentHandoff({
  agents,
  handoffs,
  tasks = [],
  onAssign,
  onRestore,
  className,
}: AgentHandoffProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [whyId, setWhyId] = useState<string | null>(null);
  const picked = tasks.find((task) => task.id === pickedId) ?? null;

  function columnIndex(agentId: string): number {
    return agents.findIndex((agent) => agent.id === agentId);
  }

  function canReceive(agent: HandoffAgent): boolean {
    if (!picked) return false;
    const from = picked.agent ? columnIndex(picked.agent) : -1;
    return columnIndex(agent.id) > from;
  }

  function assign(agent: HandoffAgent) {
    if (!picked || !canReceive(agent)) return;
    onAssign?.(picked, agent);
    setPickedId(null);
  }

  const waiting = tasks.filter((task) => !task.agent);
  const pairs = agents.slice(0, -1).map((from, index) => {
    const to = agents[index + 1];
    return {
      from,
      to,
      cards: to ? handoffs.filter((handoff) => handoff.from === from.id && handoff.to === to.id) : [],
    };
  });

  return (
    <section className={["ui-aho", className].filter(Boolean).join(" ")} data-testid="agent-handoff">
      <header className="ui-aho-bar">
        <h2>Handoff</h2>
        <p>{picked ? `Carrying “${picked.title}”. Hand it to an agent further along.` : "Pick up a task, then hand it down the relay."}</p>
      </header>
      <div className="ui-aho-agents">
        {agents.map((agent) => {
          const mine = tasks.filter((task) => task.agent === agent.id);
          const current = mine.find((task) => task.status === "working") ?? mine[0];
          const working = mine.some((task) => task.status === "working" || task.status === "warning");
          return (
            <article key={agent.id} className={canReceive(agent) ? "ui-aho-agent is-target" : "ui-aho-agent"}>
              <header>
                <span className="ui-aho-mark" aria-hidden="true">
                  {agent.name.slice(0, 1)}
                </span>
                <div>
                  <strong>{agent.name}</strong>
                  {agent.model ? <small>{agent.model}</small> : null}
                </div>
                <span className={working ? "ui-aho-pill is-working" : "ui-aho-pill is-idle"}>{working ? "Working" : "Idle"}</span>
              </header>
              {agent.description ? <p>{agent.description}</p> : null}
              <button
                type="button"
                className="ui-aho-chip"
                aria-pressed={current ? pickedId === current.id : false}
                onClick={() => current && setPickedId((value) => (value === current.id ? null : current.id))}
                disabled={!current}
              >
                <span>{current ? current.title : "Ready for a task"}</span>
                {current?.note ? <em>{current.note}</em> : null}
              </button>
              {canReceive(agent) ? (
                <button type="button" className="ui-aho-give" onClick={() => assign(agent)}>
                  Hand “{picked?.title}” here
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="ui-aho-wires" aria-hidden="true">
        {agents.slice(0, -1).map((agent) => (
          <span key={agent.id} />
        ))}
      </div>
      <div className="ui-aho-gaps">
        {pairs.map(({ from, to, cards }) => (
          <div key={`${from.id}-${to?.id}`}>
            <p className="ui-aho-gaphead">
              <span>{from.name}</span>
              <span aria-hidden="true">→</span>
              <span>{to?.name}</span>
              <b>{cards.reduce((sum, card) => sum + card.items.length, 0) || cards.length}</b>
            </p>
            <ul className="ui-aho-cards" aria-label={`Handed from ${from.name} to ${to?.name}`}>
              {cards.map((handoff) => {
                const open = openId === handoff.id;
                const lost = handoff.items.filter((item) => item.lost);
                const kept = handoff.items.filter((item) => !item.lost);
                const line = kept.map((item) => item.label).join(", ");
                return (
                  <li key={handoff.id}>
                    <button type="button" className="ui-aho-card" aria-expanded={open} onClick={() => setOpenId(open ? null : handoff.id)}>
                      <strong>{handoff.task}</strong>
                      <span className="ui-aho-line">{line || "Nothing carried"}</span>
                      {lost.length > 0 ? (
                        <em className="is-warning">{lost.length} not passed on</em>
                      ) : (
                        <em>With {to?.name}</em>
                      )}
                    </button>
                    {open ? (
                      <ul>
                        {handoff.items.map((item) => {
                          const why = whyId === `${handoff.id}:${item.id}`;
                          return (
                            <li key={item.id} className={item.lost ? "is-lost" : undefined}>
                              {item.lost ? (
                                <button type="button" aria-expanded={why} onClick={() => setWhyId(why ? null : `${handoff.id}:${item.id}`)}>
                                  <s>{item.label}</s>
                                </button>
                              ) : (
                                <span>{item.label}</span>
                              )}
                              {why && item.why ? (
                                <p>
                                  {item.why}
                                  {onRestore ? (
                                    <button type="button" onClick={() => onRestore(handoff, item)}>
                                      Add back
                                    </button>
                                  ) : null}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {waiting.length > 0 ? (
        <ul className="ui-aho-waiting" aria-label="Waiting tasks">
          {waiting.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                aria-pressed={pickedId === task.id}
                onClick={() => setPickedId((current) => (current === task.id ? null : task.id))}
              >
                <strong>{task.title}</strong>
                <em>{task.note ?? task.status}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
