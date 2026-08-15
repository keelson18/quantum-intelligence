// ============================================================================
// Server configuration tier. Values are read lazily inside handlers because
// the worker injects environment variables at call time, not module scope.
// ============================================================================

function read(key: string, fallback: string): string {
  const value = process.env[key];
  return value && value.length > 0 ? value : fallback;
}

export function serverConfig() {
  return {
    marketRestUrl: read('MARKET_REST_URL', 'https://api.binance.com'),
    aiGatewayUrl: read('AI_GATEWAY_URL', 'https://ai.gateway.lovable.dev/v1/chat/completions'),
    aiCoachModel: read('AI_COACH_MODEL', 'google/gemini-3.5-flash'),
    newsSourceBaseUrl: read('NEWS_SOURCE_BASE_URL', 'https://www.binance.com'),
  };
}
