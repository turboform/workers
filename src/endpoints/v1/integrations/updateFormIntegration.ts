import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'
import { Logger } from 'utils/error-handling'

export class UpdateFormIntegration extends OpenAPIRoute {
  schema = {
    tags: ['Integrations'],
    summary: 'Update an existing integration for a form',
    request: {
      params: z.object({
        id: z.string().describe('Integration ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              integration_type: z.string().optional().describe('Type of integration'),
              is_enabled: z.boolean().optional().describe('Whether the integration is enabled'),
              config: z.record(z.any()).optional().describe('Configuration for the integration'),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Integration updated successfully',
        content: {
          'application/json': {
            schema: z.object({
              integration: z.any(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const id = c.req.param('id')
      const { integration_type, is_enabled, config } = await c.req.json()

      if (!id) {
        throw new HTTPException(400, { message: 'Integration ID is required' })
      }

      const authToken = c.get('authToken')
      const { data, error } = await supabaseApiClient(authToken, c)
        .from('form_integrations')
        .update({
          integration_type: integration_type,
          is_enabled: is_enabled,
          config: config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        Logger.error('Error updating form integration', error, c)
        throw new HTTPException(500, { message: 'Failed to update form integration' })
      }

      return c.json({ integration: data })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      Logger.error('Error in updateFormIntegration', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
