import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { getSubscriptionForUser } from 'utils/data/user'
import { HTTPException } from 'hono/http-exception'

export class GetUserDetails extends OpenAPIRoute {
  schema = {
    tags: ['User'],
    summary: 'Get User Details',
    responses: {
      '200': {
        description: 'User details retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              id: Str({ description: 'User ID' }),
              email: Str({ description: 'User email' }),
              full_name: Str({ description: 'User name' }),
              subscription: z.object({
                id: Str({ description: 'Subscription ID' }),
                status: Str({ description: 'Subscription status' }),
                price: z.object({
                  id: Str({ description: 'Price ID' }),
                  product: z.object({
                    id: Str({ description: 'Product ID' }),
                    name: Str({ description: 'Product name' }),
                    description: Str({ description: 'Product description' }),
                  }),
                }),
              }),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    const user = c.get('user')
    const authToken = c.get('authToken')

    const { data: userDetails, error } = await supabaseApiClient(authToken, c)
      .from('user_details')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      throw new HTTPException(404, { message: `Couldn't fetch user details for ${user.id}: ${error.message}` })
    }

    const subscription = await getSubscriptionForUser(c, user.id)

    return c.json({
      ...userDetails,
      subscription: subscription || null,
    })
  }
}
