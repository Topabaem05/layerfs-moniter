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

  return (
    <section className={["ui-aho", className].filter(Boolean).join(" ")} data-testid="agent-handoff">
      <header className="ui-aho-bar">
        <h2>Handoff</h2>
        <p>{picked ? `Carrying “${picked.title}”. Choose an agent to the right.` : "Pick up a waiting task, then hand it on."}</p>
      </header>
      <div className="ui-aho-relay">
        {agents.map((agent, index) => {
          const mine = tasks.filter((task) => task.agent === agent.id);
          const incoming = handoffs.filter((handoff) => handoff.to === agent.id);
          const nextTodo = index === 0 ? tasks.find((task) => task.status === "todo" && !task.agent) : undefined;
          return (
            <div key={agent.id} className="ui-aho-column">
              <article className={canReceive(agent) ? "ui-aho-agent is-target" : "ui-aho-agent"}>
                <header>
                  <h3>{agent.name}</h3>
                  {agent.model ? <span>{agent.model}</span> : null}
                </header>
                {agent.description ? <p>{agent.description}</p> : null}
                <ul aria-label={`${agent.name} tasks`}>
                  {mine.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        aria-pressed={pickedId === task.id}
                        onClick={() => setPickedId((current) => (current === task.id ? null : task.id))}
                      >
                        <strong>{task.title}</strong>
                        <em className={`is-${task.status}`}>{task.status}</em>
                        {task.note ? <span>{task.note}</span> : null}
                      </button>
                    </li>
                  ))}
                  {mine.length === 0 && nextTodo ? (
                    <li className="ui-aho-upnext">Up next: {nextTodo.title}</li>
                  ) : null}
                  {mine.length === 0 && !nextTodo ? <li className="ui-aho-idle">Idle</li> : null}
                </ul>
                {canReceive(agent) ? (
                  <button type="button" className="ui-aho-give" onClick={() => assign(agent)}>
                    Give “{picked?.title}” to {agent.name}
                  </button>
                ) : null}
              </article>
              {incoming.length > 0 ? (
                <ul className="ui-aho-cards" aria-label={`Handed to ${agent.name}`}>
                  {incoming.map((handoff) => {
                    const open = openId === handoff.id;
                    return (
                      <li key={handoff.id}>
                        <button
                          type="button"
                          className="ui-aho-card"
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : handoff.id)}
                        >
                          {handoff.task}
                          <span className="ui-aho-count">{handoff.items.length} carried</span>
                        </button>
                        {open ? (
                          <ul>
                            {handoff.items.map((item) => {
                              const why = whyId === `${handoff.id}:${item.id}`;
                              return (
                                <li key={item.id} className={item.lost ? "is-lost" : undefined}>
                                  {item.lost ? (
                                    <button
                                      type="button"
                                      aria-expanded={why}
                                      onClick={() => setWhyId(why ? null : `${handoff.id}:${item.id}`)}
                                    >
                                      <s>{item.label}</s>
                                      <span>{item.kind ?? "note"}</span>
                                    </button>
                                  ) : (
                                    <span>
                                      {item.label}
                                      <em className="ui-aho-kind">{item.kind ?? "note"}</em>
                                    </span>
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
              ) : null}
            </div>
          );
        })}
        {tasks.some((task) => !task.agent) ? (
          <div className="ui-aho-column">
            <article className="ui-aho-agent">
              <header>
                <h3>Waiting</h3>
              </header>
              <ul aria-label="Waiting tasks">
                {tasks
                  .filter((task) => !task.agent)
                  .map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        aria-pressed={pickedId === task.id}
                        onClick={() => setPickedId((current) => (current === task.id ? null : task.id))}
                      >
                        <strong>{task.title}</strong>
                        <em className={`is-${task.status}`}>{task.status}</em>
                        {task.note ? <span>{task.note}</span> : null}
                      </button>
                    </li>
                  ))}
              </ul>
            </article>
          </div>
        ) : null}
      </div>
    </section>
  );
}
