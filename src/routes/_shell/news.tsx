import { createFileRoute } from "@tanstack/react-router";
import NewsPage from "@/pages/NewsPage";

export const Route = createFileRoute("/_shell/news")({
  head: () => ({
    meta: [
      { title: "News & Sentiment | Quantum Intelligence" },
      { name: "description", content: "Market headlines scored for sentiment and mapped to your watchlist." },
      { property: "og:title", content: "News & Sentiment | Quantum Intelligence" },
      { property: "og:description", content: "Market headlines scored for sentiment and mapped to your watchlist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewsPage,
});
