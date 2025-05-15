import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'

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

      const { data, error } = await supabaseAdminClient(c)
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
        console.error('Error creating form integration:', error)
        throw new HTTPException(500, { message: 'Failed to create form integration' })
      }

      return { integration: data }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in createFormIntegration:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
