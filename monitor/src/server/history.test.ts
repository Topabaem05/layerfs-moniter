import { describe, expect, it } from "vitest";

import { parseLog, studioFromCommits } from "./history.js";

const raw = `COMMIT\tabc123def4567890aaaa\t100\tfix(daemon): unmount abort custody
engine/crates/layerfs-daemon/src/control/unmount.rs
engine/crates/layerfs-fuse/src/session/force.rs
api/agent/src/workspace/unmount.js

COMMIT\tffff0000111122223333\t90\tUpdate plugin pins
plugins/cursor-agents/plugin.json

COMMIT\t11112222333344445555\t80\tMerge pull request #1
engine/crates/layerfs-daemon/src/control/unmount.rs
`;

describe("git history mapping", () => {
  it("classifies commits by the layer they touch and skips merge commits", () => {
    const commits = parseLog(raw);
    expect(commits.map((commit) => commit.area)).toEqual(["engine", "plugins"]);
    expect(commits[0]?.files).toHaveLength(3);
    expect(commits[0]?.short).toBe("abc123def");
  });

  it("builds a decision whose pick is the subsystem that moved last", () => {
    const commits = parseLog(raw);
    const studio = studioFromCommits(
      commits,
      { sha: "abc123def4567890aaaa", short: "abc123def", subject: "fix(daemon): unmount abort custody" },
      "main",
      1_000,
    );
    const decision = studio.decisions[0];
    expect(decision?.options[0]?.label).toBe("Branch from Engine");
    expect(decision?.options[0]?.pick).toBe(true);
    expect(decision?.options.some((option) => option.label === "Branch from Plugins")).toBe(true);
    expect(studio.tree.children?.[0]?.status).toBe("waiting");
    expect(studio.ledger[0]?.reversible).toBe(false);
    expect(studio.handoffs[0]?.items.some((item) => item.lost)).toBe(false);
  });
});
