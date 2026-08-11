import { createFileRoute } from "@tanstack/react-router";
import JournalPage from "@/pages/JournalPage";

export const Route = createFileRoute("/_shell/journal")({
  head: () => ({
    meta: [
      { title: "Trading Journal | Quantum Intelligence" },
      { name: "description", content: "Log trades, capture lessons and track your trading psychology." },
      { property: "og:title", content: "Trading Journal | Quantum Intelligence" },
      { property: "og:description", content: "Log trades, capture lessons and track your trading psychology." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JournalPage,
});
