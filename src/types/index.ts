export interface Tenant {
  id: string;
  name: string;
  evolution_api_key?: string;
  evolution_instance_name: string;
  subscription_status: string;
  created_at?: string;
  updated_at?: string;
}

export interface TenantConfig {
  tenant_id: string;
  notification_group_id?: string;
  external_agent_name?: string;
  external_system_prompt?: string;
  internal_agent_name?: string;
  internal_system_prompt?: string;
  calendar_config?: Record<string, any>;
  temperature?: number;
}

export interface Client {
  id: string;
  tenant_id: string;
  phone: string;
  name?: string;
  status: 'active' | 'paused' | 'triagem_concluida' | 'converted' | string;
  previous_status?: string;
  followup_sent?: boolean;
  created_at: string;
  last_interaction_at?: string;
}

export interface MessageRecord {
  id?: string;
  tenant_id: string;
  client_id?: string | null;
  phone: string;
  role: 'user' | 'assistant' | 'admin' | 'system';
  content: string;
  message_type?: string;
  created_at?: string;
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
      participant?: string;
    };
    pushName?: string;
    messageType: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
      audioMessage?: {
        url?: string;
        base64?: string;
      };
    };
    source?: string;
  };
  sender?: string;
  date_time?: string;
}

export interface ToolContext {
  tenantId: string;
  instanceName: string;
  notificationGroupId?: string;
  phone: string;
  clientId?: string;
  clientName?: string;
  historyFormatted?: string;
}
