import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'
import { processIntegrations } from 'utils/integrations/processIntegrations'

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
      const timestamp = c.req.header('X-Turboform-Timestamp')
      const signature = c.req.header('X-Turboform-Signature')

      const { formId, responses } = await c.req.json()

      if (!formId) {
        throw new HTTPException(400, { message: 'Form ID is required' })
      }

      if (!responses || typeof responses !== 'object') {
        throw new HTTPException(400, { message: 'Responses are required and must be an object' })
      }

      // Validate request signature
      if (!(await this.validateRequestSignature(c, formId, timestamp, signature))) {
        throw new HTTPException(403, { message: 'Invalid or missing signature' })
      }

      // Check for timestamp freshness (within 5 minutes)
      if (!timestamp || !this.isTimestampValid(timestamp)) {
        throw new HTTPException(403, { message: 'Request expired or invalid timestamp' })
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

      try {
        await processIntegrations(c, formId, responses)
      } catch (integrationError) {
        console.error('Error processing integrations:', integrationError)
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

  private async validateRequestSignature(
    c: AppContext,
    formId: string,
    timestamp?: string,
    signature?: string
  ): Promise<boolean> {
    if (!formId || !timestamp || !signature || !c.env.FORM_SUBMISSION_SECRET) {
      return false
    }

    try {
      // Recreate the signature using Web Crypto API (available in Workers)
      const dataToSign = `${formId}:${timestamp}:${c.env.FORM_SUBMISSION_SECRET}`
      const encoder = new TextEncoder()
      const keyData = encoder.encode(c.env.FORM_SUBMISSION_SECRET)
      const dataToSignEncoded = encoder.encode(dataToSign)

      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )

      const signatureBuffer = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, dataToSignEncoded)

      // Convert to hex string
      const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      return this.timingSafeEqual(signature, expectedSignature)
    } catch (error) {
      console.error('Error validating signature:', error)
      return false
    }
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }

    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }

    return result === 0
  }

  // Helper method to check if timestamp is within valid window (5 minutes)
  private isTimestampValid(timestamp: string): boolean {
    const requestTime = parseInt(timestamp, 10)
    if (isNaN(requestTime)) {
      return false
    }

    const currentTime = Date.now()
    const fiveMinutesMs = 5 * 60 * 1000

    return currentTime - requestTime <= fiveMinutesMs
  }
}
