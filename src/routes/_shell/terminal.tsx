import { createFileRoute } from "@tanstack/react-router";
import TerminalPage from "@/pages/TerminalPage";

export const Route = createFileRoute("/_shell/terminal")({
  head: () => ({
    meta: [
      { title: "Trading Terminal | Quantum Intelligence" },
      { name: "description", content: "Execute paper trades with AI-assisted entries, stops and position sizing." },
      { property: "og:title", content: "Trading Terminal | Quantum Intelligence" },
      { property: "og:description", content: "Execute paper trades with AI-assisted entries, stops and position sizing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TerminalPage,
});
