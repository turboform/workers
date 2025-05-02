import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'

export class SubmitFormResponse extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Submit a response to a form',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              formId: Str({ description: 'Form ID to submit responses for' }),
              responses: z.record(z.any(), { description: 'Form responses as key-value pairs' }),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Form response submitted successfully',
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
      const { formId, responses } = await c.req.json()

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      if (!responses || typeof responses !== 'object') {
        throw new HTTPException(400, { message: 'Responses are required and must be an object' })
      }

      // Check if the form exists and is not a draft
      // TODO: check form expiration date
      const { error } = await supabaseAdminClient(c).from('form_responses').insert({
        form_id: formId,
        responses,
      })

      if (error) {
        console.error('Error submitting form response:', error)
        throw new HTTPException(500, { message: 'Failed to submit form response' })
      }

      return {
        success: true,
        message: 'Form response submitted successfully',
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in submitFormResponse:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
