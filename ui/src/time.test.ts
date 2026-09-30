import { expect, test } from "bun:test";
import { age } from "@/time";

const now = Date.parse("2026-09-30T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

test("ages read the way the reference phrases them, at every boundary", () => {
  expect(age(ago(0), now)).toBe("just now");
  expect(age(ago(59_999), now)).toBe("just now");
  expect(age(ago(MIN), now)).toBe("1 min ago");
  expect(age(ago(59 * MIN), now)).toBe("59 min ago");
  expect(age(ago(H), now)).toBe("1 h ago");
  expect(age(ago(23 * H + 59 * MIN), now)).toBe("23 h ago");
  expect(age(ago(D), now)).toBe("yesterday");
  expect(age(ago(2 * D - 1), now)).toBe("yesterday");
  expect(age(ago(2 * D), now)).toBe("2 days ago");
  expect(age(ago(6 * D), now)).toBe("6 days ago");
});

test("past a week it is a date, with the year only when it is not this one", () => {
  expect(age("2026-09-03T10:00:00Z", now)).toBe("Sep 3");
  expect(age("2025-12-24T10:00:00Z", now)).toBe("Dec 24, 2025");
});

// Two machines' clocks disagree by a few seconds all the time, and a commit
// dated a moment ahead of this one was still made just now.
test("a time slightly in the future is now, and garbage is nothing", () => {
  expect(age(new Date(now + 30_000).toISOString(), now)).toBe("just now");
  expect(age("not a date", now)).toBe("");
  expect(age("", now)).toBe("");
});
