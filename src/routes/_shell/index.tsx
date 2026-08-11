import { createFileRoute } from "@tanstack/react-router";
import DashboardPage from "@/pages/DashboardPage";

export const Route = createFileRoute("/_shell/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Quantum Intelligence" },
      { name: "description", content: "Live market overview, AI signals and portfolio health in one command center." },
      { property: "og:title", content: "Dashboard | Quantum Intelligence" },
      { property: "og:description", content: "Live market overview, AI signals and portfolio health in one command center." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});
