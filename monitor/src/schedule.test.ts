import { describe, expect, it } from "vitest";

import { canBook, cellUsed } from "./schedule.js";

describe("session budget", () => {
  it("rejects a booking that would pass 100 percent", () => {
    const slots = [{ cell: 1, percent: 70 }];
    expect(cellUsed(slots, 1)).toBe(70);
    expect(canBook(70, 40)).toBe(false);
    expect(canBook(70, 30)).toBe(true);
  });
});
