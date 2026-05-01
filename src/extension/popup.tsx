import { createRoot } from "react-dom/client";
import { PopupApp } from "./components/PopupApp.js";
import "./popup.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing popup root element");
}

createRoot(rootElement).render(<PopupApp />);
