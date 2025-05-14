export type IntegrationType = 'slack' | 'email' | 'telegram' | 'zapier' | 'make' | 'webhook';

export interface BaseIntegrationConfig {
  name: string;
}

export interface SlackIntegrationConfig extends BaseIntegrationConfig {
  webhook_url: string;
  channel?: string;
}

export interface EmailIntegrationConfig extends BaseIntegrationConfig {
  to: string[];
  cc?: string[];
  subject_template?: string;
}

export interface TelegramIntegrationConfig extends BaseIntegrationConfig {
  bot_token: string;
  chat_id: string;
}

export interface ZapierIntegrationConfig extends BaseIntegrationConfig {
  webhook_url: string;
}

export interface MakeIntegrationConfig extends BaseIntegrationConfig {
  webhook_url: string;
}

export interface WebhookIntegrationConfig extends BaseIntegrationConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  include_form_data?: boolean;
}

export type IntegrationConfig =
  | SlackIntegrationConfig
  | EmailIntegrationConfig
  | TelegramIntegrationConfig
  | ZapierIntegrationConfig
  | MakeIntegrationConfig
  | WebhookIntegrationConfig;

export interface FormIntegration {
  id?: string;
  form_id: string;
  integration_type: IntegrationType;
  is_enabled: boolean;
  config: IntegrationConfig;
  created_at?: string;
  updated_at?: string;
}
