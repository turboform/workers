-- Create a function for vector similarity search within form responses
CREATE OR REPLACE FUNCTION match_form_responses_by_embedding(
  query_embedding vector(3072),
  similarity_threshold float,
  match_count int,
  p_form_id uuid
)
RETURNS TABLE (
  id uuid,
  content jsonb,
  form_id uuid,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fr.id,
    fr.content,
    fr.form_id,
    fr.created_at,
    -1 * (fr.embedding <#> query_embedding) AS similarity
  FROM
    form_responses fr
  WHERE
    fr.form_id = p_form_id
    AND fr.embedding IS NOT NULL
    AND (fr.embedding <#> query_embedding) < -similarity_threshold
  ORDER BY
    fr.embedding <#> query_embedding
  LIMIT match_count;
END;
$$;
