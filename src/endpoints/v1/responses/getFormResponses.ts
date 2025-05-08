import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { supabaseApiClient } from 'utils/clients/supabase/api'
import { HTTPException } from 'hono/http-exception'

export class GetFormResponses extends OpenAPIRoute {
  schema = {
    tags: ['Responses'],
    summary: 'Get form responses by form ID',
    request: {
      query: z.object({
        formId: z.string(),
      }),
    },
    responses: {
      '200': {
        description: 'Form responses retrieved successfully',
        content: {
          'application/json': {
            schema: z.array(
              z.object({
                id: z.string(),
                created_at: z.string(),
                responses: z.array(
                  z.object({
                    question: z.string(),
                    answer: z.string(),
                  })
                ),
              })
            ),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    const formId = c.req.param('formId')
    const authToken = c.get('authToken')

    const { data: responses, error } = await supabaseApiClient(authToken, c)
      .from('form_responses')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new HTTPException(500, { message: `Couldn't fetch form responses for ${formId}: ${error.message}` })
    }

    return c.json(
      responses.map((response) => ({
        id: response.id,
        created_at: response.created_at,
        responses: response.responses,
      }))
    )
  }
}
