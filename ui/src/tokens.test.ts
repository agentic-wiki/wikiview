import { expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * The colour vocabulary is the reference design's, and only that
 * (backlog/8-design/002). The old names were removed rather than aliased, so a
 * class written from memory — `bg-surface`, `border-border` — compiles to
 * nothing and silently draws an unstyled element. Tailwind will not say so;
 * this does.
 */
const REMOVED = /\b(?:bg|text|border|fill|stroke|ring|divide|outline)-(?:sunken|surface|border|accent-fg)\b|\belev-[123]\b|\blift\b/;

test("no component uses a removed colour token", async () => {
  const offenders: string[] = [];
  for await (const file of new Glob("**/*.tsx").scan(new URL(".", import.meta.url).pathname)) {
    if (file.endsWith(".test.tsx")) continue;
    const text = await Bun.file(new URL(file, import.meta.url)).text();
    text.split("\n").forEach((line, i) => {
      if (REMOVED.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  expect(offenders).toEqual([]);
});

test("the stylesheet references only colours it defines", async () => {
  const css = await Bun.file(new URL("./index.css", import.meta.url)).text();
  const defined = new Set([...css.matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1]));
  const used = [...css.matchAll(/var\(--color-([\w-]+)\)/g)].map((m) => m[1]!);
  expect(used.filter((name) => !defined.has(name))).toEqual([]);
});
