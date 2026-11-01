/**
 * Experiment and methodology for one improvement branch.
 * The saved record is what the ledger, the handoff and the ticket copy.
 */
import type { ExperimentDraft, ExperimentRecord } from "../experiment.js";

export interface ExperimentPanelProps {
  draft: ExperimentDraft | null;
  saved?: ExperimentRecord;
  saving: boolean;
  message: string | null;
  onChange: (draft: ExperimentDraft) => void;
  onSave: () => void;
}

const FIELDS: { key: keyof ExperimentDraft; label: string; hint: string; rows: number }[] = [
  { key: "hypothesis", label: "Hypothesis / goal", hint: "What this branch is trying to improve.", rows: 3 },
  { key: "approach", label: "Approach", hint: "The method, in a few sentences.", rows: 3 },
  { key: "setup", label: "Setup", hint: "Checkout, store profile, mounts, what is held constant.", rows: 2 },
  { key: "parameters", label: "Parameters / config", hint: "Flags, limits, worker counts.", rows: 2 },
  { key: "runs", label: "What was run", hint: "Commands, tests, or the manual pass.", rows: 2 },
  { key: "results", label: "Results / metrics", hint: "What came back. Keep the numbers.", rows: 2 },
  { key: "conclusion", label: "Conclusion", hint: "Keep the branch, change it, or drop it.", rows: 2 },
];

export function ExperimentPanel({ draft, saved, saving, message, onChange, onSave }: ExperimentPanelProps) {
  return (
    <section id="experiment-log" className="experiment" data-testid="experiment-log">
      <header>
        <h2>Experiment</h2>
        <p>Stored with the branch. The ledger is the log of these fields. Handoff and the ticket take a copy.</p>
      </header>
      {draft === null ? (
        <p className="ticket-empty">Choose a published change in the decision tree to open its experiment record.</p>
      ) : (
        <>
          <p className="experiment-branch">
            {draft.areaLabel} · {draft.commitShort} — {draft.subject}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            {FIELDS.map((field) => (
              <label key={field.key}>
                <span>
                  {field.label}
                  <small>{field.hint}</small>
                </span>
                <textarea
                  rows={field.rows}
                  value={draft[field.key]}
                  onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })}
                />
              </label>
            ))}
            <div className="experiment-actions">
              <button type="submit" data-testid="save-experiment" disabled={saving}>
                {saving ? "Saving…" : saved ? "Save edits" : "Save experiment"}
              </button>
              {saved ? (
                <p>
                  Created {saved.createdAt} · updated {saved.updatedAt} · {saved.log.length} log{" "}
                  {saved.log.length === 1 ? "row" : "rows"}
                </p>
              ) : (
                <p>Not saved yet. Empty methodology is marked lost on the handoff.</p>
              )}
            </div>
            {message ? <p role="status">{message}</p> : null}
          </form>
          {saved ? (
            <dl className="experiment-saved" data-testid="experiment-saved">
              {FIELDS.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{saved[field.key] === "" ? "—" : saved[field.key]}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      )}
    </section>
  );
}
