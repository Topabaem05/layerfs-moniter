/**
 * Agent Handoff. Class structure follows the live affectUI DOM (`.ui-ahc`).
 * Styles are ours. Marks are letters, not vendor logos.
 */
import { useState } from "react";

import { KindIcon, Mark, Spin } from "./marks.js";

export interface HandoffPerson {
  id: string;
  name: string;
  model: string;
  cost: string;
  status: "idle" | "working";
  description: string;
  now: "idle" | "working" | "upnext";
  task?: string;
  note?: string;
  more?: number;
}

export interface HandoffLaneItem {
  id: string;
  label: string;
  kind?: string;
  lost?: boolean;
  why?: string;
}

export interface HandoffCard {
  id: string;
  title: string;
  status: "working" | "done";
  items: HandoffLaneItem[];
}

export interface HandoffLane {
  from: string;
  to: string;
  cards: HandoffCard[];
}

const OPACITY = [0.06, 0.13, 0.27, 0.4, 0.53, 0.67, 0.8, 0.93, 0.93, 0.8, 0.67, 0.53, 0.4, 0.27, 0.13, 0.06];
const IN_PATH = "M106 152V178Q106 188 116 188H188Q198 188 198 198V224";
const OUT_PATH = "M226 224V198Q226 188 236 188H308Q318 188 318 178V152";
const IN_PATH_2 = "M318 152V178Q318 188 328 188H400Q410 188 410 198V224";
const OUT_PATH_2 = "M438 224V198Q438 188 448 188H520Q530 188 530 178V152";
const DOTS = [
  [106, 152],
  [198, 224],
  [226, 224],
  [318, 152],
  [410, 224],
  [438, 224],
  [530, 152],
];

function Streaks({ d, on }: { d: string; on?: boolean }) {
  return (
    <g className="ui-ahc__light">
      {OPACITY.map((opacity, index) => (
        <path
          key={index}
          className="ui-ahc__streak"
          d={d}
          data-on={on ? "" : undefined}
          style={{ ["--len" as string]: "164px", ["--shift" as string]: `${index * 3}px`, ["--o" as string]: String(opacity) }}
        />
      ))}
    </g>
  );
}

function Lines() {
  const pairs = [
    [IN_PATH, OUT_PATH],
    [IN_PATH_2, OUT_PATH_2],
  ];
  return (
    <>
      <svg className="ui-ahc__lines" viewBox="0 0 636 280" aria-hidden="true">
        {pairs.map(([inbound, outbound], index) => (
          <g key={index} data-passed="">
            <path className="ui-ahc__line" d={inbound} />
            <Streaks d={inbound} />
            <path className="ui-ahc__line" d={outbound} />
            <Streaks d={outbound} on />
          </g>
        ))}
      </svg>
      <svg className="ui-ahc__lines ui-ahc__top-layer" viewBox="0 0 636 280" aria-hidden="true">
        {DOTS.map(([x, y]) => (
          <circle key={`${x}-${y}`} className="ui-ahc__dot" data-passed="" cx={x} cy={y} r="3.25" />
        ))}
      </svg>
    </>
  );
}

export function AgentHandoff({
  agents,
  lanes,
  onOpen,
}: {
  agents: HandoffPerson[];
  lanes: HandoffLane[];
  onOpen?: (card: HandoffCard) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const people = agents.slice(0, 3);
  return (
    <div className="ui-ahc" style={{ ["--n" as string]: String(people.length) }} data-testid="agent-handoff">
      <Lines />
      <div className="ui-ahc__flow">
        {people.map((agent, index) => (
          <div
            key={agent.id}
            className="ui-ahc__agent"
            data-status={agent.status}
            data-i={index}
            role="button"
            tabIndex={0}
            aria-expanded={false}
            style={{ ["--c" as string]: String(index * 2 + 1) }}
          >
            <span className="ui-ahc__top">
              <span className="ui-ahc__face">
                <Mark letter={agent.name} tone={agent.id} />
              </span>
              <span className="ui-ahc__who">
                <span className="ui-ahc__name">{agent.name}</span>
                <span className="ui-ahc__model">{agent.model}</span>
              </span>
              <span className="ui-ahc__cost">{agent.cost}</span>
              <span className="ui-ahc__status" data-status={agent.status}>
                <span className="ui-ahc__swap ui-ahc__status-word">
                  <span className="ui-ahc__swap-layer" data-leaving="" aria-hidden="true">
                    {agent.status === "working" ? "Idle" : "Working"}
                  </span>
                  <span className="ui-ahc__swap-layer" data-coming="">
                    {agent.status === "working" ? "Working" : "Idle"}
                  </span>
                </span>
              </span>
            </span>
            <span className="ui-ahc__desc">{agent.description}</span>
            <span className="ui-ahc__now">
              <span className="ui-ahc__swap">
                <span className="ui-ahc__swap-layer" data-coming="">
                  {agent.now === "upnext" && agent.task ? (
                    <span className="ui-ahc__now-idle">
                      Up next <span className="ui-ahc__now-task">{agent.task}</span>
                      {agent.more ? <span className="ui-ahc__now-more">+{agent.more}</span> : null}
                    </span>
                  ) : agent.now === "working" && agent.task ? (
                    <>
                      <span className="ui-ahc__now-task">{agent.task}</span>
                      <span className="ui-ahc__now-note ui-ahc__shine">{agent.note ?? "Working"}</span>
                    </>
                  ) : (
                    <span className="ui-ahc__now-idle">Ready for a task</span>
                  )}
                </span>
              </span>
            </span>
          </div>
        ))}
        {lanes.slice(0, 2).map((lane, index) => {
          const from = people.find((agent) => agent.id === lane.from);
          const to = people.find((agent) => agent.id === lane.to);
          return (
            <section
              key={`${lane.from}-${lane.to}`}
              className="ui-ahc__col"
              aria-label={`Handed from ${from?.name ?? lane.from} to ${to?.name ?? lane.to}`}
              style={{ ["--c" as string]: String(index * 2 + 2) }}
            >
              <span className="ui-ahc__col-head">
                <span className="ui-ahc__col-who">
                  <Mark letter={from?.name ?? "?"} />
                  <span>{from?.name}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 6h7M7 3.5 9.5 6 7 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  <Mark letter={to?.name ?? "?"} />
                  <span>{to?.name}</span>
                </span>
                <span className="ui-ahc__lane-n">{lane.cards.length}</span>
              </span>
              <ul className="ui-ahc__cards">
                {lane.cards.map((card) => {
                  const open = openId === card.id;
                  const lost = card.items.some((item) => item.lost);
                  return (
                    <li key={card.id} className="ui-ahc__card" data-status={card.status} data-lost={lost ? "" : undefined}>
                      <button
                        type="button"
                        className="ui-ahc__card-main"
                        data-movable=""
                        aria-expanded={open}
                        aria-pressed={open}
                        onClick={() => {
                          setOpenId(open ? null : card.id);
                          onOpen?.(card);
                        }}
                      >
                        <span className="ui-ahc__card-top">
                          <span className="ui-ahc__card-mark">
                            <Mark letter={card.title} />
                          </span>
                          <span className="ui-ahc__card-title">{card.title}</span>
                        </span>
                        <span className="ui-ahc__card-desc">{card.items.map((item) => item.label).join(", ")}</span>
                        <span className="ui-ahc__card-foot">
                          <span className="ui-ahc__swap ui-ahc__card-state">
                            <span className="ui-ahc__swap-layer" data-coming="">
                              {card.status === "working" ? <Spin /> : <span className="ui-ahc__done-dot" />}
                              <span className="ui-ahc__card-word">{card.status === "working" ? `With ${to?.name ?? "next"}` : "Looks good"}</span>
                            </span>
                          </span>
                        </span>
                      </button>
                      <div className="ui-ahc__fold" inert={open ? undefined : true} data-open={open ? "" : undefined}>
                        <div className="ui-ahc__clip">
                          <ul className="ui-ahc__items">
                            {card.items.map((item) => (
                              <li key={item.id} className="ui-ahc__item-wrap">
                                <button type="button" className="ui-ahc__item" data-lost={item.lost ? "" : undefined} title={item.why}>
                                  <KindIcon kind={item.lost ? "lost" : item.kind} />
                                  <span className="ui-ahc__label">{item.label}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
