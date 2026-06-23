-- Restrict unlinked legacy author names to contact_notes + request_notes only.

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
  ORDER BY g.usage_count DESC, g.name ASC
  LIMIT greatest(coalesce(p_limit, 50), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_unlinked_legacy_author_names(int) TO authenticated;
