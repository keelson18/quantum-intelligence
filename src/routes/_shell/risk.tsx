import { createFileRoute } from "@tanstack/react-router";
import RiskPage from "@/pages/RiskPage";

export const Route = createFileRoute("/_shell/risk")({
  head: () => ({
    meta: [
      { title: "Risk Center | Quantum Intelligence" },
      { name: "description", content: "Daily loss limits, drawdown guards and exposure controls in one place." },
      { property: "og:title", content: "Risk Center | Quantum Intelligence" },
      { property: "og:description", content: "Daily loss limits, drawdown guards and exposure controls in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RiskPage,
});
