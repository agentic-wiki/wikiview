import { beforeEach, expect, test } from "bun:test";
import { createRoot } from "react-dom/client";
import { act, StrictMode } from "react";
import { useBundleState } from "@/state";

/**
 * Mounts a component holding one preference, and hands back a way to change it
 * and to remount from scratch — which is what a reload is.
 */
function harness<T>(bundleId: string, key: string, fallback: T) {
  let seen: T;
  let set: (update: T | ((prev: T) => T)) => void;

  function Probe() {
    const [value, setValue] = useBundleState<T>(bundleId, key, fallback);
    seen = value;
    set = setValue;
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    mount: async () => {
      await act(async () =>
        root.render(
          <StrictMode>
            <Probe />
          </StrictMode>,
        ),
      );
      return seen;
    },
    set: async (update: T | ((prev: T) => T)) => act(async () => set(update)),
    value: () => seen,
    done: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => localStorage.clear());

test("a preference survives a reload", async () => {
  const first = harness<string[]>("bundle-a", "tree:expanded", []);
  expect(await first.mount()).toEqual([]);
  await first.set(["/notes"]);
  await first.done();

  // A fresh mount reads what the last one left, the way a reload would.
  const second = harness<string[]>("bundle-a", "tree:expanded", []);
  expect(await second.mount()).toEqual(["/notes"]);
  await second.done();
});

// The reason any of this is scoped. Serving five knowledge bases from one
// browser must not carry a preference into a bundle where the path it names may
// not exist.
test("a preference does not leak into another bundle", async () => {
  const a = harness<string[]>("bundle-a", "tree:expanded", []);
  await a.mount();
  await a.set(["/notes"]);
  await a.done();

  const b = harness<string[]>("bundle-b", "tree:expanded", []);
  expect(await b.mount()).toEqual([]);
  await b.done();
});

// Nothing stored here is worth recovery code: it is a view preference, and the
// reader is fully usable having forgotten it.
test("a corrupt value falls back to the default instead of throwing", async () => {
  localStorage.setItem("wiki:bundle-a:tree:expanded", "{not json");

  const app = harness<string[]>("bundle-a", "tree:expanded", []);
  expect(await app.mount()).toEqual([]);

  // …and the next write repairs the key rather than leaving it poisoned.
  await app.set(["/ref"]);
  expect(JSON.parse(localStorage.getItem("wiki:bundle-a:tree:expanded")!)).toEqual(["/ref"]);
  await app.done();
});

// Paths can contain anything a filename can, which is why a list is stored as
// JSON rather than joined into a string that would need an escaping rule.
test("a path containing a comma survives a round trip", async () => {
  const app = harness<string[]>("bundle-a", "tree:expanded", []);
  await app.mount();
  await app.set(["/notes/a,b", "/plain"]);
  await app.done();

  const again = harness<string[]>("bundle-a", "tree:expanded", []);
  expect(await again.mount()).toEqual(["/notes/a,b", "/plain"]);
  await again.done();
});
