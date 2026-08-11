import { createFileRoute } from "@tanstack/react-router";
import PortfolioPage from "@/pages/PortfolioPage";

export const Route = createFileRoute("/_shell/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio | Quantum Intelligence" },
      { name: "description", content: "Track open positions, realized P&L and portfolio-level exposure." },
      { property: "og:title", content: "Portfolio | Quantum Intelligence" },
      { property: "og:description", content: "Track open positions, realized P&L and portfolio-level exposure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortfolioPage,
});
