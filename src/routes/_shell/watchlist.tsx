import { createFileRoute } from "@tanstack/react-router";
import WatchlistPage from "@/pages/WatchlistPage";

export const Route = createFileRoute("/_shell/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlists | Quantum Intelligence" },
      { name: "description", content: "Organize symbols into watchlists across crypto, forex and indices." },
      { property: "og:title", content: "Watchlists | Quantum Intelligence" },
      { property: "og:description", content: "Organize symbols into watchlists across crypto, forex and indices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WatchlistPage,
});
