import { describe, expect, it } from "vitest";

import { draftFromBranch } from "./followups.js";
import {
  applyExperiment,
  experimentHandoffItems,
  ledgerFromRecord,
  recordExperiment,
  seedExperiment,
} from "./experiment.js";
import type { HistoryArea, HistoryCommit } from "./model.js";

const area: HistoryArea = {
  id: "engine",
  label: "Engine",
  risk: "high",
  blurb: "the daemon, FUSE, the overlay and the Store",
  commits: [],
};

const commit: HistoryCommit = {
  sha: "69fedcacf000",
  short: "69fedcacf",
  subject: "fix(daemon): preserve automatic unmount abort custody",
  at: 1_000,
  files: ["engine/crates/layerfs-daemon/src/control/unmount.rs"],
  area: "engine",
};

describe("experiment records", () => {
  it("appends a log row only for fields that changed and keeps createdAt", () => {
    let id = 0;
    const seeded = seedExperiment(area, commit);
    const first = recordExperiment(undefined, { ...seeded, approach: "Replay the stalled unmount." }, "2026-11-01T00:00:00.000Z", () => {
      id += 1;
      return `exp_${id}`;
    });
    expect(first.createdAt).toBe("2026-11-01T00:00:00.000Z");
    expect(first.log.map((entry) => entry.field)).toEqual(["hypothesis", "approach"]);
    const second = recordExperiment(
      first,
      { ...seeded, approach: "Replay the stalled unmount.", conclusion: "Custody is kept." },
      "2026-11-01T00:05:00.000Z",
      () => {
        id += 1;
        return `exp_${id}`;
      },
    );
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBe("2026-11-01T00:05:00.000Z");
    expect(second.log.at(-1)?.field).toBe("conclusion");
    expect(ledgerFromRecord(second).at(-1)?.action).toBe("Recorded conclusion");
  });

  it("marks empty methodology as lost on the handoff and copies the rest onto the ticket", () => {
    const seeded = seedExperiment(area, commit);
    const recorded = recordExperiment(
      undefined,
      {
        ...seeded,
        approach: "One forced unmount, then read the abort write.",
        parameters: "LAYERFS_CONSTRUCTION_WORKERS=1",
        runs: "daemon stalled-unmount test",
        results: "abort custody preserved",
        conclusion: "Branch the daemon fix, do not rewrite main.",
      },
      "2026-11-01T00:00:00.000Z",
      () => "exp_1",
    );
    const items = experimentHandoffItems(recorded);
    expect(items.find((item) => item.id === "exp-setup")?.lost).toBe(true);
    expect(items.find((item) => item.id === "exp-approach")?.lost).toBeUndefined();
    const ticket = applyExperiment(draftFromBranch(area, commit), recorded);
    expect(ticket.hypothesis).toContain("69fedcacf");
    expect(ticket.instruction).toContain("LAYERFS_CONSTRUCTION_WORKERS=1");
    expect(ticket.instruction).toContain("daemon stalled-unmount test");
    expect(ticket.rationale).toContain("abort custody preserved");
    expect(ticket.rationale).toContain("Branch the daemon fix");
  });
});
