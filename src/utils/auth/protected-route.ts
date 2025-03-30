import { User } from '@supabase/supabase-js';
import { supabaseAdminClient } from 'utils/clients/supabase/admin';
import { AppContext } from 'lib/types/app-context';

export async function ProtectedRoute(
  context: AppContext,
  callback: (
    authToken: string,
    user: User,
  ) => Promise<object>,
) {
  try {
    const authHeader = context.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        success: false,
        statusCode: 401,
        error: {
          type: 'unauthorized',
          message: 'Invalid authorization header.',
        }
      }
    }

    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabaseAdminClient.auth.getUser(token)
    if (error || !data) {
      return {
        success: false,
        statusCode: 401,
        error: {
          type: 'unauthorized',
          message: 'Unauthorized.',
        }
      }
    }

    const response = await callback(token, data.user!)
    return response
  }
  catch (error) {
    return {
      success: false,
      statusCode: 500,
      error: {
        type: 'internal_server_error',
        message: 'Internal server error.',
      }
    }
  }
}
