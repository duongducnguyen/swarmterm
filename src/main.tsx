// MUST stay the first import: it installs the boot-failure screen, and anything
// imported above it could throw before the listeners exist (see boot-guard.ts).
import './boot-guard'
import ReactDOM from "react-dom/client";
import App from "./App";
import './index.css'
import { installScrollbarActivity } from './lib/scrollbar-activity'

// Reveal the minimal-overlay scrollbars while any element is actively scrolling
// (they are hidden at rest and otherwise only show on hover). One global
// listener covers every scroll container, including terminal viewports.
installScrollbarActivity()

// NOTE: intentionally NOT wrapped in <React.StrictMode>. Each TerminalPane owns a
// real OS pty; StrictMode's dev-only double-mount would spawn a shell, kill it,
// and spawn another (and run a template's initialCommand twice), and the rapid
// re-create races the async pty teardown ("Terminal already exists").
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
