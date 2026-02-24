import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { openAIClient } from 'utils/clients/openai'
import { HTTPException } from 'hono/http-exception'
import { Logger } from 'utils/error-handling'

const ChatRequestSchema = z.object({
  formId: z.string().uuid(),
  message: z.string().min(1).max(1000),
  conversationId: z.string().uuid().nullable().optional(),
})

const ChatResponseSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string(),
  relevantResponses: z.array(
    z.object({
      id: z.string().uuid(),
      similarity: z.number(),
      content: z.record(z.any()),
    })
  ),
})

export class ChatWithResponses extends OpenAPIRoute {
  schema = {
    tags: ['Chat'],
    summary: 'Chat with form responses using AI',
    request: {
      body: {
        content: {
          'application/json': {
            schema: ChatRequestSchema,
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Chat response generated successfully',
        content: {
          'application/json': {
            schema: ChatResponseSchema,
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const authToken = c.get('authToken')
      const user = c.get('user')
      const body = await c.req.json()
      const { formId, message, conversationId } = ChatRequestSchema.parse(body)

      const supabase = supabaseApiClient(authToken, c)
      const openai = openAIClient(c.env.OPENAI_API_KEY)

      // Verify user has access to the form
      const { data: form, error: formError } = await supabase
        .from('forms')
        .select('*')
        .eq('id', formId)
        .eq('user_id', user.id)
        .single()

      if (formError || !form) {
        throw new HTTPException(404, { message: 'Form not found' })
      }

      // Generate embedding for the user's message
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: message,
        encoding_format: 'float',
      })

      const queryEmbedding = embeddingResponse.data[0].embedding

      // Search for similar form responses using the vector similarity function
      const { data: similarResponses, error: searchError } = await supabase.rpc('match_form_responses_by_embedding', {
        query_embedding: queryEmbedding as any,
        similarity_threshold: 0.0,
        match_count: 100,
        p_form_id: formId,
      })

      if (searchError) {
        Logger.error('Vector search error', searchError, c)
        throw new HTTPException(500, { message: 'Failed to search responses' })
      }

      // Take top 20 most relevant responses
      Logger.debug('Similar responses found', c, { responseCount: similarResponses?.length || 0 })
      const relevantResponses = (similarResponses || []).slice(0, 20)

      // Create or get conversation
      let currentConversationId = conversationId

      if (!currentConversationId) {
        // Create new conversation - using 'any' type since table doesn't exist in types yet
        const { data: newConversation, error: convError } = await supabase
          .from('chat_conversations')
          .insert({
            form_id: formId,
            user_id: user.id,
            title: message.substring(0, 100),
          })
          .select()
          .single()

        if (convError || !newConversation) {
          Logger.error('Conversation creation error', convError, c)
          throw new HTTPException(500, { message: 'Failed to create conversation' })
        }

        currentConversationId = newConversation.id
      }

      // Save user message
      const { error: msgError } = await supabase.from('chat_messages').insert({
        conversation_id: currentConversationId,
        role: 'user',
        content: message,
        metadata: { form_id: formId },
      })

      if (msgError) {
        Logger.error('Message save error', msgError, c)
      }

      // Get conversation history for context
      const { data: previousMessages } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', currentConversationId)
        .order('created_at', { ascending: true })
        .limit(10)

      // Prepare context for GPT
      const formContext = this.prepareFormContext(form, relevantResponses)
      const conversationHistory = this.formatConversationHistory(previousMessages || [])

      // Check if this is a streaming request
      const isStreaming = c.req.raw.headers.get('accept') === 'text/event-stream'

      // Prepare the system message with improved prompt for better data analysis
      const formFields =
        form.schema && typeof form.schema === 'object'
          ? JSON.stringify(
              Object.entries(form.schema).map(([key, value]) => ({ id: key, label: key })),
              null,
              2
            )
          : '[]'

      const systemMessage = {
        role: 'system',
        content: `You are an AI data analyst for form responses. Analyze form data to extract insights and answer questions accurately.

FORM DETAILS:
Name: ${form.title || 'Untitled Form'}
Fields: ${formFields}

RELEVANT FORM RESPONSES (${relevantResponses.length}):
${formContext}

INSTRUCTIONS:
1. When analyzing data, calculate actual statistics (averages, percentages, counts, etc.)
2. Identify patterns, trends, outliers, and correlations in the data
3. Segment responses by categories when appropriate
4. When asked for specific metrics, calculate and provide exact numbers
5. Format statistics clearly with percentages and actual counts
6. If creating comparisons, use clear relative metrics (e.g., "45% higher than")
7. Reference specific responses by ID when relevant
8. For insufficient data, explain what additional information would help
9. Use analytical thinking - don't just summarize the data
10. Be concise but thorough - prioritize insights over raw data repetition`,
      }

      // Prepare the message array
      const messages = [
        systemMessage,
        ...conversationHistory,
        {
          role: 'user',
          content: message,
        },
      ]

      // For streaming responses
      if (isStreaming) {
        // Set up stream headers
        c.header('Content-Type', 'text/event-stream')
        c.header('Cache-Control', 'no-cache')
        c.header('Connection', 'keep-alive')

        // Explicitly import TransformStream if not already available in the global scope
        const TransformStream = globalThis.TransformStream || (await import('web-streams-polyfill')).TransformStream

        // Create readable and writable streams for handling the response
        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const encoder = new TextEncoder()

        // Start OpenAI streaming
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages,
          temperature: 0.7,
          max_tokens: 1000,
          stream: true,
        })

        // Create variable to store complete response
        let completeResponse = ''

        // Process the stream
        const streamProcessing = async () => {
          try {
            for await (const chunk of completion) {
              const content = chunk.choices[0]?.delta?.content || ''
              if (content) {
                completeResponse += content
                // Send the chunk to the client - ensure properly formatted JSON
                const payload = JSON.stringify({ text: content })
                await writer.write(encoder.encode(`data: ${payload}\n\n`))
              }
            }

            // Save the complete message to the database
            await supabase.from('chat_messages').insert({
              conversation_id: currentConversationId,
              role: 'assistant',
              content: completeResponse,
              metadata: {
                relevant_response_ids: relevantResponses.map((r: any) => r.id),
                model: 'gpt-3.5-turbo',
              },
            })

            // Send the final message with conversation ID
            const finalPayload = JSON.stringify({
              conversationId: currentConversationId,
              isComplete: true,
            })
            await writer.write(encoder.encode(`data: ${finalPayload}\n\n`))
          } catch (error) {
            Logger.error('Stream error', error, c)
            const errorPayload = JSON.stringify({ error: 'Stream processing error' })
            await writer.write(encoder.encode(`data: ${errorPayload}\n\n`))
          } finally {
            await writer.close()
          }
        }

        // Start processing in the background
        streamProcessing().catch((error) => Logger.error('Background stream processing error', error, c))

        // Return the readable stream
        return c.body(readable)
      } else {
        // Non-streaming response
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        })

        const aiResponse =
          completion.choices[0].message.content || 'I apologize, but I was unable to generate a response.'

        // Save AI response
        await supabase.from('chat_messages').insert({
          conversation_id: currentConversationId,
          role: 'assistant',
          content: aiResponse,
          metadata: {
            relevant_response_ids: relevantResponses.map((r: any) => r.id),
            model: 'gpt-3.5-turbo',
          },
        })

        return c.json({
          conversationId: currentConversationId,
          message: aiResponse,
          relevantResponses: relevantResponses.map((r: any) => ({
            id: r.id,
            similarity: r.similarity,
            content: r.responses,
          })),
        })
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      Logger.error('Chat error', error, c)
      throw new HTTPException(500, {
        message: 'Failed to process chat request',
      })
    }
  }

  private prepareFormContext(form: any, responses: any[]): string {
    if (!responses || responses.length === 0) {
      return 'No responses found.'
    }

    // Format responses for context
    return responses
      .map((response, index) => {
        const formattedResponse = this.formatResponse(response.responses, form.schema)
        return `Response ${index + 1} (Similarity: ${response.similarity.toFixed(2)}):
${formattedResponse}
---`
      })
      .join('\n\n')
  }

  private formatResponse(response: any, schema: any): string {
    if (!response) {
      return 'No response data available.'
    }

    // Format each field-value pair with more structure for better analysis
    const formattedFields = Object.entries(response)
      .map(([fieldId, value]) => {
        // Find field definition in the schema
        const field = schema?.fields?.find((f: any) => f.id === fieldId)
        const label = field?.label || fieldId
        const fieldType = field?.type || 'unknown'

        // Format values based on field type
        let formattedValue = value
        if (Array.isArray(value)) {
          formattedValue = value.join(', ')
        } else if (value === null || value === undefined) {
          formattedValue = 'N/A'
        } else if (fieldType === 'date' && typeof value === 'string') {
          try {
            formattedValue = new Date(value).toLocaleDateString()
          } catch (e) {
            formattedValue = value
          }
        }

        return `${label} [${fieldType}]: ${formattedValue}`
      })
      .join('\n')

    return formattedFields || 'Empty response'
  }

  private formatConversationHistory(messages: any[]): any[] {
    // Limit to last 10 messages to avoid context size issues
    const recentMessages = messages.slice(-10)
    return recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))
  }
}
