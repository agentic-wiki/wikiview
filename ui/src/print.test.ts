import { expect, test } from "bun:test";

/**
 * Printing is a stylesheet, and there is no renderer here to check one against.
 *
 * What can be checked is the trap that already caught us once: hiding an element
 * and restyling it are the same specificity and both `!important`, so the rule
 * written last wins. The rule that stacks a board for paper un-hid the board a
 * card was open over, and it printed as a stacked board followed by the card it
 * was supposed to make way for.
 *
 * Reading the file is crude, and it is the only thing between that bug and a
 * silent return — the same argument as the test pinning the README's documented
 * defaults to the real ones.
 */
const css = await Bun.file(new URL("./index.css", import.meta.url)).text();

/** Every `selector { … }` inside the print rules, with the display it sets. */
function printRules(): { selector: string; display?: string }[] {
  // Comments first: they sit between rules, so they otherwise arrive attached to
  // the front of the next selector.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const print = bare.slice(bare.indexOf("@media print"));
  return [...print.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({
      selector: selector!.trim(),
      display: /display:\s*([\w-]+)/.exec(body!)?.[1],
    }))
    .filter((rule) => !rule.selector.startsWith("@"));
}

test("no print rule restyles an element the print rules hide", () => {
  const offenders = printRules()
    .filter((rule) => rule.display !== undefined && rule.display !== "none")
    // Only selectors that could match something hidden are at risk.
    .filter((rule) => rule.selector.includes("[data-scroller]") || rule.selector.includes("[data-print"))
    // Saying so is the fix. The sheet is exempt because it is never hidden: it
    // exists only while a card is open, which is the case it is styled for.
    .filter(
      (rule) =>
        !rule.selector.includes(':not([data-print="hide"])') &&
        !rule.selector.includes('[data-print="sheet"]'),
    )
    .map((rule) => rule.selector);

  expect(offenders).toEqual([]);
});

// And the rule that does the hiding is still there to be undone.
test("the print rules hide what is marked as chrome", () => {
  const hide = printRules().find((rule) => rule.selector === '[data-print="hide"]');
  expect(hide?.display).toBe("none");
});
