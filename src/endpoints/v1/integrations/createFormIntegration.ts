import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { HTTPException } from 'hono/http-exception'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { Logger } from 'utils/error-handling'

export class CreateFormIntegration extends OpenAPIRoute {
  schema = {
    tags: ['Integrations'],
    summary: 'Create a new integration for a form',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              form_id: z.string().describe('Form ID'),
              integration_type: z.string().describe('Type of integration'),
              is_enabled: z.boolean().optional().describe('Whether the integration is enabled'),
              config: z.record(z.any()).describe('Configuration for the integration'),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Integration created successfully',
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
      const { form_id, integration_type, is_enabled, config } = await c.req.json()

      if (!form_id || !integration_type || !config) {
        throw new HTTPException(400, { message: 'Missing required fields' })
      }

      const authToken = c.get('authToken')
      const { data, error } = await supabaseApiClient(authToken, c)
        .from('form_integrations')
        .insert({
          form_id,
          integration_type,
          is_enabled: is_enabled !== undefined ? is_enabled : true,
          config,
        })
        .select()
        .single()

      if (error) {
        Logger.error('Error creating form integration', error, c)
        throw new HTTPException(500, { message: 'Failed to create form integration' })
      }

      return c.json({ integration: data })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      Logger.error('Error in createFormIntegration', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
