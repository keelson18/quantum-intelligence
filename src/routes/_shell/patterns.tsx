import { createFileRoute } from "@tanstack/react-router";
import PatternsPage from "@/pages/PatternsPage";

export const Route = createFileRoute("/_shell/patterns")({
  head: () => ({
    meta: [
      { title: "Pattern Scanner | Quantum Intelligence" },
      { name: "description", content: "Detect candlestick and chart patterns with structure confirmation." },
      { property: "og:title", content: "Pattern Scanner | Quantum Intelligence" },
      { property: "og:description", content: "Detect candlestick and chart patterns with structure confirmation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatternsPage,
});
