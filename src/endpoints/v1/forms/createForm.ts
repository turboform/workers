import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'
import crypto from 'crypto'
import { ErrorHandler, Logger, withErrorHandling } from 'utils/error-handling'

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
              primary_color: z.string().nullable().optional().describe('Primary color for form styling (hex code)'),
              secondary_color: z.string().nullable().optional().describe('Secondary color for form styling (hex code)'),
              logo_url: z.string().nullable().optional().describe('URL to the form logo image'),
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
    return withErrorHandling(async (c: AppContext) => {
      const user = c.get('user')
      const authToken = c.get('authToken')

      Logger.info('Creating new form', c, { userId: user.id })

      // Parse the request body
      const { title, description, schema, expires_at, primary_color, secondary_color, logo_url } = await c.req.json()

      // Validate required fields
      if (!title?.trim()) {
        ErrorHandler.throwValidationError('Title is required and cannot be empty', 'title')
      }
      if (!description?.trim()) {
        ErrorHandler.throwValidationError('Description is required and cannot be empty', 'description')
      }
      if (!schema) {
        ErrorHandler.throwValidationError('Form schema is required', 'schema')
      }

      // Generate a unique short ID
      const short_id = generateShortId()

      Logger.debug('Generated short ID for form', c, { shortId: short_id, title })

      // Insert form into database
      const { data, error } = await supabaseApiClient(authToken, c)
        .from('forms')
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: description.trim(),
          schema,
          short_id,
          expires_at: expires_at || null,
          primary_color: primary_color || null,
          secondary_color: secondary_color || null,
          logo_url: logo_url || null,
        })
        .select()
        .single()

      if (error) {
        Logger.error('Database error creating form', error, c, {
          userId: user.id,
          title,
          shortId: short_id,
        })
        ErrorHandler.throwExternalServiceError('Database')
      }

      Logger.info('Form created successfully', c, {
        formId: data.id,
        shortId: short_id,
        userId: user.id,
      })

      return c.json({
        form: data,
      })
    }, 'createForm')(c)
  }
}
