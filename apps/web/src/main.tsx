import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <header className="topbar">
      <h1>Contract Review</h1>
      <span className="muted">composed by the BFF · one request per screen</span>
    </header>
    <App />
  </StrictMode>,
);
