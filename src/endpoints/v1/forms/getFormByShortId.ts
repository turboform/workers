import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'
import { Logger } from 'utils/error-handling'

export class GetFormByShortId extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Get a form by short ID',
    request: {
      params: z.object({
        shortId: z.string().describe('Form short ID'),
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
      const shortId = c.req.param('shortId')

      if (!shortId) {
        throw new HTTPException(400, { message: 'Form short ID is required' })
      }

      // Fetch the form by short ID
      const { data: form, error } = await supabaseAdminClient(c)
        .from('forms')
        .select('*')
        .eq('short_id', shortId)
        .single()

      if (error || !form) {
        throw new HTTPException(404, { message: 'Form not found' })
      }

      // Check if form has expired
      if (form.expires_at && new Date(form.expires_at) < new Date()) {
        throw new HTTPException(403, { message: 'This form has expired' })
      }

      // For public access, ensure the form isn't a draft
      if (form.is_draft) {
        throw new HTTPException(403, { message: 'This form is not published yet' })
      }

      return { form }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      Logger.error('Error in getFormByShortId', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
