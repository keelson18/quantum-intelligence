ALTER TABLE public.paper_positions
  ADD COLUMN IF NOT EXISTS fees numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slippage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requested_price numeric;

ALTER TABLE public.paper_trades
  ADD COLUMN IF NOT EXISTS fees numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slippage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_pnl numeric;

CREATE TABLE IF NOT EXISTS public.execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id uuid,
  trade_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('order_submitted','order_filled','order_cancelled','stop_updated','position_closed')),
  symbol text NOT NULL,
  side text CHECK (side IS NULL OR side IN ('long','short')),
  quantity numeric,
  requested_price numeric,
  fill_price numeric,
  fees numeric NOT NULL DEFAULT 0,
  slippage numeric NOT NULL DEFAULT 0,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.execution_events TO authenticated;
GRANT ALL ON public.execution_events TO service_role;
ALTER TABLE public.execution_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_execution_events" ON public.execution_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_execution_events" ON public.execution_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ee_user_time ON public.execution_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ee_position ON public.execution_events(position_id);

CREATE TABLE IF NOT EXISTS public.trade_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL,
  symbol text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('win','loss','scratch')),
  failure_class text NOT NULL,
  thesis_assessment text NOT NULL DEFAULT '',
  execution_assessment text NOT NULL DEFAULT '',
  risk_assessment text NOT NULL DEFAULT '',
  lessons text[] NOT NULL DEFAULT '{}',
  r_multiple numeric,
  engine_version text NOT NULL DEFAULT 'v1.0.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, trade_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_reviews TO authenticated;
GRANT ALL ON public.trade_reviews TO service_role;
ALTER TABLE public.trade_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_trade_reviews" ON public.trade_reviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_trade_reviews" ON public.trade_reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_trade_reviews" ON public.trade_reviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_trade_reviews" ON public.trade_reviews FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_tr_user_time ON public.trade_reviews(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_trade_reviews_updated_at ON public.trade_reviews;
CREATE TRIGGER update_trade_reviews_updated_at BEFORE UPDATE ON public.trade_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();