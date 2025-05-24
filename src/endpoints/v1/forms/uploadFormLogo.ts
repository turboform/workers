import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'
import { supportedImageTypes } from 'lib/types/supported-image-types'

export const LOGOS_BUCKET = 'form-logos'

export class UploadFormLogo extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Upload a logo for a form',
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
        description: 'Form ID',
      },
    ],
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              file: z.any().describe('Logo image file (max 2MB)'),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Logo uploaded successfully',
        content: {
          'application/json': {
            schema: z.object({
              logoUrl: z.string().describe('URL of the uploaded logo'),
            }),
          },
        },
      },
      '400': {
        description: 'Invalid request',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
      '401': {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
      '403': {
        description: 'Forbidden',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const user = c.get('user')
      const formId = c.req.param('id')

      const { data: form, error: formError } = await supabaseAdminClient(c)
        .from('forms')
        .select('*')
        .eq('id', formId)
        .eq('user_id', user.id)
        .single()

      if (formError || !form) {
        throw new HTTPException(403, { message: 'Form not found or access denied' })
      }

      const formData = await c.req.formData()
      const file = formData.get('file') as unknown as { 
        arrayBuffer: () => Promise<ArrayBuffer>; 
        size: number; 
        type: string; 
        name: string; 
      }

      if (!file) {
        throw new HTTPException(400, { message: 'No file provided' })
      }

      if (!file.type.startsWith('image/')) {
        throw new HTTPException(400, { message: 'File must be an image' })
      }

      if (file.size > 2 * 1024 * 1024) {
        throw new HTTPException(400, { message: 'File size must be less than 2MB' })
      }

      const filePath = `${user.id}/${formId}/${Date.now()}_${file.name}`

      const arrayBuffer = await file.arrayBuffer()

      const { data: uploadData, error: uploadError } = await supabaseAdminClient(c)
        .storage
        .from(LOGOS_BUCKET)
        .upload(filePath, arrayBuffer, {
          contentType: file.type,
          upsert: true
        })

      if (uploadError) {
        console.error('Error uploading logo:', uploadError)
        throw new HTTPException(500, { message: 'Failed to upload logo' })
      }

      const { data: urlData } = await supabaseAdminClient(c)
        .storage
        .from(LOGOS_BUCKET)
        .getPublicUrl(filePath)

      const { error: updateError } = await supabaseAdminClient(c)
        .from('forms')
        .update({
          logo_url: urlData.publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', formId)

      if (updateError) {
        console.error('Error updating form with logo URL:', updateError)
        throw new HTTPException(500, { message: 'Failed to update form with logo URL' })
      }

      return c.json({
        logoUrl: urlData.publicUrl
      })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      console.error('Error in uploadFormLogo:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
