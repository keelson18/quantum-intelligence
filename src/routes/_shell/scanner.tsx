import { createFileRoute } from "@tanstack/react-router";
import ScannerPage from "@/pages/ScannerPage";

export const Route = createFileRoute("/_shell/scanner")({
  head: () => ({
    meta: [
      { title: "Market Scanner | Quantum Intelligence" },
      { name: "description", content: "Scan markets for high-conviction setups across timeframes and strategies." },
      { property: "og:title", content: "Market Scanner | Quantum Intelligence" },
      { property: "og:description", content: "Scan markets for high-conviction setups across timeframes and strategies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScannerPage,
});
