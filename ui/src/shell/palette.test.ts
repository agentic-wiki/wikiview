import { expect, test } from "bun:test";
import { paletteItems, type Command } from "@/shell/Omnibar";

const entries = Array.from({ length: 12 }, (_, i) => ({
  path: `/notes/e${i}.md`,
  label: `Entry ${i}`,
  type: i === 0 ? "task" : "note",
  ...(i === 1 ? { title: "The pivot" } : {}),
}));
const command = (title: string, sub = ""): Command => ({ title, sub, kind: "Action", run: () => {} });
const commands = ["Pull", "Commit & push…", "Toggle theme", "Open board · Backlog", "Read later"].map((t) => command(t));
const names = (items: ReturnType<typeof paletteItems>) => items.map((i) => (i.entry ? i.entry.path : i.command.title));

// Nothing typed: something to do, somewhere to go, and more of each.
test("with no query: three commands, five entries, then the other commands", () => {
  expect(names(paletteItems(entries, commands, "  "))).toEqual([
    "Pull",
    "Commit & push…",
    "Toggle theme",
    "/notes/e0.md",
    "/notes/e1.md",
    "/notes/e2.md",
    "/notes/e3.md",
    "/notes/e4.md",
    "Open board · Backlog",
    "Read later",
  ]);
});

// Typing is looking for something, so entries lead, up to nine, then commands.
test("with a query: matching entries first, at most nine, then matching commands", () => {
  const hits = names(paletteItems(entries, [...commands, command("Entry-ish thing")], "entry"));
  expect(hits.slice(0, 9)).toEqual(entries.slice(0, 9).map((e) => e.path));
  expect(hits.slice(9)).toEqual(["Entry-ish thing"]);
});

// An entry is findable by its filename, its path and its own title; a command
// by its title and by what it acts on.
test("matching is case-blind, over label, path, title, and a command's sub-line", () => {
  expect(names(paletteItems(entries, commands, "PIVOT"))).toEqual(["/notes/e1.md"]);
  expect(names(paletteItems(entries, commands, "/notes/e11"))).toEqual(["/notes/e11.md"]);
  expect(names(paletteItems(entries, [command("Pull", "git · origin/main → main")], "origin"))).toEqual(["Pull"]);
  expect(paletteItems(entries, commands, "nothing like this")).toEqual([]);
});
