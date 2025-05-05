import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { openAIClient } from 'utils/clients/openai'
import { supabaseApiClient } from 'utils/clients/supabase/api'

export class QuestionAnswering extends OpenAPIRoute {
  schema = {
    tags: ['Embeddings'],
    summary: 'Ask questions about form responses using vector similarity',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              question: z.string().min(1),
              formId: z.string().uuid(),
              limit: z.number().min(1).max(20).optional().default(5),
              threshold: z.number().min(0).max(1).optional().default(0.7),
            }),
          },
        },
      },
      responses: {
        '200': {
          description: 'Question answered successfully',
          content: {
            'application/json': {
              schema: z.object({
                success: z.boolean(),
                answer: z.string(),
                relevantResponses: z.array(
                  z.object({
                    id: z.string().uuid(),
                    content: z.record(z.string(), z.any()),
                    similarity: z.number(),
                  })
                ),
              }),
            },
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    const authToken = c.get('authToken')

    try {
      // Parse request
      const body = await c.req.json()
      const { question, formId, limit, threshold } = body

      console.log('question', question)
      console.log('formId', formId)
      console.log('limit', limit)
      console.log('threshold', threshold)

      // Generate embedding for the question
      const questionEmbedding = await generateOpenAIEmbedding(c, question)

      // Initialize Supabase client
      const supabase = supabaseApiClient(authToken, c)

      // Find similar form responses using vector similarity search
      const { data: relevantResponses, error: searchError } = await supabase.rpc('match_form_responses_by_embedding', {
        query_embedding: questionEmbedding as any,
        similarity_threshold: threshold,
        match_count: limit,
        p_form_id: formId,
      })

      console.log('relevantResponses', relevantResponses)

      if (searchError) {
        console.error('Vector similarity search failed:', searchError)
        throw new Error(`Failed to search similar responses: ${searchError.message}`)
      }

      if (!relevantResponses || relevantResponses.length === 0) {
        return c.json({
          success: true,
          answer: "I couldn't find any relevant information to answer your question.",
          relevantResponses: [],
        })
      }

      // Format the relevant responses for context
      const { data: form } = await supabase.from('forms').select('*').eq('id', formId).single()

      const context = relevantResponses
        .map((response) => {
          const formattedContent = Object.entries(response.responses)
            .map(([key, value]) => {
              const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
              return `${question}: ${value}`
            })
            .join('\n')
          return formattedContent
        })
        .join('\n\n---\n\n')

      // Generate an answer using OpenAI
      const answer = await generateAnswerFromContext(c, question, context)

      return c.json({
        success: true,
        answer,
        relevantResponses: relevantResponses.map((resp) => ({
          id: resp.id,
          responses: resp.responses,
          similarity: resp.similarity,
        })),
      })
    } catch (error) {
      return c.json(
        {
          success: false,
          error: 'Failed to answer question',
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Generates an embedding using OpenAI's text-embedding-3-small model
 */
async function generateOpenAIEmbedding(c: AppContext, text: string): Promise<number[]> {
  const openai = openAIClient(c.env.OPENAI_API_KEY)

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

/**
 * Generates an answer from the given context using OpenAI
 */
async function generateAnswerFromContext(c: AppContext, question: string, context: string): Promise<string> {
  console.log('Question:', question)
  console.log('Context:', context)
  const openai = openAIClient(c.env.OPENAI_API_KEY)

  const prompt = `
You are an AI assistant that helps users find information from their form responses.
Use only the information provided in the CONTEXT section to answer the QUESTION.
If the CONTEXT doesn't contain relevant information to answer the QUESTION, say so clearly.
Don't make up information that isn't in the CONTEXT.

CONTEXT:
${context}

QUESTION:
${question}

ANSWER:
`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
  })

  return response.choices[0]?.message?.content || 'Failed to generate an answer.'
}
