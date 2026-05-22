-- Hourly CRM access code (κλειδαριθμός) + per-user grants

CREATE TABLE IF NOT EXISTS access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS access_codes_valid_from_key ON access_codes (valid_from);

CREATE TABLE IF NOT EXISTS access_code_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  code_used text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS access_code_grants_user_id_key ON access_code_grants (user_id);

ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_code_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_all" ON access_codes;
CREATE POLICY "admins_all" ON access_codes FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "users_read_grants" ON access_code_grants;
CREATE POLICY "users_read_grants" ON access_code_grants FOR ALL USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
