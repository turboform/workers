import { stripeClient } from 'utils/clients/stripe'
import { getOrCreateCustomer } from 'utils/data/customer'
import { ProtectedRoute } from 'utils/auth/protected-route'
import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { User } from '@supabase/supabase-js'

export class CreatePortalLink extends OpenAPIRoute {
  schema = {
    tags: ["Stripe"],
    summary: "Create Billing Portal Link",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({}),
          },
        },
      },
      responses: {
        "200": {
          description: "Billing portal link created successfully",
          content: {
            "application/json": {
              schema: z.object({
                url: Str({ description: "Billing portal URL" }),
              }),
            },
          },
        },
      },
    }
  }

  async handle(c: AppContext) {
    return ProtectedRoute(c, async (authToken: string, user: User) => {
      const customerId = await getOrCreateCustomer(user.id, user.email)
      const { url } = await stripeClient.billingPortal.sessions.create({
        customer: customerId,
        return_url: process.env.STRIPE_SESSION_REDIRECT_URL,
      })

      return { url }
    })
  }
}
