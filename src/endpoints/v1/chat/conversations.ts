import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'

const ConversationSchema = z.object({
  id: z.string().uuid(),
  form_id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  last_message: z
    .object({
      content: z.string(),
      role: z.enum(['user', 'assistant', 'system']),
      created_at: z.string(),
    })
    .optional(),
})

export class GetConversations extends OpenAPIRoute {
  schema = {
    tags: ['Chat'],
    summary: 'Get chat conversations for a form',
    request: {
      params: z.object({
        formId: z.string().describe('Form ID'),
      }),
    },
    responses: {
      '200': {
        description: 'List of conversations',
        content: {
          'application/json': {
            schema: z.array(ConversationSchema),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const user = c.get('user')
      const authToken = c.get('authToken')
      const formId = c.req.param('formId')

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      // Verify form ownership
      const { data: form, error: formError } = await supabaseApiClient(authToken, c)
        .from('forms')
        .select('id')
        .eq('id', formId)
        .eq('user_id', user.id)
        .single()

      if (formError || !form) {
        throw new HTTPException(404, { message: 'Form not found or you do not have permission to access it' })
      }

      // Get conversations with last message
      const { data: conversations, error } = await (supabaseApiClient(authToken, c) as any)
        .from('chat_conversations')
        .select('*')
        .eq('form_id', formId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('Error fetching conversations:', error)
        throw new HTTPException(500, { message: 'Failed to fetch conversations' })
      }

      // Get last message for each conversation
      const conversationsWithLastMessage = await Promise.all(
        (conversations || []).map(async (conv: any) => {
          const { data: messages } = await (supabaseApiClient(authToken, c) as any)
            .from('chat_messages')
            .select('content, role, created_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)

          return {
            ...conv,
            last_message: messages?.[0] || null,
          }
        })
      )

      return conversationsWithLastMessage
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in getConversations:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}

export class GetConversationMessages extends OpenAPIRoute {
  schema = {
    tags: ['Chat'],
    summary: 'Get messages for a conversation',
    request: {
      params: z.object({
        conversationId: z.string().describe('Conversation ID'),
      }),
    },
    responses: {
      '200': {
        description: 'List of messages',
        content: {
          'application/json': {
            schema: z.array(
              z.object({
                id: z.string().uuid(),
                conversation_id: z.string().uuid(),
                role: z.enum(['user', 'assistant', 'system']),
                content: z.string(),
                created_at: z.string(),
              })
            ),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const user = c.get('user')
      const authToken = c.get('authToken')
      const conversationId = c.req.param('conversationId')

      if (!conversationId) {
        throw new HTTPException(400, { message: 'Conversation ID is required' })
      }

      // Verify conversation ownership
      const { data: conversation, error: convError } = await (supabaseApiClient(authToken, c) as any)
        .from('chat_conversations')
        .select('id, form_id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single()

      if (convError || !conversation) {
        throw new HTTPException(404, { message: 'Conversation not found or you do not have permission to access it' })
      }

      // Get messages
      const { data: messages, error } = await (supabaseApiClient(authToken, c) as any)
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching messages:', error)
        throw new HTTPException(500, { message: 'Failed to fetch messages' })
      }

      return messages || []
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in getConversationMessages:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}

export class DeleteConversation extends OpenAPIRoute {
  schema = {
    tags: ['Chat'],
    summary: 'Delete a conversation',
    request: {
      params: z.object({
        conversationId: z.string().describe('Conversation ID'),
      }),
    },
    responses: {
      '204': {
        description: 'Conversation deleted successfully',
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const user = c.get('user')
      const authToken = c.get('authToken')
      const conversationId = c.req.param('conversationId')

      if (!conversationId) {
        throw new HTTPException(400, { message: 'Conversation ID is required' })
      }

      // Verify conversation ownership
      const { data: conversation, error: convError } = await (supabaseApiClient(authToken, c) as any)
        .from('chat_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single()

      if (convError || !conversation) {
        throw new HTTPException(404, { message: 'Conversation not found or you do not have permission to delete it' })
      }

      // Delete conversation (messages will be cascade deleted)
      const { error } = await (supabaseApiClient(authToken, c) as any)
        .from('chat_conversations')
        .delete()
        .eq('id', conversationId)

      if (error) {
        console.error('Error deleting conversation:', error)
        throw new HTTPException(500, { message: 'Failed to delete conversation' })
      }

      return c.text('', 204)
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in deleteConversation:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
