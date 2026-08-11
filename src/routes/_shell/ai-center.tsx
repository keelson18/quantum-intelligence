import { createFileRoute } from "@tanstack/react-router";
import AICenterPage from "@/pages/AICenterPage";

export const Route = createFileRoute("/_shell/ai-center")({
  head: () => ({
    meta: [
      { title: "AI Trade Center | Quantum Intelligence" },
      { name: "description", content: "Train, evaluate and deploy neural models for market prediction." },
      { property: "og:title", content: "AI Trade Center | Quantum Intelligence" },
      { property: "og:description", content: "Train, evaluate and deploy neural models for market prediction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AICenterPage,
});
