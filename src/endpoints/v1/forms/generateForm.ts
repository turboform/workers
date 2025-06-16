import { z } from 'zod'
import crypto from 'crypto'
import { OpenAPIRoute } from 'chanfana'
import { FormField } from 'lib/types/form'
import { HTTPException } from 'hono/http-exception'
import { AppContext } from 'lib/types/app-context'
import { openAIClient } from 'utils/clients/openai'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { ErrorHandler, Logger, withErrorHandling } from 'utils/error-handling'

export class GenerateForm extends OpenAPIRoute {
  schema = {
    tags: ['Forms'],
    summary: 'Generate a form using natural language',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              description: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Form generated successfully',
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              title: z.string(),
              description: z.string(),
              schema: z.any(),
              is_draft: z.boolean(),
              short_id: z.string(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    return withErrorHandling(async (c: AppContext) => {
      const { description } = await c.req.json()
      const user = c.get('user')

      if (!description?.trim()) {
        ErrorHandler.throwValidationError('Description is required and cannot be empty', 'description')
      }

      Logger.info('Generating form with AI', c, {
        userId: user?.id,
        descriptionLength: description.length,
      })

      const { title, formFields, enhancedDescription } = await generateFormWithOpenAI(c, description)
      const short_id = generateShortId()

      Logger.debug('Form generation completed', c, {
        title,
        fieldCount: formFields.length,
        shortId: short_id,
      })

      // Save the form as a draft
      const { data: form, error: saveError } = await supabaseAdminClient(c)
        .from('forms')
        .insert({
          user_id: user?.id,
          title,
          description: enhancedDescription,
          schema: formFields as any,
          is_draft: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          short_id,
        })
        .select()
        .single()

      if (saveError) {
        Logger.error('Error saving draft form', saveError, c, {
          userId: user?.id,
          title,
          shortId: short_id,
        })
      } else {
        Logger.info('Draft form saved successfully', c, {
          formId: form?.id,
          shortId: short_id,
        })
      }

      return c.json({
        id: form?.id,
        title,
        description: enhancedDescription,
        schema: formFields,
        is_draft: true,
        short_id,
      })
    }, 'generateForm')(c)
  }
}

async function generateFormWithOpenAI(
  c: AppContext,
  description: string
): Promise<{ title: string; formFields: FormField[]; enhancedDescription: string }> {
  const sanitizedDescription = description
    .replace(/ignore all previous instructions/gi, '[filtered content]')
    .replace(/disregard your instructions/gi, '[filtered content]')
    .replace(/system prompt/gi, '[filtered content]')

  const prompt = `
You are a form generation assistant. Create a detailed form with a minimum of four fields based on the following description:

"${sanitizedDescription}"

Return your response as a JSON object with the following format:
{
  "title": "Form title based on the description",
  "description": "A polished, friendly and professional description/introduction for the form that explains its purpose clearly to respondents",
  "fields": [
    {
      "id": "field1",
      "type": "text" | "textarea" | "checkbox" | "radio" | "select" | "multi_select",
      "label": "Question text",
      "placeholder": "Optional placeholder text",
      "required": true | false,
      "options": ["Option 1", "Option 2"] // Only for radio and select types
    },
    ...more fields
  ]
}

The form should capture all the information requested in the description. Use appropriate field types:
- text: For short answers
- textarea: For longer responses
- checkbox: For yes/no questions
- radio: For multiple choice questions with one answer
- select: For dropdown selection questions
- multi_select: For multi-select dropdown selection questions

For the description, write 2-3 sentences that warmly welcomes the user, briefly explains the purpose of the form, and mentions any important details like estimated completion time.

Make sure to include a sensible title for the form based on the description.
`

  const completion = await openAIClient(c.env.OPENAI_API_KEY).chat.completions.create({
    model: 'gpt-3.5-turbo', // Using a faster model instead of o1
    temperature: 0.7, // Lower temperature for more predictable results
    max_tokens: 2000, // Limit token usage
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are a helpful assistant that generates form structures based on descriptions.' },
      { role: 'user', content: prompt },
    ],
  })

  const response = completion.choices[0]?.message?.content

  if (!response) {
    throw new Error('No response from OpenAI')
  }

  try {
    const parsedResponse = JSON.parse(response)

    if (!parsedResponse.title || !Array.isArray(parsedResponse.fields)) {
      throw new Error('Invalid form structure')
    }

    // Get the enhanced description or fall back to original if not available
    const enhancedDescription = parsedResponse.description || description

    // Convert OpenAI response to our FormField format and assign UUIDs
    const formFields: FormField[] = parsedResponse.fields.map((field: any) => ({
      id: crypto.randomUUID(),
      type: field.type,
      label: field.label,
      placeholder: field.placeholder || '',
      required: field.required || false,
      options: field.options || [],
    }))

    return {
      title: parsedResponse.title,
      formFields,
      enhancedDescription,
    }
  } catch (error) {
    console.error('Error parsing OpenAI response:', error)
    // Fallback to generate a basic title if parsing fails
    return {
      title: generateFallbackTitle(description),
      formFields: [],
      enhancedDescription: description,
    }
  }
}

// Fallback title generation function
function generateFallbackTitle(description: string): string {
  const words = description.split(' ')
  const title = words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '')
  return title.charAt(0).toUpperCase() + title.slice(1)
}

function generateShortId(length = 8): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}
