import { createFileRoute } from "@tanstack/react-router";
import ResearchPage from "@/pages/ResearchPage";

export const Route = createFileRoute("/_shell/research")({
  head: () => ({
    meta: [
      { title: "Research Terminal | Quantum Intelligence" },
      { name: "description", content: "Institutional-grade research tools for deep market analysis." },
      { property: "og:title", content: "Research Terminal | Quantum Intelligence" },
      { property: "og:description", content: "Institutional-grade research tools for deep market analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResearchPage,
});
