import { ClerkProvider } from "@clerk/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={clerkPubKey} afterSignOutUrl="/">
    <App />
  </ClerkProvider>,
);
