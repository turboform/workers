import { Hono } from 'hono'
import { fromHono } from 'chanfana'
import { StripeWebhooks } from 'endpoints/v1/stripe/webhooks'
import { CreatePortalLink } from 'endpoints/v1/stripe/portal-link'
import { CreateCheckoutSession } from 'endpoints/v1/stripe/session'
import { GetUserDetails } from 'endpoints/v1/user/getUserDetails'

// Start a Hono app
const app = new Hono()

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: '/', // TODO: hide docs when in production
})

openapi.post('/v1/stripe/webhooks', StripeWebhooks)
openapi.post('/v1/stripe/portal-link', CreatePortalLink)
openapi.post('/v1/stripe/session', CreateCheckoutSession)

openapi.get('/v1/user', GetUserDetails)

// Export the Hono app
export default app
