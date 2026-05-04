-- Enable RLS on both tables
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_votes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read codes and votes (used by REST API in clients)
DO $$ BEGIN
  CREATE POLICY "public read codes" ON discount_codes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "public read votes" ON code_votes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Block all direct writes from anon/authenticated — must go through Edge Functions (service role)
-- No INSERT/UPDATE/DELETE policies = denied for non-service-role
