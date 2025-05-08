import { OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'
import { AppContext } from 'lib/types/app-context'
import { HTTPException } from 'hono/http-exception'
import { Resend } from 'resend'

export class SendContactEmail extends OpenAPIRoute {
  schema = {
    tags: ['Contact'],
    summary: 'Send a contact form email',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: Str({ description: 'Name of the person sending the message' }),
              email: Str({ description: 'Email of the person sending the message' }),
              subject: Str({ description: 'Subject of the message' }),
              message: Str({ description: 'Message content' }),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Email sent successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    try {
      // Parse the request body
      const { name, email, subject, message } = await c.req.json()

      // Validate the required fields
      if (!name || !email || !subject || !message) {
        throw new HTTPException(400, { message: 'Missing required fields' })
      }

      const resend = new Resend(c.env.RESEND_API_KEY)

      // Send email using Resend
      const { data, error } = await resend.emails.send({
        from: 'Turboform Contact Form <contact@mail.turboform.ai>',
        to: 'nico@turboform.ai',
        subject: `Contact Form: ${subject}`,
        replyTo: email,
        text: `
Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}
        `,
        html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4f46e5; margin-bottom: 20px;">New Contact Form Submission</h2>
  <p><strong>Name:</strong> ${name}</p>
  <p><strong>Email:</strong> ${email}</p>
  <p><strong>Subject:</strong> ${subject}</p>
  <div style="margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 5px;">
    <p><strong>Message:</strong></p>
    <p style="white-space: pre-wrap;">${message}</p>
  </div>
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
    <p>This email was sent from the Turboform contact form.</p>
  </div>
</div>
        `,
      })

      if (error) {
        console.error('Error sending email:', error)
        throw new HTTPException(500, { message: 'Failed to send email' })
      }

      return {
        success: true,
        message: 'Email sent successfully',
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Error processing contact form:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
}
