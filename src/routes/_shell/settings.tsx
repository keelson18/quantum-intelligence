import { createFileRoute } from "@tanstack/react-router";
import SettingsPage from "@/pages/SettingsPage";

export const Route = createFileRoute("/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Quantum Intelligence" },
      { name: "description", content: "Default timeframe, risk tolerance, theme and notification preferences." },
      { property: "og:title", content: "Settings | Quantum Intelligence" },
      { property: "og:description", content: "Default timeframe, risk tolerance, theme and notification preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});
