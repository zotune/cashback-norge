import { createRoot } from "react-dom/client";
import { PopupApp } from "./components/PopupApp.js";
import "./popup.css";
import { bindThemeTarget, installThemeStyles } from "../shared/theme";
import { extensionTheme } from "./theme";

installThemeStyles(document.head);
bindThemeTarget(extensionTheme, document.documentElement);

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing popup root element");
}

createRoot(rootElement).render(<PopupApp />);
