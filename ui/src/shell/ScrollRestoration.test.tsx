import { expect, test } from "bun:test";
import { createRoot } from "react-dom/client";
import { act, createRef, StrictMode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { ScrollRestoration } from "@/shell/ScrollRestoration";

/**
 * A container that clamps `scrollTop` to the height of its content, and loses
 * the position when that height shrinks. Browsers do both; happy-dom has no
 * layout, so it does neither and every assignment simply sticks.
 *
 * Modelling it is what makes these tests mean anything. Restoration is applied
 * against the height the view has at that moment, so a view that collapsed —
 * blanking while an entry loads, say — would clamp the restored position to
 * zero and lose it. Against a container that never clamps, that passes.
 */
function scrollingContainer() {
  const el = document.createElement("main");
  let top = 0;
  let height = 2000;
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (v: number) => {
      top = Math.max(0, Math.min(v, height));
    },
    configurable: true,
  });
  document.body.appendChild(el);
  return {
    el,
    /** Stands in for the height of the rendered content. */
    set height(v: number) {
      height = v;
      top = Math.min(top, height);
    },
  };
}

/**
 * Drives the cases through a real router, because navigation *type* is what
 * distinguishes them and only the router knows it.
 */
function harness(ref: React.RefObject<HTMLElement | null>) {
  let nav: ReturnType<typeof useNavigate> | undefined;
  function Capture() {
    nav = useNavigate();
    return null;
  }
  const ui = (
    <StrictMode>
      <MemoryRouter initialEntries={["/a"]}>
        <ScrollRestoration containerRef={ref} />
        <Capture />
        <Routes>
          <Route path="/a" element={<div>A</div>} />
          <Route path="/b" element={<div>B</div>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
  return { ui, navigate: (to: string | number) => act(async () => void nav!(to as never)) };
}

function mount() {
  const view = scrollingContainer();
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = view.el;
  const root = createRoot(view.el);
  const { ui, navigate } = harness(ref);
  return {
    view,
    navigate,
    render: () => act(async () => root.render(ui)),
    done: async () => {
      await act(async () => root.unmount());
      view.el.remove();
    },
  };
}

test("a new page starts at the top, and going back returns to where you were", async () => {
  const app = mount();
  await app.render();

  app.view.el.scrollTop = 640; // read halfway down the first entry
  await app.navigate("/b");
  expect(app.view.el.scrollTop).toBe(0); // a new page does not inherit scroll

  app.view.el.scrollTop = 120;
  await app.navigate(-1);
  expect(app.view.el.scrollTop).toBe(640);

  // Forward again: the position that entry was left at, not the one before it.
  await app.navigate(1);
  expect(app.view.el.scrollTop).toBe(120);

  await app.done();
});

// The position is applied against the height the container has at that moment.
// If the entry being returned to is not rendered yet, that height belongs to
// whatever is still on screen, and a shorter one clamps the position away.
test("going back to a long entry from a short one keeps the position", async () => {
  const app = mount();
  await app.render();

  app.view.el.scrollTop = 640;
  await app.navigate("/b");
  app.view.height = 200; // a short entry: barely scrolls

  await app.navigate(-1);
  expect(app.view.el.scrollTop).toBe(200); // clamped: nothing taller to land on

  app.view.height = 2000; // the long one is back on screen
  await act(async () => void (await new Promise((r) => setTimeout(r, 80))));

  expect(app.view.el.scrollTop).toBe(640);
  await app.done();
});

test("a link to a heading wins over both, and waits for the heading to render", async () => {
  const scrolled: string[] = [];
  const proto = Element.prototype as { scrollIntoView?: () => void };
  const original = proto.scrollIntoView;
  proto.scrollIntoView = function (this: Element) {
    scrolled.push(this.id);
  };

  try {
    const app = mount();
    await app.render();
    app.view.el.scrollTop = 640;

    await app.navigate("/b#target");
    // Nothing with that id yet, as on a cold load where the entry is in flight.
    expect(scrolled).toEqual([]);
    expect(app.view.el.scrollTop).toBe(640); // and the hash suppressed the reset

    // It renders, and a later frame finds it rather than the first miss giving up.
    const heading = document.createElement("h2");
    heading.id = "target";
    document.body.appendChild(heading);
    await act(async () => void (await new Promise((r) => setTimeout(r, 80))));

    expect(scrolled).toEqual(["target"]);
    heading.remove();
    await app.done();
  } finally {
    proto.scrollIntoView = original;
  }
});
