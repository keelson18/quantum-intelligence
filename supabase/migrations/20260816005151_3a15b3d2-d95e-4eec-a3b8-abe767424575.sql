CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON public.rate_limit_events (user_id, action, created_at DESC);
GRANT ALL ON public.rate_limit_events TO service_role;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own rate limit events" ON public.rate_limit_events;
CREATE POLICY "Users can view their own rate limit events" ON public.rate_limit_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT SELECT ON public.rate_limit_events TO authenticated;