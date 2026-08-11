import { afterEach, expect, test } from "bun:test";
import { applyTheme, readTheme } from "@/shell/Theme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

test("auto leaves the decision to the system rather than resolving it", () => {
  applyTheme("dark");
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

  applyTheme("auto");
  // No attribute, so the media query decides — and keeps deciding if the system
  // changes while the tab is open. Resolving auto to a value here would freeze
  // it at load.
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
});

test("an explicit choice is remembered; auto is the absence of one", () => {
  expect(readTheme()).toBe("auto");

  localStorage.setItem("wiki:theme", "light");
  expect(readTheme()).toBe("light");

  // Anything unrecognized falls back rather than being repaired: a view
  // preference is not worth recovery code.
  localStorage.setItem("wiki:theme", "chartreuse");
  expect(readTheme()).toBe("auto");
});
