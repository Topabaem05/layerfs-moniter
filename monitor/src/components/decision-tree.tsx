/**
 * Decision tree.
 *
 * Original implementation of the public affectUI Decision Tree props, keyboard
 * and accessibility contract (https://www.affectui.com/components/decision-tree).
 * The Pro source is not in this repo: the registry returns 401 without an
 * access key, and the Pro license forbids publishing that source. See
 * monitor/NOTICE.md.
 */
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { Decision, DecisionFlag, DecisionOption, DecisionText } from "../model.js";

export type { Decision, DecisionOption, DecisionText };

export type DecisionChoice = { index: number; option: DecisionOption } | { other: string };

export interface DecisionTreeHandle {
  hover: (index: number | null) => void;
  choose: (index: number) => void;
  setOther: (text: string) => void;
  send: () => void;
  next: () => void;
  previous: () => void;
  peek: () => void;
}

export interface DecisionTreeProps {
  decisions: Decision[];
  onChoose?: (decision: Decision, choice: DecisionChoice) => string | void | Promise<string | void>;
  allowOther?: boolean;
  title?: string;
  className?: string;
}

function isFlag(part: string | DecisionFlag): part is DecisionFlag {
  return typeof part !== "string";
}

function optionName(option: DecisionOption): string {
  return option.pick ? `${option.label}, the agent's pick` : option.label;
}

export const DecisionTree = forwardRef<DecisionTreeHandle, DecisionTreeProps>(function DecisionTree(
  { decisions, onChoose, allowOther = true, title = "Decisions", className },
  ref,
) {
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [flagId, setFlagId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const otherRef = useRef<HTMLTextAreaElement>(null);
  const reactId = useId();
  const decision = decisions[Math.min(index, Math.max(decisions.length - 1, 0))];

  const flags = useMemo(() => {
    const found: { id: string; flag: DecisionFlag }[] = [];
    decision?.options.forEach((option, optionIndex) => {
      option.effects?.forEach((effect, effectIndex) => {
        if (typeof effect === "string") return;
        effect.forEach((part, partIndex) => {
          if (isFlag(part)) found.push({ id: `${reactId}-${optionIndex}-${effectIndex}-${partIndex}`, flag: part });
        });
      });
    });
    return found;
  }, [decision, reactId]);

  useEffect(() => {
    setHover(null);
    setOtherOpen(false);
    setOtherText("");
    setFlagId(null);
    setBusy(false);
  }, [decision?.id]);

  useEffect(() => {
    if (otherOpen) otherRef.current?.focus();
  }, [otherOpen]);

  async function choose(optionIndex: number) {
    if (!decision || busy) return;
    const option = decision.options[optionIndex];
    if (!option) {
      setOtherOpen(true);
      setLive("Other is open. Write an instruction and press Enter.");
      return;
    }
    setBusy(true);
    setLive(`Approved, running: ${option.label}`);
    try {
      const answer = await onChoose?.(decision, { index: optionIndex, option });
      if (typeof answer === "string" && answer.trim() !== "") setLive(answer);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!decision || busy) return;
    const text = otherText.trim();
    if (text === "") return;
    setBusy(true);
    setLive(`Instruction sent: ${text}`);
    try {
      const answer = await onChoose?.(decision, { other: text });
      if (typeof answer === "string" && answer.trim() !== "") setLive(answer);
      setOtherOpen(false);
      setOtherText("");
    } finally {
      setBusy(false);
    }
  }

  function peek() {
    if (flags.length === 0) return;
    const current = flags.findIndex((flag) => flag.id === flagId);
    const next = flags[(current + 1) % flags.length];
    if (!next) return;
    setFlagId(next.id);
    document.getElementById(next.id)?.focus();
  }

  useImperativeHandle(ref, () => ({
    hover: setHover,
    choose,
    setOther: setOtherText,
    send: () => void send(),
    next: () => setIndex((value) => Math.min(decisions.length - 1, value + 1)),
    previous: () => setIndex((value) => Math.max(0, value - 1)),
    peek,
  }));

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!decision) return;
    if (event.key === "Escape") {
      setOtherOpen(false);
      setFlagId(null);
      return;
    }
    if (event.key === "f" || event.key === "F") {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      peek();
      return;
    }
    const typing = event.target instanceof HTMLTextAreaElement;
    if (typing) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void send();
      }
      return;
    }
    if (event.key === "ArrowRight" || event.key === "j" || event.key === "J") {
      event.preventDefault();
      setIndex((value) => Math.min(decisions.length - 1, value + 1));
    } else if (event.key === "ArrowLeft" || event.key === "k" || event.key === "K") {
      event.preventDefault();
      setIndex((value) => Math.max(0, value - 1));
    } else if (/^[1-9]$/.test(event.key)) {
      const number = Number(event.key);
      event.preventDefault();
      if (number <= decision.options.length) void choose(number - 1);
      else if (allowOther && number === decision.options.length + 1) {
        setOtherOpen(true);
        setLive("Other is open. Write an instruction and press Enter.");
      }
    }
  }

  if (!decision) {
    return (
      <section className={["ui-dct", className].filter(Boolean).join(" ")} aria-label={title}>
        <p className="ui-dct-empty">No decision is waiting.</p>
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      className={["ui-dct", className].filter(Boolean).join(" ")}
      aria-label={title}
      onKeyDown={onKeyDown}
      data-testid="decision-tree"
    >
      <header className="ui-dct-bar">
        <h2>
          <span className="ui-spark" aria-hidden="true" />
          {title}
        </h2>
        <p>{decisions.length} waiting for you</p>
        <p className="ui-dct-page">
          {index + 1} of {decisions.length}
        </p>
      </header>
      <div className="ui-dct-flow">
        <div className="ui-dct-question">
          {decision.risk && decision.risk !== "low" ? (
            <span className={`ui-dct-risk ui-dct-risk-${decision.risk}`}>{decision.risk} risk</span>
          ) : null}
          <p className="ui-dct-who">
            <span className="ui-agt-mark" aria-hidden="true">
              {decision.agent.slice(0, 1)}
            </span>
            <strong>{decision.agent}</strong>
            {decision.model ? <small>{decision.model}</small> : null}
          </p>
          <h3>{decision.question}</h3>
          {decision.context ? <p>{decision.context}</p> : null}
        </div>
        <ul className="ui-dct-branches">
          {decision.options.map((option, optionIndex) => {
            const active = hover === optionIndex;
            return (
              <li key={option.label} className={active ? "is-hot" : undefined} data-pick={option.pick ? "true" : "false"}>
                <button
                  type="button"
                  className="ui-dct-branch"
                  aria-keyshortcuts={String(optionIndex + 1)}
                  aria-label={optionName(option)}
                  disabled={busy}
                  onMouseEnter={() => setHover(optionIndex)}
                  onMouseLeave={() => setHover((value) => (value === optionIndex ? null : value))}
                  onFocus={() => setHover(optionIndex)}
                  onClick={() => void choose(optionIndex)}
                >
                  <span className="ui-dct-key" aria-hidden="true">
                    {optionIndex + 1}
                  </span>
                  <span>{option.label}</span>
                  {option.pick ? <em>Agent’s pick</em> : null}
                </button>
                <ul className="ui-dct-effects">
                  {option.effects?.map((effect, effectIndex) => (
                    <li key={effectIndex}>
                      <EffectLine
                        effect={effect}
                        openId={flagId}
                        onToggle={setFlagId}
                        idBase={`${reactId}-${optionIndex}-${effectIndex}`}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          {allowOther ? (
            <li>
              {otherOpen ? (
                <label className="ui-dct-other">
                  <span>Other instruction</span>
                  <textarea
                    ref={otherRef}
                    rows={2}
                    value={otherText}
                    placeholder="Tell the branch cutter what to do instead"
                    onChange={(event) => setOtherText(event.target.value)}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  className="ui-dct-branch ui-dct-branch-other"
                  aria-keyshortcuts={String(decision.options.length + 1)}
                  onClick={() => setOtherOpen(true)}
                >
                  <span className="ui-dct-key" aria-hidden="true">
                    {decision.options.length + 1}
                  </span>
                  <span>Other…</span>
                </button>
              )}
            </li>
          ) : null}
        </ul>
      </div>
      <p className="ui-dct-live" aria-live="polite">
        {live}
      </p>
      <p className="ui-dct-hint">Keys 1–{decision.options.length + (allowOther ? 1 : 0)} choose a branch. F shows the next note.</p>
    </section>
  );
});

function EffectLine({
  effect,
  openId,
  onToggle,
  idBase,
}: {
  effect: DecisionText;
  openId: string | null;
  onToggle: (id: string | null) => void;
  idBase: string;
}) {
  if (typeof effect === "string") return <span>{effect}</span>;
  const nodes: ReactNode[] = [];
  effect.forEach((part, partIndex) => {
    if (!isFlag(part)) {
      nodes.push(<span key={partIndex}>{part}</span>);
      return;
    }
    const id = `${idBase}-${partIndex}`;
    const noteId = `${id}-note`;
    const open = openId === id;
    nodes.push(
      <span key={id} className="ui-dct-flag">
        <button
          id={id}
          type="button"
          aria-describedby={noteId}
          aria-expanded={open}
          onClick={() => onToggle(open ? null : id)}
        >
          {part.text}
        </button>
        <span id={noteId} role="tooltip" hidden={!open}>
          {part.note}
          {part.source ? <cite> {part.source}</cite> : null}
        </span>
      </span>,
    );
  });
  return <>{nodes}</>;
}
