import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { AppContext } from 'lib/types/app-context'
import { HTTPException } from 'hono/http-exception'
import { createMiddleware } from 'hono/factory'
import { ErrorHandler, Logger } from 'utils/error-handling'

export const requireAuth = createMiddleware(async (context: AppContext, next) => {
  try {
    Logger.debug('Checking authentication token', context)

    const authHeader = context.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      Logger.warn('Missing or invalid authorization header', context, {
        hasAuthHeader: !!authHeader,
        headerFormat: authHeader ? 'invalid' : 'missing',
      })
      ErrorHandler.throwUnauthorizedError('Invalid authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data, error } = await supabaseAdminClient(context).auth.getUser(token)

    if (error || !data?.user) {
      Logger.warn('Authentication failed', context, {
        error: error?.message,
        hasData: !!data,
        hasUser: !!data?.user,
      })
      ErrorHandler.throwUnauthorizedError('Invalid or expired token')
    }

    Logger.debug('Authentication successful', context, {
      userId: data.user.id,
      userEmail: data.user.email,
    })

    context.set('user', data.user)
    context.set('authToken', token)
    await next()
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }

    Logger.error('Unexpected error in auth middleware', error, context)
    ErrorHandler.throwUnauthorizedError('Authentication failed')
  }
})
