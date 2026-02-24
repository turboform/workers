import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'
import { Logger } from 'utils/error-handling'

export class GetForms extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Get all forms for the authenticated user',
    responses: {
      '200': {
        description: 'Forms retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              forms: z.array(z.any()),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      const user = c.get('user')
      const authToken = c.get('authToken')

      // Get forms for the user
      const { data: allForms, error: dbError } = await supabaseApiClient(authToken, c)
        .from('forms')
        .select('*')
        .order('created_at', { ascending: false })

      if (dbError) {
        Logger.error('Error getting forms', dbError, c)
        throw new HTTPException(500, { message: 'Failed to get forms' })
      }

      // Filter forms to show only the current user's forms
      const userForms = allForms?.filter((form) => form.user_id === user.id) || []

      // Get response counts for each form
      const formIds = userForms.map((form) => form.id)

      if (formIds.length > 0) {
        const { data: responseData, error: responseError } = await supabaseApiClient(authToken, c)
          .from('form_responses')
          .select('form_id, count')
          .in('form_id', formIds)
          .select('form_id')
          .then(({ data, error }) => {
            if (error) return { data: null, error }

            // Count responses for each form
            const counts: Record<string, number> = {}
            data?.forEach((row: any) => {
              counts[row.form_id] = (counts[row.form_id] || 0) + 1
            })

            return { data: counts, error: null }
          })

        if (!responseError && responseData) {
          // Add response counts to forms
          userForms.forEach((form) => {
            ;(form as any).responseCount = responseData[form.id] || 0
          })
        }
      }

      return { forms: userForms }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      Logger.error('Error in getForms', error, c)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
