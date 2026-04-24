import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initServiceWorker } from "./lib/registerSW";
import { flushUploadQueue } from "./lib/syncEngine";

// Initialize service worker and background sync
initServiceWorker();

// Flush any pending uploads from a previous session on startup
if (navigator.onLine) {
  flushUploadQueue();
}

createRoot(document.getElementById("root")!).render(<App />);
