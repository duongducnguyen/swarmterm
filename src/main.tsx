import ReactDOM from "react-dom/client";
import App from "./App";
import './index.css'

// NOTE: intentionally NOT wrapped in <React.StrictMode>. Each TerminalPane owns a
// real OS pty; StrictMode's dev-only double-mount would spawn a shell, kill it,
// and spawn another (and run a template's initialCommand twice), and the rapid
// re-create races the async pty teardown ("Terminal already exists").
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
