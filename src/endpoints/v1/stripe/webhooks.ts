import { upsertPriceRecord, deletePriceRecord } from 'utils/data/price'
import { upsertProductRecord, deleteProductRecord } from 'utils/data/product'
import { manageSubscriptionStatusChange, updateStripeUserDetails } from 'utils/data/user'
import { deleteCustomer } from 'utils/data/customer'
import { AppContext } from 'lib/types/app-context'
import { z } from 'zod'
import { Bool, OpenAPIRoute, Str } from 'chanfana'
import { stripeClient } from 'utils/clients/stripe'

// Stripe requires the raw body to construct the event.
export const config = {
  api: {
    bodyParser: false,
  },
}

const relevantEvents = new Set([
  'product.created',
  'product.updated',
  'product.deleted',
  'price.created',
  'price.updated',
  'price.deleted',
  'checkout.session.completed',
  'customer.deleted',
  'customer.updated',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

export class StripeWebhooks extends OpenAPIRoute {
  schema = {
    tags: ['Stripe'],
    summary: 'Stripe Webhooks',
    // Properly define the request structure expected by OpenAPIRoute
    request: {
      // For webhooks, typically we process the raw body, but we can define headers
      headers: z.object({
        'stripe-signature': Str({ description: 'Stripe signature header' }),
      }),
      // Body schema can be defined loosely as we'll process the raw body
      body: {
        content: {
          'application/json': {
            schema: z.object({}).passthrough(), // Allow any JSON body
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Webhook processed successfully',
        content: {
          'application/json': {
            schema: z.object({
              received: Bool(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    const buf = await c.req.text()
    const signature = c.req.header('stripe-signature')
    const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET_LIVE

    const stripe = stripeClient(c.env.STRIPE_SECRET_KEY_LIVE)
    const event = (await stripe.webhooks.constructEventAsync(buf, signature, webhookSecret)) as any
    console.log(`Event received: ${event.type}`)

    if (relevantEvents.has(event.type)) {
      switch (event.type) {
        case 'product.created':
        case 'product.updated':
          await upsertProductRecord(c, event.data.object)
          break
        case 'product.deleted':
          await deleteProductRecord(c, event.data.object)
          break
        case 'price.created':
        case 'price.updated':
          await upsertPriceRecord(c, event.data.object)
          break
        case 'price.deleted':
          await deletePriceRecord(c, event.data.object)
          break
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await manageSubscriptionStatusChange(
            c,
            event.data.object.id,
            event.data.object.customer,
            event.type === 'customer.subscription.created'
          )
          break
        case 'checkout.session.completed':
          const checkoutSession = event.data.object
          if (checkoutSession.mode === 'subscription') {
            await manageSubscriptionStatusChange(c, checkoutSession.subscription, checkoutSession.customer, true)
          }
          break
        case 'customer.updated':
          await updateStripeUserDetails(
            c,
            event.data.object.id,
            event.data.object.address,
            event.data.object.invoice_settings?.default_payment_method
          )
          break
        case 'customer.deleted':
          await deleteCustomer(c, event.data.object.id)
          break
        default:
          throw new Error(`Unknown event type: ${event.type}`)
      }
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        received: true,
      },
    }
  }
}
