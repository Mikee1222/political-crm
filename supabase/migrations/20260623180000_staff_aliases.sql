-- Staff alias mapping: link legacy imported author names to CRM profiles.

CREATE TABLE IF NOT EXISTS public.staff_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_name)
);

CREATE INDEX IF NOT EXISTS staff_aliases_profile_id_idx ON public.staff_aliases (profile_id);

ALTER TABLE public.staff_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_read_staff_aliases" ON public.staff_aliases;
CREATE POLICY "crm_read_staff_aliases" ON public.staff_aliases
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND coalesce(p.is_portal, false) = false
    )
  );

DROP POLICY IF EXISTS "admin_insert_staff_aliases" ON public.staff_aliases;
CREATE POLICY "admin_insert_staff_aliases" ON public.staff_aliases
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "admin_update_staff_aliases" ON public.staff_aliases;
CREATE POLICY "admin_update_staff_aliases" ON public.staff_aliases
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "admin_delete_staff_aliases" ON public.staff_aliases;
CREATE POLICY "admin_delete_staff_aliases" ON public.staff_aliases
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.get_unlinked_legacy_author_names(p_limit int DEFAULT 50)
RETURNS TABLE(name text, usage_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_names AS (
    SELECT trim(author_name) AS n FROM public.contact_notes
    WHERE author_name IS NOT NULL AND trim(author_name) <> ''
    UNION ALL
    SELECT trim(author_name) FROM public.request_notes
    WHERE author_name IS NOT NULL AND trim(author_name) <> ''
    UNION ALL
    SELECT trim(author_name) FROM public.contacts
    WHERE author_name IS NOT NULL AND trim(author_name) <> ''
    UNION ALL
    SELECT trim(assigned_to) FROM public.requests
    WHERE assigned_to IS NOT NULL AND trim(assigned_to) <> ''
  ),
  grouped AS (
    SELECT n AS name, count(*)::bigint AS usage_count
    FROM all_names
    WHERE n <> ''
    GROUP BY n
  )
  SELECT g.name, g.usage_count
  FROM grouped g
  WHERE lower(g.name) NOT IN (SELECT lower(sa.alias_name) FROM public.staff_aliases sa)
    AND lower(g.name) NOT IN (
      SELECT lower(p.full_name) FROM public.profiles p
      WHERE p.full_name IS NOT NULL AND trim(p.full_name) <> ''
        AND coalesce(p.is_portal, false) = false
    )
  ORDER BY g.usage_count DESC, g.name ASC
  LIMIT greatest(coalesce(p_limit, 50), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_unlinked_legacy_author_names(int) TO authenticated;
