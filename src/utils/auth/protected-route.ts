import { User } from '@supabase/supabase-js'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { AppContext } from 'lib/types/app-context'
import { HTTPException } from 'hono/http-exception'

export async function ProtectedRoute(
  context: AppContext,
  callback: (authToken: string, user: User) => Promise<object>
) {
  try {
    const authHeader = context.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Invalid authorization header.' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data, error } = await supabaseAdminClient(context).auth.getUser(token)
    if (error || !data) {
      throw new HTTPException(401, { message: 'Unauthorized.' })
    }

    const response = await callback(token, data.user!)
    return response
  } catch (error) {
    console.error('Error in protected route:', error)
    throw new HTTPException(500, { message: 'Internal server error.' })
  }
}
