import { stripeClient } from 'utils/clients/stripe'
import { getOrCreateCustomer } from 'utils/data/customer'
import { ProtectedRoute } from 'utils/auth/protected-route'
import { OpenAPIRoute, Str, Int } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { User } from '@supabase/supabase-js'

export class CreateCheckoutSession extends OpenAPIRoute {
  schema = {
    tags: ["Stripe"],
    summary: "Create Checkout Session",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              priceId: Str({ description: "Price ID" }),
              quantity: Int({ description: "Quantity" }),
              metadata: z.record(z.string(), z.string()).optional(),
            }),
          },
        },
      },
      responses: {
        "200": {
          description: "Checkout session created successfully",
          content: {
            "application/json": {
              schema: z.object({
                sessionId: Str({ description: "Checkout session ID" }),
              }),
            },
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    return ProtectedRoute(c, async (authToken: string, user: User) => {
      const stripe = stripeClient(c.env.STRIPE_SECRET_KEY_LIVE)
      const { priceId, quantity = 1, metadata = {} } = await c.req.json()
      const customerId = await getOrCreateCustomer(c, user.id, user.email)
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity
          }
        ],
        mode: 'subscription',
        allow_promotion_codes: true,
        subscription_data: {
          metadata
        },
        success_url: c.env.CHECKOUT_SUCCESS_REDIRECT_URL,
        cancel_url: c.env.CHECKOUT_CANCEL_REDIRECT_URL,
      })

      return { sessionId: session.id }
    })
  }
}
