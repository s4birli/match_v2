-- Enable Supabase Realtime for the tables the UI subscribes to via
-- LiveRefresh. We add them to the `supabase_realtime` publication and
-- set REPLICA IDENTITY FULL so client-side row filters can match on
-- columns other than the primary key (e.g. `match_id=eq.<uuid>`).
--
-- Why these specific tables: they cover every "user A made a change ↦
-- user B sees it instantly" surface in the app — match rosters, scores,
-- poll votes, ledger entries, notifications, membership changes.
-- Aggregate views (safe_member_stats) are not in the list because they're
-- views, and Realtime doesn't replicate views.

-- Create the publication if it doesn't already exist (Supabase's stock
-- migration usually creates an empty one). FOR ALL TABLES is too broad
-- so we add tables one by one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add tables to the publication. ALTER PUBLICATION ... ADD TABLE is
-- idempotent against re-runs as long as we wrap it.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'matches',
    'match_participants',
    'match_results',
    'match_teams',
    'pre_match_polls',
    'pre_match_poll_votes',
    'ledger_transactions',
    'notifications',
    'memberships',
    'tenant_invites'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- already in the publication, ignore
      NULL;
    END;
    -- REPLICA IDENTITY FULL ships the full old row on UPDATE/DELETE so
    -- Realtime filters work for non-PK columns.
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
