CREATE TABLE IF NOT EXISTS public.analysis_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  context_id text NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  action text NOT NULL CHECK (action IN ('BUY','SELL','HOLD','WATCH','NO_TRADE')),
  confidence numeric(6,4) NOT NULL DEFAULT 0,
  raw_confidence numeric(6,4) NOT NULL DEFAULT 0,
  position_multiplier numeric(6,4) NOT NULL DEFAULT 0,
  data_quality_score integer NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  engine_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  contradictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_runs TO authenticated;
GRANT ALL ON public.analysis_runs TO service_role;
ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own analysis runs" ON public.analysis_runs;
CREATE POLICY "own analysis runs" ON public.analysis_runs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS analysis_runs_user_created_idx ON public.analysis_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analysis_runs_context_idx ON public.analysis_runs (context_id);

CREATE TABLE IF NOT EXISTS public.engine_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.analysis_runs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  engine_name text NOT NULL,
  engine_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','degraded','insufficient_data','failed')),
  confidence numeric(6,4) NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer NOT NULL DEFAULT 0,
  input_context_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_results TO authenticated;
GRANT ALL ON public.engine_results TO service_role;
ALTER TABLE public.engine_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own engine results" ON public.engine_results;
CREATE POLICY "own engine results" ON public.engine_results FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS engine_results_run_idx ON public.engine_results (run_id);

CREATE TABLE IF NOT EXISTS public.data_quality_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  occurrences integer NOT NULL DEFAULT 1,
  detail text,
  quality_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_quality_events TO authenticated;
GRANT ALL ON public.data_quality_events TO service_role;
ALTER TABLE public.data_quality_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own data quality events" ON public.data_quality_events;
CREATE POLICY "own data quality events" ON public.data_quality_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS dq_events_user_created_idx ON public.data_quality_events (user_id, created_at DESC);