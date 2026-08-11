import { createFileRoute } from "@tanstack/react-router";
import BacktestingPage from "@/pages/BacktestingPage";

export const Route = createFileRoute("/_shell/backtesting")({
  head: () => ({
    meta: [
      { title: "Backtesting | Quantum Intelligence" },
      { name: "description", content: "Walk-forward and Monte Carlo backtests for every strategy you run." },
      { property: "og:title", content: "Backtesting | Quantum Intelligence" },
      { property: "og:description", content: "Walk-forward and Monte Carlo backtests for every strategy you run." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BacktestingPage,
});
