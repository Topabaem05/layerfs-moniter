/**
 * Scheduled Runs. Class structure follows `.ui-srn`.
 * Session cells show a percent-of-budget bar. Over-budget drops are refused.
 */
import { useState } from "react";

import { canBook, cellUsed } from "../schedule.js";
import { Mark, Spark } from "./marks.js";

export interface RunCard {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  detail: string;
  percent: number;
  stats: string;
}

export interface RunSlot {
  cardId: string;
  cell: number;
  agentId: string;
  percent: number;
}

const HOURS = ["07:00", "12:00", "17:00"];

export function ScheduledRuns({
  cards,
  slots,
  days,
  agents,
  onBook,
}: {
  cards: RunCard[];
  slots: RunSlot[];
  days: { label: string; date: string; today?: boolean }[];
  agents: { id: string; name: string }[];
  onBook: (slots: RunSlot[]) => void;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "manual">("manual");
  const [note, setNote] = useState("");
  const booked = new Set(slots.map((slot) => slot.cardId));
  const waiting = cards.filter((card) => !booked.has(card.id) && (!filter || card.agentId === filter));

  function book(cardId: string, cell: number) {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const used = cellUsed(slots, cell);
    if (!canBook(used, card.percent)) {
      setNote(`${card.title} needs ${card.percent}% and the session already has ${used}%.`);
      return;
    }
    const next = [...slots.filter((slot) => slot.cardId !== cardId), { cardId, cell, agentId: card.agentId, percent: card.percent }];
    setNote(`${card.title} booked.`);
    onBook(next);
  }

  function autoPack() {
    let next = [...slots];
    for (const card of cards) {
      if (next.some((slot) => slot.cardId === card.id)) continue;
      const cell = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((index) => canBook(cellUsed(next, index), card.percent));
      if (cell === undefined) continue;
      next = [...next, { cardId: card.id, cell, agentId: card.agentId, percent: card.percent }];
    }
    setNote("Auto packed the runs that fit.");
    onBook(next);
  }

  return (
    <div className="ui-srn" style={{ ["--ui-srn-days" as string]: String(days.length) }} data-testid="scheduled-runs">
      <div className="ui-srn__bar">
        <div className="ui-srn__heading">
          <span className="ui-srn__title">This week</span>
          <span className="ui-srn__note">5-hour sessions</span>
        </div>
        <div className="ui-srn__tools">
          <div className="ui-srn__crew" role="group" aria-label="Show one agent's tasks">
            {agents.slice(0, 3).map((agent, index) => (
              <button
                key={agent.id}
                type="button"
                className="ui-srn__agent"
                aria-pressed={filter === agent.id}
                style={{ zIndex: 3 - index }}
                onClick={() => setFilter((current) => (current === agent.id ? null : agent.id))}
              >
                <Mark letter={agent.name} />
                <span className="ui-srn__agent-name">{agent.name}</span>
              </button>
            ))}
          </div>
          <span className="ui-srn__total">{cards.length} tasks</span>
          <div className="ui-srn__modes" role="radiogroup" aria-label="Scheduling">
            <button type="button" aria-checked={mode === "auto"} onClick={() => { setMode("auto"); autoPack(); }}>
              <Spark /> Auto
            </button>
            <button type="button" aria-checked={mode === "manual"} onClick={() => setMode("manual")}>
              Manual
            </button>
          </div>
        </div>
      </div>
      <div className="ui-srn__body">
        <section className="ui-srn__stack" aria-label="To schedule">
          <header className="ui-srn__stack-head">
            To schedule <span className="ui-srn__count">{waiting.length}</span>
          </header>
          {waiting.length === 0 ? <p className="ui-srn__empty">Everything's scheduled</p> : null}
          <ul className="ui-srn__cards">
            {waiting.map((card) => (
              <li key={card.id} className="ui-srn__slot">
                <div className="ui-srn__tile ui-srn__card" data-card={card.id} data-movable="true" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", card.id)}>
                  <div className="ui-srn__tile-top">
                    <Mark letter={card.agentName} />
                    <span className="ui-srn__tile-title">{card.title}</span>
                  </div>
                  <div className="ui-srn__tile-meta">{card.agentName} · {card.detail}</div>
                  <div className="ui-srn__tile-stats">
                    <span className="ui-srn__stat">{card.stats}</span>
                    <span className="ui-srn__tag">{card.percent}%</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <div className="ui-srn__scroll">
          <div className="ui-srn__week" role="grid" aria-label="This week">
            <div className="ui-srn__corner" />
            {days.map((day) => (
              <div key={day.date} className="ui-srn__day" data-today={day.today ? "" : undefined}>
                {day.label} <b>{day.date}</b>
              </div>
            ))}
            {HOURS.map((hour, row) => (
              <div key={hour} className="ui-srn__row">
                <div className="ui-srn__time">{hour}</div>
                {days.map((day, column) => {
                  const cell = column * 3 + row;
                  const used = cellUsed(slots, cell);
                  const chips = slots.filter((slot) => slot.cell === cell);
                  return (
                    <div
                      key={day.date}
                      className="ui-srn__cell"
                      role="gridcell"
                      data-cell={cell}
                      title={`${used}% of the session limit booked`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        book(event.dataTransfer.getData("text/plain"), cell);
                      }}
                    >
                      <ul className="ui-srn__chips">
                        {chips.map((slot) => {
                          const card = cards.find((item) => item.id === slot.cardId);
                          if (!card || (filter && card.agentId !== filter)) return null;
                          return (
                            <li key={slot.cardId} className="ui-srn__tile ui-srn__chip" data-chip={slot.cardId} data-movable="true">
                              <span className="ui-srn__tile-title">{card.title}</span>
                              <span className="ui-srn__tag">{card.percent}%</span>
                            </li>
                          );
                        })}
                      </ul>
                      <span className="ui-srn__use">
                        <i style={{ width: `${Math.min(100, used)}%` }} />
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="ui-srn__sr" aria-live="polite">{note}</p>
    </div>
  );
}
