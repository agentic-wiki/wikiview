import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "@/App";
import "./index.css";

// BrowserRouter, never a hash router: the fragment carries heading anchors
// (/wiki/notes/a.md#a-heading_here), so it cannot also carry the route.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
