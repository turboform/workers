import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'
import { Logger } from 'utils/error-handling'

export class GetFormById extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Get a form by ID for public access',
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
      const formId = c.req.param('id')

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      // Fetch the form by ID
      const { data: form, error } = await supabaseAdminClient(c).from('forms').select('*').eq('id', formId).single()

      if (error || !form) {
        throw new HTTPException(404, { message: 'Form not found' })
      }

      return { form }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      Logger.error('Error in getFormById', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
