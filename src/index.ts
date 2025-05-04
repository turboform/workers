import { Hono } from 'hono'
import { fromHono } from 'chanfana'
import { StripeWebhooks } from 'endpoints/v1/stripe/webhooks'
import { CreatePortalLink } from 'endpoints/v1/stripe/portal-link'
import { CreateCheckoutSession } from 'endpoints/v1/stripe/session'
import { GetUserDetails } from 'endpoints/v1/user/getUserDetails'
import { ProcessEmbeddings } from 'endpoints/v1/embeddings/processEmbeddings'
import { QuestionAnswering } from 'endpoints/v1/embeddings/questionAnswering'
import { SubmitFormResponse } from 'endpoints/v1/forms/submitFormResponse'
import { AuthMiddleware } from 'utils/auth/middleware'

// Start a Hono app
const app = new Hono()

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: '/',
})

// TODO: legacy routes - delete when no longer used
openapi.post('/v1/stripe/webhooks', StripeWebhooks)
openapi.post('/v1/stripe/portal-link', CreatePortalLink)
openapi.post('/v1/stripe/session', CreateCheckoutSession)

openapi.get('/v1/user', GetUserDetails)

// Embedding endpoints
openapi.post('/v1/embeddings/process', ProcessEmbeddings)
openapi.post('/v1/embeddings/question', QuestionAnswering)

// Use these endpoints instead of the legacy ones

// Stripe endpoints
openapi.use('/api/v1/stripe/*', AuthMiddleware)
openapi.post('/api/v1/stripe/webhooks', StripeWebhooks)
openapi.post('/api/v1/stripe/portal-link', CreatePortalLink)
openapi.post('/api/v1/stripe/session', CreateCheckoutSession)

// User endpoints
openapi.use('/api/v1/user/*', AuthMiddleware)
openapi.get('/api/v1/user', GetUserDetails)

// Embedding endpoints
openapi.use('/api/v1/embeddings/question', AuthMiddleware)
openapi.post('/api/v1/embeddings/question', QuestionAnswering)
openapi.post('/api/v1/embeddings/process', ProcessEmbeddings)

// Form endpoints
openapi.post('/api/v1/forms/submit', SubmitFormResponse)

// Export the Hono app
export default app
