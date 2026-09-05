import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { installStaticDemo } from "./staticDemo.js";

if (import.meta.env.MODE === "static-demo") installStaticDemo();

createRoot(document.getElementById("root")).render(<App />);
