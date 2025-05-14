import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'

export class GetFormIntegrations extends OpenAPIRoute {
  schema = {
    tags: ['Integrations'],
    summary: 'Get all integrations for a form',
    request: {
      params: z.object({
        formId: z.string().describe('Form ID'),
      }),
    },
    responses: {
      '200': {
        description: 'Form integrations retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              integrations: z.array(z.any()),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const formId = c.req.param('formId')

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      const { data: integrations, error } = await supabaseAdminClient(c)
        .from('form_integrations')
        .select('*')
        .eq('form_id', formId)

      if (error) {
        console.error('Error fetching form integrations:', error)
        throw new HTTPException(500, { message: 'Failed to fetch form integrations' })
      }

      return { integrations }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in getFormIntegrations:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
