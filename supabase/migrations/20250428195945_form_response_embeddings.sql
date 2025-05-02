-- Add embedding column to form_responses table
ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create HNSW index for vector search (better for high dimensions)
CREATE INDEX IF NOT EXISTS form_responses_embedding_idx 
  ON form_responses 
  USING hnsw (embedding vector_cosine_ops) 
  WITH (m = 16, ef_construction = 64);

-- Create embedding job queue (using pgmq)
SELECT pgmq.create('form_response_embeddings');

-- Create function to convert form response to text for embedding
CREATE OR REPLACE FUNCTION form_response_to_text(response_data jsonb, form_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  form_schema jsonb;
  question_id text;
  response_value text;
  question_label text;
  i integer;
  result text := '';
BEGIN
  -- Get the form schema
  SELECT schema INTO form_schema 
  FROM public.forms 
  WHERE id = form_id;
  
  -- Process each response
  FOR question_id, response_value IN 
    SELECT 
      key,
      CASE 
        WHEN jsonb_typeof(value) IN ('object', 'array') THEN jsonb_pretty(value)
        ELSE value #>> '{}'
      END
    FROM jsonb_each(response_data)
  LOOP
    -- Default to question_id if we can't find the question
    question_label := question_id;
    
    -- Try to find the question label in the form schema if it exists
    IF form_schema IS NOT NULL THEN
      -- Loop through schema items to find matching question
      FOR i IN 0..jsonb_array_length(form_schema) - 1 LOOP
        IF form_schema->i->>'id' = question_id THEN
          question_label := form_schema->i->>'label';
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    -- Append to result
    result := result || question_label || ': ' || response_value || E'\n';
  END LOOP;
  
  RETURN result;
END;
$$;

-- Create function to queue a form response for embedding
CREATE OR REPLACE FUNCTION queue_form_response_embedding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Queue the form response for embedding processing
  PERFORM pgmq.send(
    'form_response_embeddings',
    jsonb_build_object(
      'id', NEW.id,
      'text', form_response_to_text(NEW.responses, NEW.form_id)
    )
  );
  
  -- Set embedding to NULL to indicate it needs processing
  IF TG_OP = 'UPDATE' AND OLD.responses IS DISTINCT FROM NEW.responses THEN
    NEW.embedding = NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to queue embeddings when form_responses are inserted or updated
DROP TRIGGER IF EXISTS queue_form_response_embedding_insert ON form_responses;
CREATE TRIGGER queue_form_response_embedding_insert
AFTER INSERT ON form_responses
FOR EACH ROW
EXECUTE FUNCTION queue_form_response_embedding();

DROP TRIGGER IF EXISTS queue_form_response_embedding_update ON form_responses;
CREATE TRIGGER queue_form_response_embedding_update
BEFORE UPDATE OF responses ON form_responses
FOR EACH ROW
WHEN (OLD.responses IS DISTINCT FROM NEW.responses)
EXECUTE FUNCTION queue_form_response_embedding();

-- Create scheduled job to process embedding queue with the worker endpoint
SELECT cron.schedule(
  'process-form-response-embeddings',
  '*/5 * * * *',  -- Run every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://internal-workers-prd.turboform.ai/v1/embeddings/process',
    body := '{"max_batch_size": 20}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Grant permissions
GRANT USAGE ON SCHEMA pgmq TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgmq TO service_role;
GRANT USAGE ON SCHEMA cron TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO service_role;
GRANT EXECUTE ON FUNCTION net.http_post TO service_role;
