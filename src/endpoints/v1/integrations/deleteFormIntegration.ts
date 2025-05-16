import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { HTTPException } from 'hono/http-exception'
import { supabaseApiClient } from 'utils/clients/supabase/api'

export class DeleteFormIntegration extends OpenAPIRoute {
  schema = {
    tags: ['Integrations'],
    summary: 'Delete a form integration',
    request: {
      params: z.object({
        id: z.string().describe('Integration ID'),
      }),
    },
    responses: {
      '200': {
        description: 'Integration deleted successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const id = c.req.param('id')

      if (!id) {
        throw new HTTPException(400, { message: 'Integration ID is required' })
      }

      const authToken = c.get('authToken')
      const { error } = await supabaseApiClient(authToken, c).from('form_integrations').delete().eq('id', id)

      if (error) {
        console.error('Error deleting form integration:', error)
        throw new HTTPException(500, { message: 'Failed to delete form integration' })
      }

      return c.json({ success: true })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in deleteFormIntegration:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
