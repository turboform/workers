import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'

export class DeleteForm extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Delete a form by ID and its associated responses',
    request: {
      params: z.object({
        id: z.string().describe('Form ID to delete'),
      }),
    },
    responses: {
      '200': {
        description: 'Form and associated responses deleted successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const authToken = c.get('authToken')
      const formId = c.req.param('id')

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      const { error: responsesError } = await supabaseApiClient(authToken, c)
        .from('form_responses')
        .delete()
        .eq('form_id', formId)

      if (responsesError) {
        console.error('Error deleting form responses:', responsesError)
        throw new HTTPException(500, { message: 'Failed to delete associated form responses' })
      }

      const { error: deleteError } = await supabaseApiClient(authToken, c).from('forms').delete().eq('id', formId)

      if (deleteError) {
        console.error('Error deleting form:', deleteError)
        throw new HTTPException(500, { message: 'Failed to delete form' })
      }

      return c.json({
        success: true,
        message: 'Form and associated responses deleted successfully',
      })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      console.error('Error in deleteForm:', error)
      throw new HTTPException(500, { message: 'An unexpected error occurred while deleting the form' })
    }
  }
}
