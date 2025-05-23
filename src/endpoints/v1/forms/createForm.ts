import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'
import crypto from 'crypto'

// Helper to generate a short ID for forms
function generateShortId(length = 8): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

export class CreateForm extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Create a new form',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: Str({ description: 'Form title' }),
              description: Str({ description: 'Form description' }),
              schema: z.any({ description: 'Form schema/structure' }),
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
        description: 'Form created successfully',
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
      const user = c.get('user')
      const authToken = c.get('authToken')

      // Parse the request body
      const { title, description, schema, expires_at, primaryColor, secondaryColor, logoUrl } = await c.req.json()

      // Generate a unique short ID
      const short_id = generateShortId()

      // Insert form into database
      const { data, error } = await supabaseApiClient(authToken, c)
        .from('forms')
        .insert({
          user_id: user.id,
          title,
          description,
          schema,
          short_id,
          expires_at: expires_at || null,
          primary_color: primaryColor || null,
          secondary_color: secondaryColor || null,
          logo_url: logoUrl || null
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating form:', error)
        throw new HTTPException(500, { message: 'Failed to create form' })
      }

      return {
        form: data,
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error in createForm:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
