import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'
import { Logger } from 'utils/error-handling'

export const LOGOS_BUCKET = 'form-logos'

export class UploadFormLogo extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Upload a logo for a form',
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

      const body = await c.req.parseBody()
      const file = body['file'] as unknown as {
        arrayBuffer: () => Promise<ArrayBuffer>
        size: number
        type: string
        name: string
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

      const { error: uploadError } = await supabaseAdminClient(c)
        .storage.from(LOGOS_BUCKET)
        .upload(filePath, arrayBuffer, {
          contentType: file.type,
          upsert: true,
        })

      if (uploadError) {
        Logger.error('Error uploading logo', uploadError, c)
        throw new HTTPException(500, { message: 'Failed to upload logo' })
      }

      const { data: urlData } = supabaseAdminClient(c).storage.from(LOGOS_BUCKET).getPublicUrl(filePath)

      return c.json({
        logoUrl: urlData.publicUrl,
      })
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      Logger.error('Error in uploadFormLogo', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
