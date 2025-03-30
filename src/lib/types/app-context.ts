import { type Context } from 'hono';

export type Env = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export type AppContext = Context<{ Bindings: Env }>
