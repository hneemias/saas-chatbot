/**
 * Compilador universal de prompts do sistema
 * Substitui tanto as expressões legadas do n8n (com nós e funções de data)
 * quanto as variáveis modernas de template (mustache).
 */

export interface PromptCompilerOptions {
  tenantName?: string;
  clientName?: string;
  clientStatus?: string;
  phone?: string;
  adminName?: string;
  adminRole?: string;
  historyFormatted?: string;
  agentName?: string;
}

export function compileSystemPrompt(
  rawPrompt: string,
  options: PromptCompilerOptions
): string {
  if (!rawPrompt) return '';

  const now = new Date();
  const todayDate = now.toISOString().split('T')[0];
  const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long' });

  const clientName = options.clientName || 'Desconhecido';
  const clientStatus = options.clientStatus || 'novo';
  const phone = options.phone || '';
  const tenantName = options.tenantName || 'Escritório de Advocacia';
  const adminName = options.adminName || 'Membro da Equipe';
  const adminRole = options.adminRole || 'Colaborador';
  const history = options.historyFormatted || '';
  const agentName = options.agentName || 'Assistente';

  let result = rawPrompt;

  // 1. Substituição de Expressões Legadas do n8n (Karol & Atlas)
  result = result
    .replace(/\{\{\s*\$\('Obter Cliente'\)\.first\(\)\.json\.status\s*\|\|\s*'novo'\s*\}\}/g, clientStatus)
    .replace(/\{\{\s*\$\('Obter Cliente \(Admin\)'\)\.first\(\)\.json\.status\s*\|\|\s*'novo'\s*\}\}/g, clientStatus)
    .replace(/\{\{\s*\$\('Webhook EVO'\)\.first\(\)\.json\.body\.data\.key\.remoteJid\s*\}\}/g, phone)
    .replace(/\{\{\s*\$\('Obter Cliente'\)\.first\(\)\.json\.name\s*\|\|\s*'Desconhecido'\s*\}\}/g, clientName)
    .replace(/\{\{\s*\$\('Obter Cliente \(Admin\)'\)\.first\(\)\.json\.name\s*\|\|\s*'Desconhecido'\s*\}\}/g, clientName)
    .replace(/\{\{\s*\$\('Formatar Histórico IA'\)\.(item|first\(\))\.json\.history_formatted\s*\}\}/g, history)
    .replace(/\{\{\s*\$\('Formatar Histórico IA1'\)\.(item|first\(\))\.json\.history_formatted\s*\}\}/g, history)
    .replace(/\{\{\s*\$\('Obter Admin'\)\.first\(\)\.json\.name\s*\}\}/g, adminName)
    .replace(/\{\{\s*\$\('É Membro Equipe\?'\)\.first\(\)\.json\.role\s*\}\}/g, adminRole)
    .replace(/\{\{\s*\$node\["Início"\]\.json\.tenant_name\s*\}\}/g, tenantName)
    .replace(/\{\{\s*\$node\["Início"\]\.json\.internal_agent_name\s*\}\}/g, agentName)
    .replace(/\{\{\s*\$node\["Início"\]\.json\.external_agent_name\s*\}\}/g, agentName)
    .replace(/\{\{\s*\$now\.toFormat\('yyyy-MM-dd'\)\s*\}\}/g, todayDate)
    .replace(/\{\{\s*\$now\.toFormat\('HH:mm'\)\s*\}\}/g, currentTime)
    .replace(/\{\{\s*\$now\.toFormat\('(cn|cccc)'\)\s*\}\}/g, dayOfWeek)
    .replace(/\{\{\s*\$now\.setLocale\('pt-br'\)\.toFormat\('(cn|cccc)'\)\s*\}\}/g, dayOfWeek);

  // 2. Substituição de Tags Modernas de Template
  result = result
    .replace(/\{\{\s*client_name\s*\}\}/gi, clientName)
    .replace(/\{\{\s*client_status\s*\}\}/gi, clientStatus)
    .replace(/\{\{\s*tenant_name\s*\}\}/gi, tenantName)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*admin_name\s*\}\}/gi, adminName)
    .replace(/\{\{\s*admin_role\s*\}\}/gi, adminRole)
    .replace(/\{\{\s*dataHoje\s*\}\}/gi, todayDate)
    .replace(/\{\{\s*horaHoje\s*\}\}/gi, currentTime)
    .replace(/\{\{\s*diaSemana\s*\}\}/gi, dayOfWeek)
    .replace(/\{\{\s*history\s*\}\}/gi, history);

  return result;
}
