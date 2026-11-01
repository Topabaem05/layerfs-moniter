/**
 * Delegate Board. Class structure follows `.ui-dbc`.
 * Dropping a task on a role creates or assigns a Falsify ticket.
 */
import { useState } from "react";

import { Mark, Spark } from "./marks.js";

export interface DelegateTask {
  id: string;
  title: string;
  meta: string;
  ticketId?: string;
}

export interface DelegateAgent {
  id: string;
  name: string;
  model: string;
  rate: string;
  busy?: string;
  queue: { id: string; title: string; running?: boolean }[];
}

export function DelegateBoard({
  tasks,
  agents,
  onAssign,
}: {
  tasks: DelegateTask[];
  agents: DelegateAgent[];
  onAssign: (taskId: string, agentId: string) => void;
}) {
  const [auto, setAuto] = useState(false);
  const [live, setLive] = useState("Drag onto an agent, or press Enter, choose with the arrow keys and press Enter again.");
  const [picked, setPicked] = useState<string | null>(null);

  function assign(taskId: string, agentId: string) {
    const task = tasks.find((item) => item.id === taskId);
    const agent = agents.find((item) => item.id === agentId);
    setLive(`${task?.title ?? taskId} → ${agent?.name ?? agentId}`);
    setPicked(null);
    onAssign(taskId, agentId);
  }

  return (
    <div className="ui-dbc" data-testid="delegate-board" onKeyDown={(event) => {
      if (!picked) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < agents.length) {
        event.preventDefault();
        assign(picked, agents[index].id);
      }
    }}>
      <div className="ui-dbc__card">
        <header className="ui-dbc__bar">
          <span className="ui-dbc__spark"><Spark /></span>
          <span className="ui-dbc__title">Delegate</span>
          <span className="ui-dbc__hint">Drag a task onto an agent</span>
          <button type="button" className="ui-dbc__auto" role="switch" aria-checked={auto} onClick={() => {
            const next = !auto;
            setAuto(next);
            if (!next) return;
            const free = agents.find((agent) => !agent.busy) ?? agents[0];
            if (free && tasks[0]) assign(tasks[0].id, free.id);
          }}>
            <span className="ui-dbc__auto-label">Auto</span>
            <span className="ui-dbc__switch" data-on={auto ? "" : undefined}><span /></span>
          </button>
        </header>
        <div className="ui-dbc__body">
          <section className="ui-dbc__pile" data-pile="">
            <h4 className="ui-dbc__head">
              Unassigned <span className="ui-dbc__count">{tasks.length}</span>
            </h4>
            <ul className="ui-dbc__tasks">
              {tasks.map((task) => (
                <li key={task.id} className="ui-dbc__task-slot">
                  <button
                    type="button"
                    className="ui-dbc__task"
                    data-task-id={task.id}
                    draggable
                    aria-pressed={picked === task.id}
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
                    onClick={() => setPicked(task.id)}
                  >
                    <span className="ui-dbc__grip" aria-hidden="true" />
                    <span className="ui-dbc__task-main">
                      <span className="ui-dbc__task-title">{task.title}</span>
                      <span className="ui-dbc__task-meta">{task.meta}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="ui-dbc__agents">
            <h4 className="ui-dbc__head">
              Agents <span className="ui-dbc__spend">{agents.reduce((sum, agent) => sum + agent.queue.length, 0)} in queues</span>
            </h4>
            <ul className="ui-dbc__roster">
              {agents.map((agent, index) => (
                <li
                  key={agent.id}
                  className="ui-dbc__agent"
                  data-agent={agent.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/plain") || picked;
                    if (taskId) assign(taskId, agent.id);
                  }}
                >
                  <span className="ui-dbc__avatar">
                    <Mark letter={agent.name} />
                  </span>
                  <span className="ui-dbc__who">
                    <span className="ui-dbc__name-line">
                      <span className="ui-dbc__name">{agent.name}</span>
                      <span className="ui-dbc__key">{index + 1}</span>
                    </span>
                    <span className="ui-dbc__model">
                      <span className="ui-dbc__model-text">{agent.model}</span>
                      <span className="ui-dbc__rate">{agent.rate}</span>
                    </span>
                  </span>
                  <span className="ui-dbc__load">
                    <span className="ui-dbc__tag" data-kind={agent.busy ? "busy" : "free"}>
                      {agent.busy ? `Busy until ${agent.busy}` : "Free"}
                    </span>
                  </span>
                  <ul className="ui-dbc__queue" aria-label={`${agent.name}'s queue`}>
                    {agent.queue.map((chip) => (
                      <li key={chip.id} className="ui-dbc__chip-slot">
                        <button type="button" className="ui-dbc__chip" data-chip-id={chip.id} data-running={chip.running ? "" : undefined} title={chip.title}>
                          <span className="ui-dbc__chip-title">{chip.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <p className="ui-dbc__sr" id="how">
          {live}
        </p>
      </div>
    </div>
  );
}
