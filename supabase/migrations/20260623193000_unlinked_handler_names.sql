-- Include requests.assigned_to in unlinked legacy names and exclude CRM profile full names.

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
    SELECT trim(assigned_to) FROM public.requests
    WHERE assigned_to IS NOT NULL AND trim(assigned_to) <> ''
  ),
  grouped AS (
    SELECT n AS name, count(*)::bigint AS usage_count
    FROM all_names
    WHERE n <> '' AND n <> 'ΑΓΝΩΣΤΟΣ'
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
