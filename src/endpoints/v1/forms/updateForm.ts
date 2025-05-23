import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'

export class UpdateForm extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Update a form by ID',
    request: {
      params: z.object({
        id: z.string().describe('Form ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string().describe('Form title'),
              description: z.string().describe('Form description'),
              schema: z.any().describe('Form schema/structure'),
              expires_at: z.string().nullable().optional().describe('When the form expires'),
              primaryColor: z.string().nullable().optional().describe('Primary color for form styling (hex code)'),
              secondaryColor: z.string().nullable().optional().describe('Secondary color for form styling (hex code)'),
              logoUrl: z.string().nullable().optional().describe('URL to the form logo image'),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Form updated successfully',
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
      const user = c.get('user')
      const authToken = c.get('authToken')
      const formId = c.req.param('id')

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      // Verify form ownership
      const { data: form, error } = await supabaseApiClient(authToken, c)
        .from('forms')
        .select('id')
        .eq('id', formId)
        .eq('user_id', user.id)
        .single()

      if (error || !form) {
        throw new HTTPException(404, { message: 'Form not found or you do not have permission to update it' })
      }

      // Get the form data from the request
      const { title, description, schema, expires_at, primaryColor, secondaryColor, logoUrl } = await c.req.json()

      // Update the form
      const { data, error: updateError } = await supabaseApiClient(authToken, c)
        .from('forms')
        .update({
          title,
          description,
          schema,
          expires_at: expires_at || null,
          updated_at: new Date().toISOString(),
          primary_color: primaryColor || null,
          secondary_color: secondaryColor || null,
          logo_url: logoUrl || null
        })
        .eq('id', formId)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating form:', updateError)
        throw new HTTPException(500, { message: 'Failed to update form' })
      }

      return {
        success: true,
        form: data,
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in updateForm:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
