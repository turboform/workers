import { HTTPException } from 'hono/http-exception'
import { Context } from 'hono'

export interface ErrorResponse {
  status: number
  message: string
  error?: string
  correlationId?: string
  timestamp: string
}

export interface LogContext {
  correlationId?: string
  userId?: string
  endpoint?: string
  method?: string
  userAgent?: string
  [key: string]: any
}

export class Logger {
  private static generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  static getCorrelationId(c: Context): string {
    const existingId = c.get('correlationId')
    if (existingId) return existingId

    const newId = this.generateCorrelationId()
    c.set('correlationId', newId)
    return newId
  }

  private static createLogContext(c: Context, additionalContext?: LogContext): LogContext {
    const correlationId = this.getCorrelationId(c)

    return {
      correlationId,
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('user-agent'),
      ...additionalContext,
    }
  }

  static info(message: string, c: Context, context?: LogContext) {
    const logContext = this.createLogContext(c, context)
    // Using console.log for structured logging output
    console.log(
      JSON.stringify({
        level: 'info',
        message,
        ...logContext,
      })
    )
  }

  static warn(message: string, c: Context, context?: LogContext) {
    const logContext = this.createLogContext(c, context)
    // Using console.warn for structured logging output
    console.warn(
      JSON.stringify({
        level: 'warn',
        message,
        ...logContext,
      })
    )
  }

  static error(message: string, error: any, c: Context, context?: LogContext) {
    const logContext = this.createLogContext(c, context)
    // Using console.error for structured logging output
    console.error(
      JSON.stringify({
        level: 'error',
        message,
        error: {
          message: error?.message || String(error),
          stack: error?.stack,
          name: error?.name,
        },
        ...logContext,
      })
    )
  }

  static debug(message: string, c: Context, context?: LogContext) {
    const logContext = this.createLogContext(c, context)
    // Using console.debug for structured logging output
    console.debug(
      JSON.stringify({
        level: 'debug',
        message,
        ...logContext,
      })
    )
  }
}

export class ErrorHandler {
  static createErrorResponse(status: number, message: string, c: Context, error?: string): ErrorResponse {
    return {
      status,
      message,
      error,
      correlationId: Logger.getCorrelationId(c),
      timestamp: new Date().toISOString(),
    }
  }

  static handleError(error: any, c: Context, endpoint?: string) {
    if (error instanceof HTTPException) {
      if (error.status < 500) {
        Logger.warn('Client error occurred', c, {
          endpoint,
          status: error.status,
          errorMessage: error.message,
        })

        const errorResponse = this.createErrorResponse(error.status, error.message, c)
        return c.json(errorResponse, { status: error.status })
      } else {
        Logger.error('Server error occurred', error, c, { endpoint })

        const errorResponse = this.createErrorResponse(500, 'Internal server error', c, error.message)
        return c.json(errorResponse, { status: 500 })
      }
    }

    Logger.error('Unhandled error occurred', error, c, { endpoint })

    const errorResponse = this.createErrorResponse(500, 'Internal server error', c, error.message)
    return c.json(errorResponse, { status: 500 })
  }

  static throwValidationError(message: string, field?: string): never {
    throw new HTTPException(400, {
      message: field ? `${field}: ${message}` : message,
    })
  }

  static throwNotFoundError(resource: string, id?: string): never {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`
    throw new HTTPException(404, { message })
  }

  static throwUnauthorizedError(message = 'Unauthorized'): never {
    throw new HTTPException(401, { message })
  }

  static throwForbiddenError(message = 'Forbidden'): never {
    throw new HTTPException(403, { message })
  }

  static throwConflictError(message: string): never {
    throw new HTTPException(409, { message })
  }

  static throwTooManyRequestsError(message = 'Too many requests'): never {
    throw new HTTPException(429, { message })
  }

  static throwExternalServiceError(service: string, originalError?: any): never {
    throw new HTTPException(503, {
      message: `${service} service is currently unavailable`,
    })
  }
}

export function withErrorHandling(handler: (c: Context) => Promise<any>, endpoint: string) {
  return async (c: Context): Promise<any> => {
    try {
      Logger.debug(`${endpoint} request started`, c)
      const response = await handler(c)
      Logger.debug(`${endpoint} request completed successfully`, c, {
        status: response.status,
      })
      return response
    } catch (error) {
      return ErrorHandler.handleError(error, c, endpoint)
    }
  }
}
