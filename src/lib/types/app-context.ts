import { type Context } from 'hono'
import { User } from '@supabase/supabase-js'

export type Env = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  STRIPE_SECRET_KEY_LIVE: string
  STRIPE_WEBHOOK_SECRET_LIVE: string
  STRIPE_SESSION_REDIRECT_URL: string
  CHECKOUT_SUCCESS_REDIRECT_URL: string
  CHECKOUT_CANCEL_REDIRECT_URL: string
  OPENAI_API_KEY: string
  RESEND_API_KEY: string
  FORM_SUBMISSION_SECRET: string
}

export type AppContext = Context<{
  Bindings: Env
  Variables: {
    user: User
    authToken: string
  }
}>
