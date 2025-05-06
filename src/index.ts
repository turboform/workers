import { Hono } from 'hono'
import { fromHono } from 'chanfana'
import { StripeWebhooks } from 'endpoints/v1/stripe/webhooks'
import { CreatePortalLink } from 'endpoints/v1/stripe/portal-link'
import { CreateCheckoutSession } from 'endpoints/v1/stripe/session'
import { GetUserDetails } from 'endpoints/v1/user/getUserDetails'
import { ProcessEmbeddings } from 'endpoints/v1/embeddings/processEmbeddings'
import { QuestionAnswering } from 'endpoints/v1/embeddings/questionAnswering'
import { SubmitFormResponse } from 'endpoints/v1/forms/submitFormResponse'
import { GenerateForm } from 'endpoints/v1/forms/generateForm'
import { GetFormResponses } from 'endpoints/v1/responses/getFormResponses'
import { requireAuth } from 'utils/auth/middleware'
import { HTTPException } from 'hono/http-exception'

// Start a Hono app
const app = new Hono()

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: '/',
})

app.onError((e, c) => {
  // TODO: refine error handling
  console.error('Error in Hono:', JSON.stringify(e))
  if (e instanceof HTTPException && e.status < 500) {
    return c.json(
      {
        status: e.status,
        message: e.message,
      },
      { status: e.status }
    )
  }

  return c.json(
    {
      status: 500,
      message: 'Internal server error',
    },
    { status: 500 }
  )
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
openapi.post('/api/v1/stripe/webhooks', StripeWebhooks)
openapi.use('/api/v1/stripe/portal-link', requireAuth)
openapi.post('/api/v1/stripe/portal-link', CreatePortalLink)
openapi.use('/api/v1/stripe/session', requireAuth)
openapi.post('/api/v1/stripe/session', CreateCheckoutSession)

// User endpoints
openapi.use('/api/v1/user/*', requireAuth)
openapi.get('/api/v1/user', GetUserDetails)

// Embedding endpoints
openapi.use('/api/v1/embedding/question', requireAuth)
openapi.post('/api/v1/embedding/question', QuestionAnswering)
openapi.post('/api/v1/embedding/process', ProcessEmbeddings)

// Form endpoints
openapi.post('/api/v1/form/submit', SubmitFormResponse)
openapi.use('/api/v1/form/generate', requireAuth)
openapi.post('/api/v1/form/generate', GenerateForm)

// Response endpoints
openapi.use('/api/v1/response/*', requireAuth)
openapi.get('/api/v1/response/:formId', GetFormResponses)

// Export the Hono app
export default app
