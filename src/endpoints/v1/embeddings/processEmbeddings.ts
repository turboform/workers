import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { openAIClient } from 'utils/clients/openai'

// Default batch size for processing
const DEFAULT_BATCH_SIZE = 20

// Embedding job schema from the queue
const EmbeddingJobSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
})

// Request schema
const ProcessRequestSchema = z.object({
  max_batch_size: z.number().optional().default(DEFAULT_BATCH_SIZE),
})

export class ProcessEmbeddings extends OpenAPIRoute {
  schema = {
    tags: ['Embeddings'],
    summary: 'Process form response embeddings from the queue',
    request: {
      body: {
        content: {
          'application/json': {
            schema: ProcessRequestSchema,
          },
        },
        required: false,
      },
    },
    responses: {
      '200': {
        description: 'Embeddings processed successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              processed: z.number(),
              skipped: z.number(),
              failed: z.array(
                z.object({
                  id: z.string().uuid(),
                  error: z.string(),
                })
              ),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      // Parse request
      console.log('Processing embeddings...')
      const body = await c.req.json()
      const { max_batch_size } = ProcessRequestSchema.parse(body)

      // Initialize Supabase client
      const supabase = supabaseAdminClient(c)

      // Read messages from the queue
      const { data: queueMessages, error: queueError } = await supabase.schema('pgmq_public' as any).rpc('read', {
        queue_name: 'form_response_embeddings',
        n: max_batch_size,
        sleep_seconds: 120, // 2 minutes
      })

      if (queueError) {
        console.error('Failed to read from queue:', queueError)
        throw new Error(`Failed to read from queue: ${queueError.message}`)
      }

      console.log(`Read ${queueMessages?.length || 0} messages from the queue`)
      if (!queueMessages || queueMessages.length === 0) {
        console.log('No messages found in the queue')
        return c.json({
          success: true,
          processed: 0,
          skipped: 0,
          failed: [],
          message: 'No messages found in the queue',
        })
      }

      // Process results
      const results = {
        processed: 0,
        skipped: 0,
        failed: [] as { id: string; error: string }[],
      }

      // Track message IDs that should be deleted from the queue
      const processedMsgIds: string[] = []

      // Process each message in parallel
      await Promise.all(
        queueMessages.map(async (msg) => {
          try {
            // Parse the message data
            const job = EmbeddingJobSchema.parse(msg.message)
            console.log(`Processing embedding for form response: ${job.id}`)

            // Generate embedding
            const embedding = await generateOpenAIEmbedding(c, job.text)

            // Update the form response with the embedding
            const { error: updateError } = await supabase
              .from('form_responses')
              .update({ embedding: embedding as any })
              .eq('id', job.id)

            if (updateError) {
              console.error(`Failed to update form response ${job.id}:`, updateError)
              throw new Error(`Failed to update form response: ${updateError.message}`)
            }

            // Mark as successfully processed
            processedMsgIds.push(msg.msg_id)
            results.processed++
          } catch (error) {
            const failureMessage = error instanceof Error ? error.message : String(error)

            // Handle permanent errors differently from transient errors
            const isPermanentError = failureMessage.includes('not found') || failureMessage.includes('invalid format')

            if (isPermanentError) {
              processedMsgIds.push(msg.msg_id)
              results.skipped++
            } else {
              // For temporary errors, let the message return to the queue for retry
              results.failed.push({
                id: msg.message_data?.id || 'unknown',
                error: failureMessage,
              })
            }
          }
        })
      )

      // Delete successfully processed messages in a single operation
      if (processedMsgIds.length > 0) {
        console.log(`Deleting ${processedMsgIds.length} processed messages from the queue`)
        processedMsgIds.forEach(async (msgId) => {
          const { error: deleteError } = await supabase.schema('pgmq_public' as any).rpc('delete', {
            queue_name: 'form_response_embeddings',
            message_id: msgId,
          })

          if (deleteError) {
            console.error('Failed to delete message:', deleteError)
          }
        })
      }

      return c.json({
        success: true,
        ...results,
      })
    } catch (error) {
      return c.json(
        {
          success: false,
          error: 'Failed to process embeddings',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      )
    }
  }
}

/**
 * Generates an embedding using OpenAI's text-embedding-3-small model
 */
async function generateOpenAIEmbedding(c: AppContext, text: string): Promise<number[]> {
  const openai = openAIClient(c.env.OPENAI_API_KEY)

  console.log('Generating embedding for:', text)
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  })

  const embedding = response.data[0].embedding

  if (!embedding) {
    throw new Error('Failed to generate embedding from OpenAI')
  }

  return embedding
}
