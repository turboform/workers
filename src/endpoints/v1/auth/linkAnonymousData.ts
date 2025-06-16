import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { HTTPException } from 'hono/http-exception'
import { Logger } from 'utils/error-handling'

export class LinkAnonymousData extends OpenAPIRoute {
  schema = {
    tags: ['Auth'],
    summary: 'Link anonymous user data to an authenticated user',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              anonymousUserId: z.string().describe('Anonymous user ID'),
              targetUserId: z.string().describe('Target user ID to transfer data to'),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Data linked successfully',
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
      const user = c.get('user')
      const { anonymousUserId, targetUserId } = await c.req.json()

      if (!anonymousUserId || !targetUserId) {
        throw new HTTPException(400, { message: 'Missing required user IDs' })
      }

      // SECURITY CHECK: Ensure targetUserId matches the authenticated user's ID
      if (targetUserId !== user.id) {
        throw new HTTPException(403, { message: 'Unauthorized - You can only transfer data to your own account' })
      }

      // SECURITY CHECK: Verify the anonymous user is actually anonymous
      const { data: anonymousUserData, error: userCheckError } =
        await supabaseAdminClient(c).auth.admin.getUserById(anonymousUserId)

      if (userCheckError || !anonymousUserData) {
        throw new HTTPException(400, { message: 'Invalid source user ID' })
      }

      // Verify the source user is actually anonymous
      if (!anonymousUserData.user?.is_anonymous) {
        throw new HTTPException(403, { message: 'Unauthorized - Can only transfer data from anonymous accounts' })
      }

      // Transfer all forms from the anonymous user to the registered user
      const { error: transferError } = await supabaseAdminClient(c)
        .from('forms')
        .update({ user_id: targetUserId })
        .eq('user_id', anonymousUserId)

      if (transferError) {
        Logger.error('Error transferring forms', transferError, c)
        throw new HTTPException(500, { message: 'Failed to transfer forms' })
      }

      return { success: true }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      Logger.error('Error in linkAnonymousData', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
