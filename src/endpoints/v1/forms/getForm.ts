import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'
import { Logger } from 'utils/error-handling'

export class GetForm extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Get a form by ID',
    request: {
      params: z.object({
        id: z.string().describe('Form ID'),
      }),
    },
    responses: {
      '200': {
        description: 'Form retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              form: z.any(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const user = c.get('user')
      const authToken = c.get('authToken')
      const formId = c.req.param('id')

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      // Verify form ownership and get form data
      const { data: form, error } = await supabaseApiClient(authToken, c)
        .from('forms')
        .select('*')
        .eq('id', formId)
        .eq('user_id', user.id)
        .single()

      if (error || !form) {
        throw new HTTPException(404, { message: 'Form not found or you do not have permission to access it' })
      }

      // Get response count
      const { count, error: countError } = await supabaseApiClient(authToken, c)
        .from('form_responses')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', formId)

      if (countError) {
        Logger.error('Error counting responses', countError, c)
      } else {
        // Add response count to form as a new property
        ;(form as any).responseCount = count || 0
      }

      return { form }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      Logger.error('Error in getForm', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
