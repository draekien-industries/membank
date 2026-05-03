import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { TooltipProvider } from "./components/ui/tooltip";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

createRoot(root).render(
  <StrictMode>
    <HotkeysProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </HotkeysProvider>
  </StrictMode>
);
