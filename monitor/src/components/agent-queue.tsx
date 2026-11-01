/**
 * Agent Queue. Class structure follows `.ui-agqc`. Jobs are Falsify ticket states.
 */
import { useState } from "react";

import { Mark } from "./marks.js";

export interface QueueJob {
  id: string;
  name: string;
  status: "queued" | "running" | "done" | "failed";
  meta: string;
  kind?: "llm" | "agent" | "tool";
}

export interface QueueWorker {
  id: string;
  name: string;
}

const DEPTH = [4, 6, 5, 8, 7, 9, 6, 11, 8, 7, 5, 4];

export function AgentQueue({
  jobs,
  workers,
  onOpen,
}: {
  jobs: QueueJob[];
  workers: QueueWorker[];
  onOpen?: (job: QueueJob) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(Math.min(4, Math.max(1, workers.length || 1)));
  const shown = workers.slice(0, count);
  const queued = jobs.filter((job) => job.status === "queued");
  const running = jobs.find((job) => job.status === "running");
  const done = jobs.filter((job) => job.status === "done").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const chips = queued.slice(0, 3);
  const squares = queued.slice(3, 11);

  return (
    <div className="ui-agqc" data-state={paused ? "paused" : "live"} style={{ ["--ui-agqc-ymax" as string]: "24" }} data-testid="agent-queue">
      <header className="ui-agqc__head">
        <span className="ui-agqc__mark" aria-hidden="true" />
        <span className="ui-agqc__title">Queue</span>
        <span className="ui-agqc__name">branch-jobs</span>
        <span className="ui-agqc__pill" data-status={paused ? "paused" : "live"}>
          <span className="ui-agqc__pulse" />
          {paused ? "Paused" : "Live"}
        </span>
        <span className="ui-agqc__tools">
          <button type="button" className="ui-agqc__btn" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <span className="ui-agqc__stepper" role="group" aria-label="Workers">
            <button type="button" onClick={() => setCount((value) => Math.max(1, value - 1))} aria-label="Fewer workers">
              −
            </button>
            <output className="ui-agqc__stepper-value">{count}</output>
            <button type="button" onClick={() => setCount((value) => Math.min(4, value + 1))} aria-label="More workers">
              +
            </button>
          </span>
        </span>
      </header>
      <div className="ui-agqc__card">
        <dl className="ui-agqc__stats">
          <div className="ui-agqc__stat">
            <dt>Waiting</dt>
            <dd className="ui-agqc__num">{queued.length}</dd>
          </div>
          <div className="ui-agqc__stat">
            <dt>Running</dt>
            <dd className="ui-agqc__num">
              {running ? 1 : 0}
              <span className="ui-agqc__of">/{count}</span>
            </dd>
          </div>
          <div className="ui-agqc__stat">
            <dt>Throughput</dt>
            <dd className="ui-agqc__num">{done}</dd>
          </div>
          <div className="ui-agqc__stat">
            <dt>Failed</dt>
            <dd className="ui-agqc__num">{failed}</dd>
          </div>
        </dl>
        <div className="ui-agqc__flow">
          <span className="ui-agqc__colhead" style={{ transform: "translate(16px, 14px)" }}>
            Queue {queued.length}
          </span>
          <span className="ui-agqc__colhead" style={{ transform: "translate(228px, 14px)" }}>
            Workers {running ? 1 : 0}/{count}
          </span>
          <div className="ui-agqc__well" />
          {shown.map((worker, index) => (
            <div key={worker.id} className="ui-agqc__slot" data-busy={index === 0 && running ? "" : undefined} style={{ transform: `translate(228px, ${40 + index * 46}px)` }}>
              <span className="ui-agqc__who">
                <Mark letter={worker.name} />
                <span className="ui-agqc__who-name">{worker.name}</span>
              </span>
              <span className="ui-agqc__rail">{index === 0 && running ? "" : "Idle"}</span>
            </div>
          ))}
          <div className="ui-agqc__bin" data-kind="done" style={{ transform: "translate(528px, 40px)" }}>
            <span>Done</span>
            <b className="ui-agqc__bin-count">{done}</b>
          </div>
          <div className="ui-agqc__bin" data-kind="failed" style={{ transform: "translate(528px, 133px)" }}>
            <span>Failed</span>
            <b className="ui-agqc__bin-count">{failed}</b>
          </div>
          <div className="ui-agqc__jobs">
            {chips.map((job, index) => (
              <button
                key={job.id}
                type="button"
                className="ui-agqc__job"
                data-shape="chip"
                data-kind={job.kind ?? "agent"}
                data-status="queued"
                style={{ transform: `translate(16px, ${40 + index * 32}px)`, width: 188, height: 28 }}
                onClick={() => onOpen?.(job)}
              >
                <span className="ui-agqc__job-in">
                  <span className="ui-agqc__job-name">{job.name}</span>
                  <span className="ui-agqc__job-meta">{job.meta}</span>
                </span>
              </button>
            ))}
            {squares.map((job, index) => (
              <button
                key={job.id}
                type="button"
                className="ui-agqc__job"
                data-shape="square"
                data-status="queued"
                title={job.name}
                style={{ transform: `translate(${24 + index * 17}px, 148px)`, width: 12, height: 12 }}
                onClick={() => onOpen?.(job)}
              />
            ))}
            {running ? (
              <button
                type="button"
                className="ui-agqc__job"
                data-shape="bar"
                data-status="running"
                style={{ transform: "translate(340px, 46px)", width: 158, height: 28, ["--p" as string]: "0.6" }}
                onClick={() => onOpen?.(running)}
              >
                <span className="ui-agqc__fill" />
                <span className="ui-agqc__job-in">
                  <span className="ui-agqc__job-name">{running.name}</span>
                </span>
              </button>
            ) : null}
          </div>
        </div>
        <div className="ui-agqc__chart">
          <div className="ui-agqc__chart-head">Queue depth</div>
          <div className="ui-agqc__plot" role="img" aria-label="Commit arrivals over the recent window">
            <svg viewBox="0 0 578 112" width="100%" height="112">
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                points={DEPTH.map((value, index) => `${(index / (DEPTH.length - 1)) * 560 + 8},${100 - value * 6}`).join(" ")}
              />
            </svg>
            <span className="ui-agqc__axis">recent</span>
            <span className="ui-agqc__axis ui-agqc__axis--now">now</span>
          </div>
        </div>
        <div className="ui-agqc__sr" aria-live="polite">
          {paused ? "Queue paused" : `${queued.length} waiting, ${running ? "1 running" : "workers idle"}`}
        </div>
      </div>
    </div>
  );
}
