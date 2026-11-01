import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Studio } from "./Studio.js";
import "./styles.css";
import "./shell.css";
import "./affect.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
);
