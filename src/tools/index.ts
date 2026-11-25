import { saveClientNameTool } from './save-client-name.js';
import { classifyLeadTool } from './classify-lead.js';
import { humanEscalationTool } from './human-escalation.js';
import { notifyTeamTool } from './notify-team.js';
import { checkAvailabilityTool } from './check-availability.js';
import { scheduleEventTool } from './schedule-event.js';
import { searchKnowledgeBaseTool } from './search-knowledge-base.js';
import { AgentTool } from './types.js';

/**
 * Catálogo exclusivo do Agente Externo (Karol - Atendimento a Clientes).
 * Ferramentas administrativas (get_daily_summary, update_client_status) NUNCA entram aqui
 * para impedir vazamento de dados de outros clientes ou adulteração de status via prompt injection.
 */
export const agentTools: Record<string, AgentTool> = {
  save_client_name: saveClientNameTool,
  convert_lead: classifyLeadTool,
  human_escalation: humanEscalationTool,
  notify_team: notifyTeamTool,
  check_calendar: checkAvailabilityTool,
  schedule_event: scheduleEventTool,
  search_knowledge_base: searchKnowledgeBaseTool,
};

export const toolsDeclarations = Object.values(agentTools).map((t) => t.declaration);
