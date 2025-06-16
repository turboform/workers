import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { HTTPException } from 'hono/http-exception'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { Logger } from 'utils/error-handling'

export class PublishForm extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Publish or unpublish a form',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              formId: Str({ description: 'Form ID to publish or unpublish' }),
              isPublished: z.boolean({ description: 'Whether the form should be published or unpublished' }),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Form publish status updated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              form: z.any(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const userId = c.get('user')?.id
      const authToken = c.get('authToken')
      const { formId, isPublished } = await c.req.json()

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      // Verify form ownership
      const { data: form, error: formError } = await supabaseApiClient(authToken, c)
        .from('forms')
        .select('id')
        .eq('id', formId)
        .eq('user_id', userId)
        .single()

      if (formError || !form) {
        throw new HTTPException(404, { message: 'Form not found or you do not have permission to update it' })
      }

      // Update form draft status
      const isDraft = !isPublished
      const { data: updatedForm, error: updateError } = await supabaseApiClient(authToken, c)
        .from('forms')
        .update({
          is_draft: isDraft,
          updated_at: new Date().toISOString(),
        })
        .eq('id', formId)
        .select()
        .single()

      if (updateError) {
        Logger.error('Error updating form status', updateError, c)
        throw new HTTPException(500, { message: 'Failed to update form status' })
      }

      return {
        success: true,
        form: updatedForm,
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      Logger.error('Error in publishForm', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
