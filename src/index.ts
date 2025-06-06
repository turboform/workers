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
import { GetForm } from 'endpoints/v1/forms/getForm'
import { GetFormById } from 'endpoints/v1/forms/getFormById'
import { GetFormByShortId } from 'endpoints/v1/forms/getFormByShortId'
import { UpdateForm } from 'endpoints/v1/forms/updateForm'
import { PublishForm } from 'endpoints/v1/forms/publishForm'
import { GetForms } from 'endpoints/v1/forms/getForms'
import { CreateForm } from 'endpoints/v1/forms/createForm'
import { GetFormResponses } from 'endpoints/v1/responses/getFormResponses'
import { LinkAnonymousData } from 'endpoints/v1/auth/linkAnonymousData'
import { SendContactEmail } from 'endpoints/v1/contact/sendContactEmail'
import { DeleteForm } from 'endpoints/v1/forms/deleteForm'
import { GetFormIntegrations } from 'endpoints/v1/integrations/getFormIntegrations'
import { CreateFormIntegration } from 'endpoints/v1/integrations/createFormIntegration'
import { UpdateFormIntegration } from 'endpoints/v1/integrations/updateFormIntegration'
import { DeleteFormIntegration } from 'endpoints/v1/integrations/deleteFormIntegration'
import { UploadFormLogo } from 'endpoints/v1/forms/uploadFormLogo'
import { ChatWithResponses } from 'endpoints/v1/chat/chatWithResponses'
import { GetConversations, GetConversationMessages, DeleteConversation } from 'endpoints/v1/chat/conversations'
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
openapi.use('/api/v1/form/create', requireAuth)
openapi.post('/api/v1/form/create', CreateForm)
openapi.get('/api/v1/form/by-id/:id', GetFormById)
openapi.get('/api/v1/form/by-short-id/:shortId', GetFormByShortId)
openapi.use('/api/v1/form/:id', requireAuth)
openapi.get('/api/v1/form/:id', GetForm)
openapi.put('/api/v1/form/:id', UpdateForm)
openapi.use('/api/v1/form/publish', requireAuth)
openapi.post('/api/v1/form/publish', PublishForm)
openapi.use('/api/v1/forms', requireAuth)
openapi.get('/api/v1/forms', GetForms)
openapi.use('/api/v1/form/:id', requireAuth)
openapi.delete('/api/v1/form/:id', DeleteForm)

openapi.use('/api/v1/form/:id/logo', requireAuth)
openapi.post('/api/v1/form/:id/logo', UploadFormLogo)

// Response endpoints
openapi.use('/api/v1/response/*', requireAuth)
openapi.get('/api/v1/response/:formId', GetFormResponses)

// Chat endpoints
openapi.use('/api/v1/chat/form-responses', requireAuth)
openapi.post('/api/v1/chat/form-responses', ChatWithResponses)

// Chat conversation endpoints
openapi.use('/api/v1/chat/conversations/:formId', requireAuth)
openapi.get('/api/v1/chat/conversations/:formId', GetConversations)
openapi.use('/api/v1/chat/conversation/:conversationId/messages', requireAuth)
openapi.get('/api/v1/chat/conversation/:conversationId/messages', GetConversationMessages)
openapi.use('/api/v1/chat/conversation/:conversationId', requireAuth)
openapi.delete('/api/v1/chat/conversation/:conversationId', DeleteConversation)

// Integration endpoints
openapi.use('/api/v1/integrations', requireAuth)
openapi.post('/api/v1/integrations', CreateFormIntegration)
openapi.use('/api/v1/integrations/:id', requireAuth)
openapi.put('/api/v1/integrations/:id', UpdateFormIntegration)
openapi.delete('/api/v1/integrations/:id', DeleteFormIntegration)
openapi.use('/api/v1/form/:formId/integrations', requireAuth)
openapi.get('/api/v1/form/:formId/integrations', GetFormIntegrations)

// Auth endpoints
openapi.use('/api/v1/auth/link-anonymous-data', requireAuth)
openapi.post('/api/v1/auth/link-anonymous-data', LinkAnonymousData)

// Contact endpoints
openapi.post('/api/v1/contact', SendContactEmail)

// Export the Hono app
export default app
