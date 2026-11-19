import { createRoot } from "react-dom/client";
import { EditorApp } from "./EditorApp.js";
import "./theme.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}
createRoot(root).render(<EditorApp />);
