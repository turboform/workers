import { stripeClient } from 'utils/clients/stripe'
import { getOrCreateCustomer } from 'utils/data/customer'
import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'

export class CreatePortalLink extends OpenAPIRoute {
  schema = {
    tags: ['Stripe'],
    summary: 'Create Billing Portal Link',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({}),
          },
        },
      },
      responses: {
        '200': {
          description: 'Billing portal link created successfully',
          content: {
            'application/json': {
              schema: z.object({
                url: Str({ description: 'Billing portal URL' }),
              }),
            },
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    const stripe = stripeClient(c.env.STRIPE_SECRET_KEY_LIVE)
    const user = c.get('user')
    const customerId = await getOrCreateCustomer(c, user.id, user.email)
    const { url } = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: c.env.STRIPE_SESSION_REDIRECT_URL,
    })

    return c.json({ url })
  }
}
