import { Resend } from 'resend'
import axios from 'axios'
import { IntegrationType, FormIntegration } from 'lib/types/integration'
import type { AppContext } from 'lib/types/app-context'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { Database } from 'lib/types/database.types'

type Form = Database['public']['Tables']['forms']['Row']

export async function processIntegrations(c: AppContext, formId: string, responses: Record<string, any>) {
  try {
    const { data: form, error: formError } = await supabaseAdminClient(c)
      .from('forms')
      .select('*')
      .eq('id', formId)
      .single()

    if (formError || !form) {
      console.error('Error fetching form for integration processing:', formError)
      return
    }

    const { data: integrations, error: integrationsError } = await supabaseAdminClient(c)
      .from('form_integrations')
      .select('*')
      .eq('form_id', formId)
      .eq('is_enabled', true)

    if (integrationsError) {
      console.error('Error fetching integrations:', integrationsError)
      return
    }

    for (const integration of integrations) {
      await processIntegration(c, integration, form, responses)
    }
  } catch (error) {
    console.error('Error processing integrations:', error)
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
        console.warn(`Unknown integration type: ${integration_type}`)
    }
  } catch (error) {
    console.error(`Error processing ${integration_type} integration:`, error)
  }
}

async function processEmailIntegration(c: AppContext, config: any, form: Form, responses: Record<string, any>) {
  try {
    const { to, cc, subject_template } = config

    if (!to || !Array.isArray(to) || to.length === 0) {
      console.error('Invalid email configuration: missing recipients')
      return
    }

    const resendApiKey = c.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.error('Resend API key not configured')
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

    await resend.emails.send({
      from: 'notifications@turboform.app',
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
  } catch (error) {
    console.error('Error sending email notification:', error)
  }
}

async function processSlackIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { webhook_url, channels } = config

    if (!webhook_url) {
      console.error('Invalid Slack configuration: missing webhook URL')
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

    console.log('Slack response:', response.data)
  } catch (error) {
    console.error('Error sending Slack notification:', error)
  }
}

async function processTelegramIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { bot_token, chat_id } = config

    if (!bot_token || !chat_id) {
      console.error('Invalid Telegram configuration: missing bot token or chat ID')
      return
    }

    const formattedResponses = Object.entries(responses)
      .map(([key, value]) => {
        const question = ((form?.schema as any[]) || [])?.find((q) => q.id === key)?.label || key
        return `*${question}:* ${value}`
      })
      .join('\n')

    const messageText = `
*New Form Submission*
You have received a new submission for the form: *${form.title}*

*Responses:*
${formattedResponses}
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

    console.log('Telegram response:', response.data)
  } catch (error) {
    console.error('Error sending Telegram notification:', error)
  }
}

async function processZapierIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { webhook_url } = config

    if (!webhook_url) {
      console.error('Invalid Zapier configuration: missing webhook URL')
      return
    }

    const formattedResponses: Record<string, string> = Object.entries(responses)
      .reduce((acc, [key, value]) => {
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

    console.log('Zapier response:', response.data)
  } catch (error) {
    console.error('Error sending data to Zapier:', error)
  }
}

async function processMakeIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { webhook_url } = config

    if (!webhook_url) {
      console.error('Invalid Make.com configuration: missing webhook URL')
      return
    }

    const formattedResponses: Record<string, string> = Object.entries(responses)
      .reduce((acc, [key, value]) => {
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

    console.log('Make.com response:', response.data)
  } catch (error) {
    console.error('Error sending data to Make.com:', error)
  }
}

async function processWebhookIntegration(config: any, form: Form, responses: Record<string, any>) {
  try {
    const { url, method, headers, include_form_data } = config

    if (!url || !method) {
      console.error('Invalid webhook configuration: missing URL or method')
      return
    }

    const payload: any = {}

    if (include_form_data) {
      payload.form_id = form.id
      payload.form_name = form.title
      payload.submission_date = new Date().toISOString()
    }

    const formattedResponses: Record<string, string> = Object.entries(responses)
      .reduce((acc, [key, value]) => {
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

    console.log('Webhook response:', response.data)
  } catch (error) {
    console.error('Error sending data to webhook:', error)
  }
}
