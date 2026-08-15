import { createServerFn } from "@tanstack/react-start";
import { serverConfig } from "../config/env.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const predictInput = z.object({
  pair: z.string().min(3).max(20),
  timeframe: z.string().min(1).max(5),
});

export const predictML = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => predictInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runPrediction, checkRate } = await import("./ml-predict.server");
    const admin = supabaseAdmin as never;

    if (!(await checkRate(admin, `predict-${data.pair}-${data.timeframe}`, 30))) {
      return { error: "Rate limit exceeded" as const };
    }
    try {
      return { prediction: await runPrediction(admin, data.pair, data.timeframe) };
    } catch (err) {
      console.error("[ml] predict failed", err);
      return { error: "Prediction unavailable" as const };
    }
  });

export const retrainML = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => predictInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runRetrain, checkRate } = await import("./ml-predict.server");
    const admin = supabaseAdmin as never;

    if (!(await checkRate(admin, "retrain", 2))) {
      return { error: "Rate limit exceeded" as const };
    }
    try {
      return { result: await runRetrain(admin, data.pair, data.timeframe) };
    } catch (err) {
      console.error("[ml] retrain failed", err);
      return { error: "Retrain failed" as const };
    }
  });

export const getNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { refreshNews } = await import("./news.server");
  try {
    return await refreshNews(supabaseAdmin as never);
  } catch (err) {
    console.error("[news] refresh failed", err);
    return { news: [], cached: false };
  }
});

const coachInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(30),
});

const SYSTEM_PROMPT = `You are Kinetic Coach, an AI trading coach integrated into the Quantum Intelligence platform.
You help users understand crypto trading concepts, interpret technical analysis signals (RSI, MACD, Bollinger Bands, Fibonacci, chart patterns), manage risk, and build disciplined trading psychology.
Be concise, practical, and educational. Never give guaranteed-profit advice. Always remind users that trading carries risk.
When users ask about specific signals they're seeing, explain what the indicator measures and how to interpret it.`;

export const askCoachFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => coachInput.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { error: "AI coach is not configured." };

    try {
      const { aiGatewayUrl, aiCoachModel } = serverConfig();
      const res = await fetch(aiGatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: aiCoachModel,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...data.messages],
        }),
      });
      if (!res.ok) {
        console.error("[coach] gateway error", res.status, await res.text());
        return { error: "The coach is unavailable right now." };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return { reply: json.choices?.[0]?.message?.content ?? "No response generated." };
    } catch (err) {
      console.error("[coach]", err);
      return { error: "The coach is unavailable right now." };
    }
  });
