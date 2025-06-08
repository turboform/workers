import { Resend } from 'resend'
import axios from 'axios'
import { IntegrationType, FormIntegration } from 'lib/types/integration'
import type { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { Database } from 'lib/types/database.types'
import { Logger } from 'utils/error-handling'

type Form = Database['public']['Tables']['forms']['Row']

export async function processIntegrations(c: AppContext, formId: string, responses: Record<string, any>) {
  try {
    const { data: form, error: formError } = await supabaseAdminClient(c)
      .from('forms')
      .select('*')
      .eq('id', formId)
      .single()

    if (formError || !form) {
      Logger.error('Error fetching form for integration processing', formError, c)
      return
    }

    const { data: integrations, error: integrationsError } = await supabaseAdminClient(c)
      .from('form_integrations')
      .select('*')
      .eq('form_id', formId)
      .eq('is_enabled', true)

    if (integrationsError) {
      Logger.error('Error fetching integrations', integrationsError, c)
      return
    }

    for (const integration of integrations) {
      await processIntegration(c, integration, form, responses)
    }
  } catch (error) {
    Logger.error('Error processing integrations', error, c)
  }
}

async function processIntegration(
  c: AppContext,
  integration: FormIntegration,
  form: Form,
  responses: Record<string, any>
) {
  const { integration_type, config } = integration

  try {
    switch (integration_type as IntegrationType) {
      case 'email':
        await processEmailIntegration(c, config, form, responses)
        break
      case 'slack':
        await processSlackIntegration(config, form, responses)
        break
      case 'telegram':
        await processTelegramIntegration(config, form, responses)
        break
      case 'zapier':
        await processZapierIntegration(config, form, responses)
        break
      case 'make':
        await processMakeIntegration(config, form, responses)
        break
      case 'webhook':
        await processWebhookIntegration(config, form, responses)
        break
      default:
        Logger.warn(`Unknown integration type: ${integration_type}`, c)
    }
  } catch (error) {
    Logger.error(`Error processing ${integration_type} integration`, error, c)
  }
}

async function processEmailIntegration(c: AppContext, config: any, form: Form, responses: Record<string, any>) {
  try {
    const { to, cc, subject_template } = config

    if (!to || !Array.isArray(to) || to.length === 0) {
      Logger.error('Invalid email configuration: missing recipients', null, c)
      return
    }

    const resendApiKey = c.env.RESEND_API_KEY
    if (!resendApiKey) {
      Logger.error('Resend API key not configured', null, c)
      return
    }

    const resend = new Resend(resendApiKey)

    const formattedResponses = Object.entries(responses)
      .map(([key, value]) => {
        const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
        return `<p><strong>${question}:</strong> ${value}</p>`
      })
      .join('\n')

    const subject = subject_template
      ? subject_template.replace('{form_name}', form.title)
      : `New submission for ${form.title}`

    const response = await resend.emails.send({
      from: 'notifications@mail.turboform.ai',
      to,
      cc: cc || [],
      subject,
      html: `
        <h1>New Form Submission</h1>
        <p>You have received a new submission for the form: <strong>${form.title}</strong></p>
        <h2>Responses:</h2>
        ${formattedResponses}
      `,
    })

    Logger.info('Email sent successfully', c, { responseId: response.data?.id })
  } catch (error) {
    Logger.error('Error sending email notification', error, c)
  }
}

async function processSlackIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { webhook_url, channels } = config

    if (!webhook_url) {
      Logger.error('Invalid Slack configuration: missing webhook URL', null, c)
      return
    }

    const formattedResponses = Object.entries(responses)
      .map(([key, value]) => {
        const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
        return `*${question}:* ${value}`
      })
      .join('\n')

    const payload = {
      text: `New submission for form: *${form.title}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'New Form Submission',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `You have received a new submission for the form: *${form.title}*`,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: formattedResponses,
          },
        },
      ],
      channel: channels,
    }

    const response = await axios.post(webhook_url, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    Logger.info('Slack notification sent successfully', c, { status: response.status })
  } catch (error) {
    Logger.error('Error sending Slack notification', error, c)
  }
}

async function processTelegramIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { bot_token, chat_id } = config

    if (!bot_token || !chat_id) {
      Logger.error('Invalid Telegram configuration: missing bot token or chat ID', null, c)
      return
    }

    const formattedResponses = Object.entries(responses)
      .map(([key, value]) => {
        const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
        return `*${question}:* ${value}`
      })
      .join('\n')

    // Escape backticks in the form title to prevent Telegram API issues
    const formTitle = form.title.replace(/`/g, '\\`')

    // Prepare responses with escaped backticks
    const escapedFormattedResponses = Object.entries(responses)
      .map(([key, value]) => {
        const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
        const escapedQuestion = question.replace(/`/g, '\\`')
        const escapedValue = String(value).replace(/`/g, '\\`')
        return `*${escapedQuestion}:* ${escapedValue}`
      })
      .join('\n')

    const messageText = `
*New Form Submission*
You have received a new submission for the form: *${formTitle}*

*Responses:*
${escapedFormattedResponses}
    `

    const response = await axios.post(
      `https://api.telegram.org/bot${bot_token}/sendMessage`,
      {
        chat_id,
        text: messageText,
        parse_mode: 'Markdown',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    Logger.info('Telegram notification sent successfully', c, { messageId: response.data?.result?.message_id })
  } catch (error) {
    Logger.error('Error sending Telegram notification', error, c)
  }
}

async function processZapierIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { webhook_url } = config

    if (!webhook_url) {
      Logger.error('Invalid Zapier configuration: missing webhook URL', null, c)
      return
    }

    const formattedResponses: Record<string, string> = Object.entries(responses).reduce((acc, [key, value]) => {
      const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
      acc[question] = String(value)
      return acc
    }, {})

    const payload = {
      form_id: form.id,
      form_name: form.title,
      submission_date: new Date().toISOString(),
      responses: formattedResponses,
    }

    const response = await axios.post(webhook_url, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    Logger.info('Zapier webhook sent successfully', c, { status: response.status })
  } catch (error) {
    Logger.error('Error sending data to Zapier', error, c)
  }
}

async function processMakeIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { webhook_url } = config

    if (!webhook_url) {
      Logger.error('Invalid Make.com configuration: missing webhook URL', null, c)
      return
    }

    const formattedResponses: Record<string, string> = Object.entries(responses).reduce((acc, [key, value]) => {
      const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
      acc[question] = String(value)
      return acc
    }, {})

    const payload = {
      form_id: form.id,
      form_name: form.title,
      submission_date: new Date().toISOString(),
      responses: formattedResponses,
    }

    const response = await axios.post(webhook_url, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    Logger.info('Make.com webhook sent successfully', c, { status: response.status })
  } catch (error) {
    Logger.error('Error sending data to Make.com', error, c)
  }
}

async function processWebhookIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { url, method, headers, include_form_data } = config

    if (!url || !method) {
      Logger.error('Invalid webhook configuration: missing URL or method', null, c)
      return
    }

    const payload: any = {}

    if (include_form_data) {
      payload.form_id = form.id
      payload.form_name = form.title
      payload.submission_date = new Date().toISOString()
    }

    const formattedResponses: Record<string, string> = Object.entries(responses).reduce((acc, [key, value]) => {
      const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
      acc[question] = String(value)
      return acc
    }, {})

    payload.responses = formattedResponses

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    }

    const response = await axios({
      method,
      url,
      headers: requestHeaders,
      data: payload,
    })

    Logger.info('Webhook sent successfully', c, { status: response.status, url })
  } catch (error) {
    Logger.error('Error sending data to webhook', error, c)
  }
}
