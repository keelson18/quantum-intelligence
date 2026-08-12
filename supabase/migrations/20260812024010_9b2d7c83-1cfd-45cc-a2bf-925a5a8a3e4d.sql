DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('strategy_results','backtest_results','ai_predictions')
      AND cmd IN ('SELECT','ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

REVOKE SELECT ON public.strategy_results FROM anon;
REVOKE SELECT ON public.backtest_results FROM anon;
REVOKE SELECT ON public.ai_predictions FROM anon;

CREATE POLICY "own strategy results" ON public.strategy_results FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own backtest results" ON public.backtest_results FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own ai predictions" ON public.ai_predictions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_models m WHERE m.id = ai_predictions.model_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_models m WHERE m.id = ai_predictions.model_id AND m.user_id = auth.uid()));

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='user_roles' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_roles', p.policyname);
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon;