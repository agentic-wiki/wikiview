import { expect, test } from "bun:test";
import { createRoot } from "react-dom/client";
import { act, createRef, StrictMode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { ScrollRestoration } from "@/shell/ScrollRestoration";

/**
 * Drives the three cases through a real router, because navigation *type* is
 * what distinguishes them and only the router knows it.
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
          <Route path="/a" element={<div style={{ height: 2000 }}>A</div>} />
          <Route path="/b" element={<div style={{ height: 2000 }} id="target">B</div>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
  return { ui, navigate: (to: string | number) => nav!(to as never) };
}

test("a new page starts at the top, and going back returns to where you were", async () => {
  const container = document.createElement("main");
  document.body.appendChild(container);
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = container;

  const root = createRoot(container);
  const { ui, navigate } = harness(ref);
  await act(async () => root.render(ui));

  // Read halfway down the first page.
  container.scrollTop = 640;

  await act(async () => navigate("/b"));
  expect(container.scrollTop).toBe(0); // a new page is not inherited scroll

  container.scrollTop = 120;
  await act(async () => navigate(-1));
  // Back restores the position that entry in the history stack was left at.
  expect(container.scrollTop).toBe(640);

  await act(async () => root.unmount());
  container.remove();
});
