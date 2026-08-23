import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyTheme } from "./theme";
import { initDayStore } from "./dayStore";
import "./styles.css";

applyTheme();
initDayStore();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
