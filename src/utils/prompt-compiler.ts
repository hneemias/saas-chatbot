/**
 * Compilador universal de prompts e envelope de contexto de sessão (`<session_context>`).
 *
 * Arquitetura otimizada para Cache Implícito de Prefixo do Gemini:
 * 1. O corpo principal do prompt mantém apenas instruções estáticas do escritório/empresa
 *    (`{{ tenant_name }}`, `{{ agent_name }}`, `{{ external_agent_name }}`, `{{ internal_agent_name }}`).
 * 2. Dados voláteis (horário, cliente, status, memória de longo prazo e dossiê RAG) são injetados
 *    automaticamente ao FINAL do `systemInstruction` em `<session_context>`, preservando 100% de
 *    retrocompatibilidade caso algum prompt ainda contenha tags dinâmicas no corpo.
 */

export interface PromptCompilerOptions {
  mode?: 'external' | 'internal';
  tenantName?: string;
  clientName?: string;
  clientStatus?: string;
  phone?: string;
  adminName?: string;
  adminRole?: string;
  historyFormatted?: string;
  agentName?: string;
  externalAgentName?: string;
  internalAgentName?: string;
  clientDocumentsIndex?: string;
  clientMemorySummary?: string;
  /**
   * Quando `true`, garante a injeção do envelope `<session_context>` no rodapé do prompt
   * com data/hora, interlocutor, memória episódica e documentos liberados. (Padrão: `true`)
   */
  appendSessionContext?: boolean;
  /**
   * Indica que o histórico está sendo enviado nativamente como `Content[]` no `startChat`,
   * evitando duplicar texto corrido caso uma tag legada `{{ history }}` ainda exista.
   */
  nativeMultiTurnHistory?: boolean;
}

/**
 * Converte expressões legadas do n8n em variáveis limpas nativas do sistema.
 */
export function migrateLegacyN8nExpressions(rawPrompt: string): string {
  if (!rawPrompt) return '';

  return rawPrompt
    .replace(/\{\{\s*\$\('Obter Cliente'\)\.first\(\)\.json\.status\s*\|\|\s*'novo'\s*\}\}/g, '{{ client_status }}')
    .replace(/\{\{\s*\$\('Obter Cliente \(Admin\)'\)\.first\(\)\.json\.status\s*\|\|\s*'novo'\s*\}\}/g, '{{ client_status }}')
    .replace(/\{\{\s*\$\('Webhook EVO'\)\.first\(\)\.json\.body\.data\.key\.remoteJid\s*\}\}/g, '{{ phone }}')
    .replace(/\{\{\s*\$\('Obter Cliente'\)\.first\(\)\.json\.name\s*\|\|\s*'Desconhecido'\s*\}\}/g, '{{ client_name }}')
    .replace(/\{\{\s*\$\('Obter Cliente \(Admin\)'\)\.first\(\)\.json\.name\s*\|\|\s*'Desconhecido'\s*\}\}/g, '{{ client_name }}')
    .replace(/\{\{\s*\$\('Formatar Histórico IA'\)\.(item|first\(\))\.json\.history_formatted\s*\}\}/g, '{{ history }}')
    .replace(/\{\{\s*\$\('Formatar Histórico IA1'\)\.(item|first\(\))\.json\.history_formatted\s*\}\}/g, '{{ history }}')
    .replace(/\{\{\s*\$\('Obter Admin'\)\.first\(\)\.json\.name\s*\}\}/g, '{{ admin_name }}')
    .replace(/\{\{\s*\$\('É Membro Equipe\?'\)\.first\(\)\.json\.role\s*\}\}/g, '{{ admin_role }}')
    .replace(/\{\{\s*\$node\["Início"\]\.json\.tenant_name\s*\}\}/g, '{{ tenant_name }}')
    .replace(/\{\{\s*\$node\["Início"\]\.json\.external_agent_name\s*\}\}/g, '{{ external_agent_name }}')
    .replace(/\{\{\s*\$node\["Início"\]\.json\.internal_agent_name\s*\}\}/g, '{{ internal_agent_name }}')
    .replace(/\{\{\s*\$now\.toFormat\('yyyy-MM-dd'\)\s*\}\}/g, '{{ dataHoje }}')
    .replace(/\{\{\s*\$now\.toFormat\('HH:mm'\)\s*\}\}/g, '{{ horaHoje }}')
    .replace(/\{\{\s*\$now\.toFormat\('(cn|cccc)'\)\s*\}\}/g, '{{ diaSemana }}')
    .replace(/\{\{\s*\$now\.setLocale\('pt-br'\)\.toFormat\('(cn|cccc)'\)\s*\}\}/g, '{{ diaSemana }}');
}

export function compileSystemPrompt(
  rawPrompt: string,
  options: PromptCompilerOptions
): string {
  if (!rawPrompt) return '';

  const mode = options.mode || (options.adminName ? 'internal' : 'external');
  const appendSessionContext = options.appendSessionContext ?? true;

  const now = new Date();
  const timeZone = 'America/Sao_Paulo';
  const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const currentTime = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  const dayOfWeek = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    timeZone,
  });

  const tenantName = options.tenantName || 'Empresa';
  const externalAgentName =
    options.externalAgentName || (mode === 'external' ? options.agentName : undefined) || 'Karol';
  const internalAgentName =
    options.internalAgentName || (mode === 'internal' ? options.agentName : undefined) || 'Atlas';
  const agentName =
    options.agentName || (mode === 'internal' ? internalAgentName : externalAgentName);

  const clientName = options.clientName || 'Desconhecido';
  const clientStatus = options.clientStatus || 'active';
  const phone = options.phone || '';
  const adminName = options.adminName || 'Membro da Equipe';
  const adminRole = options.adminRole || 'admin';
  const docsIndex = options.clientDocumentsIndex?.trim() || 'Nenhum documento individual liberado.';
  const memorySummary = options.clientMemorySummary?.trim() || '';

  const historyReplacement = options.nativeMultiTurnHistory
    ? '(Fornecido nativamente no histórico estruturado de mensagens da sessão)'
    : options.historyFormatted || '';

  // 1. Normaliza eventuais tags legadas do n8n para tags nativas
  let result = migrateLegacyN8nExpressions(rawPrompt);

  // 2. Substitui variáveis estáticas de identidade e eventuais tags dinâmicas manuais
  result = result
    .replace(/\{\{\s*tenant_name\s*\}\}/gi, tenantName)
    .replace(/\{\{\s*agent_name\s*\}\}/gi, agentName)
    .replace(/\{\{\s*external_agent_name\s*\}\}/gi, externalAgentName)
    .replace(/\{\{\s*internal_agent_name\s*\}\}/gi, internalAgentName)
    .replace(/\{\{\s*client_name\s*\}\}/gi, clientName)
    .replace(/\{\{\s*client_status\s*\}\}/gi, clientStatus)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*admin_name\s*\}\}/gi, adminName)
    .replace(/\{\{\s*admin_role\s*\}\}/gi, adminRole)
    .replace(/\{\{\s*dataHoje\s*\}\}/gi, todayDate)
    .replace(/\{\{\s*horaHoje\s*\}\}/gi, currentTime)
    .replace(/\{\{\s*diaSemana\s*\}\}/gi, dayOfWeek)
    .replace(/\{\{\s*history\s*\}\}/gi, historyReplacement)
    .replace(/\{\{\s*client_documents\s*\}\}/gi, docsIndex)
    .replace(/\{\{\s*client_memory\s*\}\}/gi, memorySummary || 'Nenhuma memória anterior registrada.');

  // 3. Anexa automaticamente o envelope dinâmico `<session_context>` no final da instrução
  // Só considera existente se o bloco estiver fechado com `</session_context>`, evitando falsos positivos
  // quando o corpo do prompt apenas cita "<session_context>" como texto de instrução.
  const hasSessionContextBlock = result.includes('</session_context>');
  if (appendSessionContext && !hasSessionContextBlock) {
    if (mode === 'internal') {
      const lines = [
        '',
        '<session_context>',
        `- Data e Hora Atual (Brasília): ${todayDate} (${dayOfWeek}) às ${currentTime}`,
        `- Empresa / Organização: ${tenantName}`,
        `- Copiloto Interno Ativo: ${internalAgentName} (Assistente Externa de Clientes: ${externalAgentName})`,
        `- Membro da Equipe Autenticado: ${adminName} (Cargo: ${adminRole}${phone ? ` | WhatsApp: ${phone}` : ''})`,
        `- Diretriz de Formatação (WhatsApp): use APENAS UM asterisco para negrito (*negrito*). NUNCA use asteriscos duplos (**negrito**) e NUNCA dobre aspas (""destaque"").`,
        '</session_context>',
      ];
      result += `\n${lines.join('\n')}`;
    } else {
      const isKnownName = clientName && clientName.trim() !== '' && clientName.toLowerCase() !== 'desconhecido';
      const firstName = isKnownName ? clientName.trim().split(/\s+/)[0] : '';
      const nameDirective = isKnownName
        ? `Você está conversando com ${clientName}. Trate-o(a) cordialmente pelo primeiro nome ("${firstName}") com naturalidade e acolhimento. Não pergunte o nome novamente, pois já está identificado no sistema.`
        : `O nome do cliente ainda não está registrado (identificado como "Desconhecido"). Trate cordialmente e, quando for oportuno na conversa, pergunte como pode chamá-lo(a) e salve com \`save_client_name\`.`;

      const lines = [
        '',
        '<session_context>',
        `- Data e Hora Atual (Brasília): ${todayDate} (${dayOfWeek}) às ${currentTime}`,
        `- Empresa / Organização: ${tenantName}`,
        `- Assistente Responsável: ${externalAgentName}`,
        `- Interlocutor Atual (Cliente no WhatsApp):`,
        `  • Nome Registrado: ${clientName || 'Desconhecido'}`,
        `  • Telefone / WhatsApp: ${phone || 'Não informado'}`,
        `  • Status Atual do Atendimento: ${clientStatus}`,
        `  • Instrução Obrigatória de Identificação: ${nameDirective}`,
      ];

      if (memorySummary) {
        lines.push(`- Memória de Longo Prazo do Cliente (fatos de conversas anteriores):\n${memorySummary}`);
      } else {
        lines.push(`- Memória de Longo Prazo do Cliente: Primeiro atendimento / sem fatos anteriores consolidados.`);
      }

      lines.push(`- Documentos e Atualizações Liberados no Dossiê deste Cliente:\n${docsIndex}`);
      lines.push(
        `- Diretrizes Automáticas de Formatação e Estado:\n` +
          `  • Formatação no WhatsApp: use APENAS UM asterisco para negrito (*negrito*). NUNCA use asteriscos duplos (**negrito**) e NUNCA dobre aspas (""destaque"").\n` +
          `  • Se "Nome Registrado" for "Desconhecido" e o cliente informar o nome, acione \`save_client_name\` imediatamente.\n` +
          `  • Se houver documentos liberados acima relacionados à pergunta do cliente, consulte \`search_knowledge_base\` antes de responder.\n` +
          `  • Se "Status Atual do Atendimento" for \`triagem_concluida\` ou \`converted\`, NÃO acione \`convert_lead\` novamente para o mesmo assunto.`
      );
      lines.push('</session_context>');

      result += `\n${lines.join('\n')}`;
    }
  }

  return result;
}
