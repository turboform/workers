import { User } from '@supabase/supabase-js';
import { supabaseAdminClient } from 'utils/clients/supabase/admin';
import { AppContext } from 'lib/types/app-context';

export async function ProtectedRoute(
  context: AppContext,
  callback: (
    authToken: string,
    user: User,
  ) => Promise<Response>,
) {
  try {
    const authHeader = context.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({
        error: {
          statusCode: 401,
          type: 'unauthorized',
          message: 'Invalid authorization header.',
        }
      }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabaseAdminClient.auth.getUser(token)
    if (error || !data) {
      return Response.json({
        error: {
          statusCode: 401,
          type: 'unauthorized',
          message: 'Unauthorized.',
        }
      }, { status: 401 })
    }

    const response = await callback(token, data.user!)
    return response
  }
  catch (error) {
    return Response.json({
      error: {
        statusCode: 500,
        type: 'internal_server_error',
        message: 'Internal server error.',
      }
    }, { status: 500 })
  }
}
