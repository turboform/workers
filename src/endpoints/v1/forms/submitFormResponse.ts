import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { processIntegrations } from 'utils/integrations/processIntegrations'
import { ErrorHandler, Logger, withErrorHandling } from 'utils/error-handling'

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
    return withErrorHandling(async (c: AppContext) => {
      const timestamp = c.req.header('X-Turboform-Timestamp')
      const signature = c.req.header('X-Turboform-Signature')

      Logger.info('Form submission request received', c, {
        hasTimestamp: !!timestamp,
        hasSignature: !!signature,
      })

      const { formId, responses } = await c.req.json()

      if (!formId) {
        ErrorHandler.throwValidationError('Form ID is required', 'formId')
      }

      if (!responses || typeof responses !== 'object') {
        ErrorHandler.throwValidationError('Responses are required and must be an object', 'responses')
      }

      Logger.debug('Validating form submission', c, {
        formId,
        responseCount: Object.keys(responses).length,
      })

      // Validate request signature
      if (!(await this.validateRequestSignature(c, formId, timestamp, signature))) {
        Logger.warn('Form submission failed signature validation', c, {
          formId,
          hasTimestamp: !!timestamp,
          hasSignature: !!signature,
        })
        ErrorHandler.throwForbiddenError('Invalid or missing signature')
      }

      // Check for timestamp freshness (within 5 minutes)
      if (!timestamp || !this.isTimestampValid(timestamp)) {
        Logger.warn('Form submission failed timestamp validation', c, {
          formId,
          timestamp,
          isExpired: timestamp ? !this.isTimestampValid(timestamp) : 'missing',
        })
        ErrorHandler.throwForbiddenError('Request expired or invalid timestamp')
      }

      // Check if the form exists and is not a draft
      // TODO: check form expiration date
      const { error } = await supabaseAdminClient(c).from('form_responses').insert({
        form_id: formId,
        responses,
      })

      if (error) {
        Logger.error('Database error submitting form response', error, c, {
          formId,
          responseCount: Object.keys(responses).length,
        })
        ErrorHandler.throwExternalServiceError('Database')
      }

      Logger.info('Form response submitted successfully', c, {
        formId,
        responseCount: Object.keys(responses).length,
      })

      // Process integrations (non-blocking errors)
      try {
        await processIntegrations(c, formId, responses)
        Logger.info('Form integrations processed successfully', c, { formId })
      } catch (integrationError) {
        Logger.error('Error processing form integrations', integrationError, c, {
          formId,
          step: 'integration-processing',
        })
      }

      return c.json({
        success: true,
        message: 'Form response submitted successfully',
      })
    }, 'submitFormResponse')(c)
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
      Logger.error('Error validating request signature', error, c, {
        formId,
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
      })
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
