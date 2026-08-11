import { createFileRoute } from "@tanstack/react-router";
import LearningPage from "@/pages/LearningPage";

export const Route = createFileRoute("/_shell/learning")({
  head: () => ({
    meta: [
      { title: "AI Learning | Quantum Intelligence" },
      { name: "description", content: "Review how models learn from your trades and improve over time." },
      { property: "og:title", content: "AI Learning | Quantum Intelligence" },
      { property: "og:description", content: "Review how models learn from your trades and improve over time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LearningPage,
});
