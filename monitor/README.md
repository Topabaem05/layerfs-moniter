# Improvement branch studio

A local monitor for cutting a better LayerFS improvement branch from the
history that is already published in this checkout.

## What it shows

LayerFS keeps one shared history. Agents do their work on branches. This screen
reads `git log` for the repo that contains `monitor/` and maps that history
like this:

| Studio piece | LayerFS data |
| --- | --- |
| Agent tree | One scout per subsystem that recent commits actually touched (`engine`, `core`, `api`, `plugins`, `docs`, `tools`). Cost is the commit count, not a model bill. The scout for the newest subsystem waits for a choice. |
| Decision tree | The open question is which subsystem the next improvement branch should start from, then which published commit it should carry, then whether that choice is handed to the ticket desk. The agent's pick is the newest real commit. Risky subjects (abort, dirty, unmount, custody) are flagged. |
| Handoff | History scout → branch cutter → ticket desk. Files from the newest commit travel with the handoff. Paths past the first three are marked lost, with a reason, and can be added back. |
| Ledger | Published commits are irreversible rows (`Published on main`). Choices made in the studio are undoable. A filed ticket depends on the chosen base and cannot be silently deleted. Each saved experiment field is another irreversible row (`Recorded hypothesis`, `Updated results`, …). |
| Experiment | One record per improvement branch (`subsystem:commit`). Hypothesis/goal, approach, setup, parameters, what was run, results, conclusion, and created/updated timestamps. Edits append to that branch’s log. Empty fields are marked lost on the handoff. |
| Ticket desk | The chosen branch becomes a Falsify ticket. Creation runs the vendored state machine: DRAFT → QUEUED → ELIGIBLE, with the rank score computed only by the Falsify domain. The ticket’s hypothesis, instruction and rationale include the experiment record. Cancel uses the same machine; a second cancel is rejected. |

Merge commits are left out so the tree shows the change, not the merge wrapper.

Experiment rows in the ledger are an audit of saves. Editing a field appends a new row; it does not rewrite the earlier one. The form is how a record is changed. Parameters are free text, not a checked LayerFS config. The branch key is the subsystem plus the published commit, because this screen reads git rather than a live daemon Store.

## Run

From `monitor/`, with Node 22:

```bash
npm install
npm test
npm run dev
```

Open http://127.0.0.1:5173 . The page reads this checkout through `git` on each
`/api/studio` request. Tickets are written to `monitor/.data/tickets.json` and
experiment records to `monitor/.data/experiments.json` (both gitignored).

```bash
npm run build
npm run preview
```

There is no preview deployment configured for this repository.

## Licenses

See [NOTICE.md](NOTICE.md). The four affectUI components named in the task are
Pro and were not copied. Ticket creation is the MIT kernel from
[Topabaem05/Falsify](https://github.com/Topabaem05/Falsify).
