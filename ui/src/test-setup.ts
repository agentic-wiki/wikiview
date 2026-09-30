import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });

// Without this React refuses to treat act() as act, so effects are flushed by
// whatever timing the test happens to have rather than deterministically.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom lays nothing out, and its ResizeObserver never reports. This one
// reports what a test says an element measures, through `resize`.
const observers = new Set<{ el: Element; callback: ResizeObserverCallback; observer: ResizeObserver }>();
globalThis.ResizeObserver = class {
  constructor(private callback: ResizeObserverCallback) {}
  observe(el: Element) {
    observers.add({ el, callback: this.callback, observer: this });
  }
  unobserve(el: Element) {
    for (const o of observers) if (o.el === el && o.observer === this) observers.delete(o);
  }
  disconnect() {
    for (const o of observers) if (o.observer === this) observers.delete(o);
  }
};

/** Tells every observer of `el` that its content box is now `width` wide. */
export function resize(el: Element, width: number) {
  for (const o of observers) {
    if (o.el !== el) continue;
    const entry = { target: el, contentRect: { width } } as unknown as ResizeObserverEntry;
    o.callback([entry], o.observer);
  }
}
