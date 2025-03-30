import { upsertPriceRecord, deletePriceRecord } from 'utils/data/price'
import { upsertProductRecord, deleteProductRecord } from 'utils/data/product'
import { manageSubscriptionStatusChange, updateStripeUserDetails } from 'utils/data/user'
import { deleteCustomer } from 'utils/data/customer'
import { AppContext } from 'lib/types/app-context'
import { z } from "zod";
import { Bool, OpenAPIRoute, Str } from "chanfana";
import { stripeClient } from 'utils/clients/stripe'

// Stripe requires the raw body to construct the event.
export const config = {
  api: {
    bodyParser: false
  }
}

async function buffer(readable) {
  const chunks = []
  for await (const chunk of readable) {
    chunks.push(
      typeof chunk === "string" ? Buffer.from(chunk) : chunk
    )
  }
  return Buffer.concat(chunks)
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
  'customer.subscription.deleted'
])

export class StripeWebhooks extends OpenAPIRoute {
  schema = {
    tags: ["Stripe"],
    summary: "Stripe Webhooks",
    // Properly define the request structure expected by OpenAPIRoute
    request: {
      // For webhooks, typically we process the raw body, but we can define headers
      headers: z.object({
        'stripe-signature': Str({ description: "Stripe signature header" })
      }),
      // Body schema can be defined loosely as we'll process the raw body
      body: {
        content: {
          "application/json": {
            schema: z.object({}).passthrough(), // Allow any JSON body
          }
        }
      }
    },
    responses: {
      "200": {
        description: "Webhook processed successfully",
        content: {
          "application/json": {
            schema: z.object({
              received: Bool(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    const buf = await buffer(c.req)
    const signature = c.req.header('stripe-signature')
    const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET_LIVE

    let event: any

    try {
      const stripe = stripeClient(c.env.STRIPE_SECRET_KEY_LIVE)
      event = stripe.webhooks.constructEvent(buf, signature, webhookSecret)
      console.log(`Event received: ${event.type}`)
    } catch (err) {
      console.error(`Error message: ${err.message}`)
      return {
        success: false,
        statusCode: 400,
        error: {
          type: 'webhook_error',
          message: 'Webhook Error: cannot construct Stripe event. Check logs for more info.',
        }
      }
    }

    if (relevantEvents.has(event.type)) {
      try {
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
            await manageSubscriptionStatusChange(c,
              event.data.object.id,
              event.data.object.customer,
              event.type === 'customer.subscription.created'
            )
            break
          case 'checkout.session.completed':
            const checkoutSession = event.data.object
            if (checkoutSession.mode === 'subscription') {
              await manageSubscriptionStatusChange(
                c,
                checkoutSession.subscription,
                checkoutSession.customer,
                true
              )
            }
            break
          case 'customer.updated':
            await updateStripeUserDetails(
              c,
              event.data.object.id,
              event.data.object.address,
              event.data.object.invoice_settings?.default_payment_method,
            )
            break
          case 'customer.deleted':
            await deleteCustomer(c, event.data.object.id)
            break
          default:
            console.error('Unknown event type to process.')
            return {
              success: false,
              statusCode: 400,
              error: {
                type: 'unknown_event_type',
                message: 'Unknown event type to process.',
              }
            }
        }
      } catch (error) {
        console.error(error)
        return {
          success: false,
          statusCode: 400,
          error: {
            type: 'failed_to_handle_webhook',
            message: 'Failed to handle webhook. Check the logs for more info.',
          }
        }
      }
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        received: true,
      }
    }
  }
}
