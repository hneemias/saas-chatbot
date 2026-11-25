import { Router, Request, Response } from 'express';
import { EvolutionWebhookPayload } from '../types/index.js';
import { tenantService } from '../services/tenant.service.js';
import { clientService } from '../services/client.service.js';
import { messageService } from '../services/message.service.js';
import { debounceService } from '../services/debounce.service.js';
import { agentService } from '../services/agent.service.js';
import { internalAgentService } from '../services/internal-agent.service.js';
import { teamService } from '../services/team.service.js';
import { ragService } from '../services/rag.service.js';
import { memoryService } from '../services/memory.service.js';
import { ttsService } from '../services/tts.service.js';
import { transcriptionService } from '../services/transcription.service.js';
import { evolutionApi } from '../integrations/evolution.js';
import { logger } from '../utils/logger.js';
import { compileSystemPrompt } from '../utils/prompt-compiler.js';
import { normalizeWhatsAppJid } from '../utils/phone.js';
import { sanitizePushName } from '../utils/name-validator.js';

export const webhookRouter = Router();

webhookRouter.post('/evolution', async (req: Request, res: Response): Promise<void> => {
  // Responde imediatamente 200 OK para evitar retransmissões da Evolution API
  res.status(200).json({ status: 'received' });

  const body = req.body as EvolutionWebhookPayload;

  if (!body || !body.data || !body.data.key) {
    return;
  }

  // Aceita chegada de mensagens (messages.upsert) e envios manuais do atendente humano (send.message)
  if (body.event) {
    const normalizedEvent = body.event.toLowerCase().replace(/_/g, '.');
    if (normalizedEvent !== 'messages.upsert' && normalizedEvent !== 'send.message') {
      return;
    }
  }

  const rawRemoteJid = body.data.key.remoteJid;
  if (!rawRemoteJid || rawRemoteJid.endsWith('@g.us') || rawRemoteJid === 'status@broadcast') {
    // Ignora grupos e status do WhatsApp
    return;
  }
  const remoteJid = normalizeWhatsAppJid(rawRemoteJid);

  const instanceName = body.instance;
  const isFromMe = Boolean(body.data.key.fromMe);
  const messageId = body.data.key.id;
  const messageType = body.data.messageType || 'conversation';

  try {
    // 1. Obtém os dados do Inquilino (Tenant)
    const bundle = await tenantService.getByInstanceName(instanceName);
    if (!bundle) {
      logger.warn({ instanceName }, 'Inquilino não localizado para a instância');
      return;
    }

    const { tenant, config } = bundle;

    // 2. HANDOVER HUMANO: Verifica se `fromMe: true` foi uma resposta automática do próprio bot ou intervenção humana
    if (isFromMe) {
      const rawMsg = body.data.message as any;
      const rawOutText =
        rawMsg?.conversation ||
        rawMsg?.extendedTextMessage?.text ||
        rawMsg?.imageMessage?.caption ||
        rawMsg?.videoMessage?.caption ||
        rawMsg?.documentMessage?.caption ||
        (messageType === 'audioMessage' || messageType === 'voiceMessage' ? '[Áudio do Atendente]' : '') ||
        '';

      // 2.1 Ignora ecos das próprias mensagens/áudios enviados pelo bot via Evolution API
      if (
        evolutionApi.wasRecentlySentByBot({
          instanceName: tenant.evolution_instance_name,
          remoteJid,
          messageId,
          text: rawOutText,
          messageType,
        })
      ) {
        logger.debug({ remoteJid, messageId }, 'Eco de mensagem enviada pelo próprio bot ignorado');
        return;
      }

      // 2.2 Não cria/pausa registro de cliente se o destinatário for membro interno da equipe
      const targetTeamMember = await teamService.getMember(remoteJid, tenant.id);
      if (targetTeamMember) {
        return;
      }

      logger.info(
        { remoteJid },
        'Mensagem enviada pelo atendente humano (fromMe=true): pausando IA para este cliente'
      );

      const client = await clientService.getOrCreate(remoteJid, tenant.id);
      await clientService.setStatus(remoteJid, tenant.id, 'paused');

      await messageService.logMessage({
        tenant_id: tenant.id,
        client_id: client.id,
        phone: remoteJid,
        role: 'assistant', // Atendente humano falando pelo canal oficial (compatível com constraints SQL)
        content: rawOutText || '[Mensagem do Atendente]',
        message_type: 'admin',
      });

      return;
    }

    // Sanitiza pushName descartando slogans religiosos, frases, homenagens, comércios e siglas
    const pushName = sanitizePushName(body.data.pushName);
    const isAudio = messageType === 'audioMessage' || messageType === 'voiceMessage';

    // 3. EXTRAÇÃO OU TRANSCRIÇÃO DE ÁUDIO VIA GEMINI
    let messageText =
      body.data.message?.conversation ||
      body.data.message?.extendedTextMessage?.text ||
      '';

    if (isAudio) {
      logger.info({ remoteJid, messageId }, 'Mensagem de áudio recebida, buscando base64 para transcrição...');

      let audioBase64: string | null | undefined = body.data.message?.audioMessage?.base64;
      if (!audioBase64) {
        audioBase64 = await evolutionApi.getBase64FromMediaMessage(
          instanceName,
          messageId,
          tenant.evolution_api_key
        );
      }

      if (audioBase64) {
        const transcribed = await transcriptionService.transcribeAudioBase64(audioBase64);
        if (transcribed) {
          logger.info({ remoteJid, transcribed }, 'Áudio transcrito com sucesso via Gemini');
          messageText = transcribed;
        } else {
          messageText = '[Áudio recebido (não foi possível transcrever)]';
        }
      } else {
        messageText = '[Áudio recebido (mídia indisponível)]';
      }
    } else if (!messageText) {
      messageText = `[Arquivo de Mídia recebido: ${messageType} - A equipe analisará]`;
    }

    const debounceScopeKey = `${tenant.id}:${remoteJid}`;

    // 4. VERIFICA SE É MEMBRO DA EQUIPE / ADMIN
    const teamMember = await teamService.getMember(remoteJid, tenant.id);

    if (teamMember && teamMember.role === 'admin') {
      logger.info({ admin: teamMember.name, remoteJid }, 'Mensagem recebida de membro da equipe/admin');

      // 4.1 Tratamento de Comandos de Controle (!shhh / !pausar e !volte / !voltei)
      const normalizedCmd = messageText.trim().toLowerCase();
      if (normalizedCmd === '!shhh' || normalizedCmd === '!pausar') {
        await teamService.setStatus(remoteJid, tenant.id, 'paused');
        await evolutionApi.sendTextMessage({
          instanceName: tenant.evolution_instance_name,
          remoteJid,
          text: '🤫 *Modo silêncio ativado!*\nNão vou responder suas mensagens até você me chamar com *!volte*.',
          apiKey: tenant.evolution_api_key,
        });
        return;
      }

      if (normalizedCmd === '!volte' || normalizedCmd === '!voltei') {
        await teamService.setStatus(remoteJid, tenant.id, 'active');
        await evolutionApi.sendTextMessage({
          instanceName: tenant.evolution_instance_name,
          remoteJid,
          text: '👋 *Estou de volta!*\nComo posso ajudar você e a equipe hoje?',
          apiKey: tenant.evolution_api_key,
        });
        return;
      }

      // Se o admin silenciou o bot, não responde
      if (teamMember.status === 'paused') {
        logger.info({ admin: teamMember.name }, 'Bot silenciado para este administrador');
        return;
      }

      // 4.2 Execução do AGENTE INTERNO (Atlas / Assistente Administrativo)
      await debounceService.bufferMessage(debounceScopeKey, messageText, async (fullText) => {
        // Busca histórico INTERNO (client_id IS NULL) para nunca misturar com eventuais atendimentos de cliente
        const history = await messageService.getRecentHistory(remoteJid, tenant.id, 14, { scope: 'internal' });
        const historyFormatted = messageService.formatHistoryForAgent(
          history,
          config.internal_agent_name || 'Atlas',
          teamMember.name,
          'internal'
        );

        await messageService.logMessage({
          tenant_id: tenant.id,
          phone: remoteJid,
          role: 'user', // Membro da equipe é o emissor humano no diálogo com o Atlas
          content: fullText,
          message_type: 'admin',
        });

        const context = {
          tenantId: tenant.id,
          instanceName: tenant.evolution_instance_name,
          evolutionApiKey: tenant.evolution_api_key,
          notificationGroupId: config.notification_group_id,
          phone: remoteJid,
          clientName: teamMember.name,
          historyFormatted,
          isInternalTeam: true,
        };

        const enableCatalogTools = Boolean(config.classifier_rules?.enable_product_catalog);

        try {
          const reply = await internalAgentService.runInternalAssistant({
            systemPrompt: config.internal_system_prompt || '',
            userMessage: fullText,
            historyMessages: history,
            historyFormatted,
            context,
            adminName: teamMember.name,
            adminRole: teamMember.role,
            tenantName: tenant.name,
            agentName: config.internal_agent_name || 'Atlas',
            externalAgentName: config.external_agent_name || 'Karol',
            enableCatalogTools,
          });

          if (!reply) return;

          // SE O ADMIN ENVIOU ÁUDIO -> RESPONDE POR VOZ VIA TTS MULTIVOZES
          if (isAudio) {
            logger.info({ admin: teamMember.name }, 'Gerando resposta em áudio (TTS) para o administrador');
            const audioBase64 = await ttsService.generateSpeechBase64(reply);

            if (audioBase64) {
              await evolutionApi.sendAudioMessage({
                instanceName: tenant.evolution_instance_name,
                remoteJid,
                audioBase64,
                apiKey: tenant.evolution_api_key,
              });

              await messageService.logMessage({
                tenant_id: tenant.id,
                phone: remoteJid,
                role: 'assistant',
                content: `[Áudio de Resposta]: ${reply}`,
                message_type: 'audio',
              });
              return;
            }
          }

          // Resposta em Texto padrão para a equipe
          await evolutionApi.sendTextMessage({
            instanceName: tenant.evolution_instance_name,
            remoteJid,
            text: reply,
            apiKey: tenant.evolution_api_key,
          });

          await messageService.logMessage({
            tenant_id: tenant.id,
            phone: remoteJid,
            role: 'assistant',
            content: reply,
            message_type: 'text',
          });
        } catch (err: any) {
          logger.error({ err: err?.message, admin: teamMember.name, remoteJid }, 'Erro ao processar resposta do Agente Interno');
          try {
            const fallbackText = '⚠️ Tive uma breve oscilação de conexão ao consultar a IA. Por favor, tente novamente em alguns instantes.';
            await evolutionApi.sendTextMessage({
              instanceName: tenant.evolution_instance_name,
              remoteJid,
              text: fallbackText,
              apiKey: tenant.evolution_api_key,
            });
          } catch {}
        }
      });

      return;
    }

    // 5. FLUXO REGULAR DE CLIENTES (Agente Externo - Karol)
    const client = await clientService.getOrCreate(remoteJid, tenant.id, pushName);

    // Se o cliente estiver pausado pelo advogado (Handover), a IA não responde
    if (client.status === 'paused') {
      logger.info({ remoteJid, status: client.status }, 'Cliente pausado: mensagem gravada sem resposta da IA');
      await messageService.logMessage({
        tenant_id: tenant.id,
        client_id: client.id,
        phone: remoteJid,
        role: 'user',
        content: messageText,
        message_type: messageType,
      });
      return;
    }

    await debounceService.bufferMessage(debounceScopeKey, messageText, async (fullMessage) => {
      // Busca histórico anterior e índice de documentos liberados ANTES de gravar a nova mensagem
      const [history, clientDocumentsIndex] = await Promise.all([
        messageService.getRecentHistory(remoteJid, tenant.id, 16, { scope: 'client', clientId: client.id }),
        ragService.getClientSharedDocumentsIndex(tenant.id, client.id),
      ]);

      await messageService.logMessage({
        tenant_id: tenant.id,
        client_id: client.id,
        phone: remoteJid,
        role: 'user',
        content: fullMessage,
        message_type: messageType,
      });

      const externalAgentName = config.external_agent_name || 'Karol';
      const internalAgentName = config.internal_agent_name || 'Atlas';
      const clientMemorySummary = memoryService.extractClientMemory(client);

      const effectiveClientName = sanitizePushName(client.name && client.name !== 'Desconhecido' ? client.name : pushName);

      const historyFormatted = messageService.formatHistoryForAgent(
        history,
        externalAgentName,
        effectiveClientName,
        'external'
      );

      const rawPrompt =
        config.external_system_prompt ||
        'Você é {{ agent_name }}, assistente virtual de {{ tenant_name }}. Seja cordial, breve e objetiva.';

      const compiledPrompt = compileSystemPrompt(rawPrompt, {
        mode: 'external',
        tenantName: tenant.name,
        clientName: effectiveClientName,
        clientStatus: client.status,
        phone: remoteJid,
        agentName: externalAgentName,
        externalAgentName,
        internalAgentName,
        historyFormatted,
        clientDocumentsIndex,
        clientMemorySummary,
        nativeMultiTurnHistory: true,
        appendSessionContext: true,
      });

      const context = {
        tenantId: tenant.id,
        instanceName: tenant.evolution_instance_name,
        evolutionApiKey: tenant.evolution_api_key,
        notificationGroupId: config.notification_group_id,
        phone: remoteJid,
        clientId: client.id,
        clientName: effectiveClientName,
        historyFormatted,
        isInternalTeam: false,
      };

      const enableCatalogTools = Boolean(config.classifier_rules?.enable_product_catalog);

      try {
        const aiReply = await agentService.runConversation({
          systemPrompt: compiledPrompt,
          userMessage: fullMessage,
          historyMessages: history,
          historyFormatted,
          context,
          temperature: config.temperature ?? 0.4,
          enableCatalogTools,
        });

        if (!aiReply || aiReply.trim() === '') return;

        const chunks = agentService.splitIntoChunks(aiReply);
        for (const chunk of chunks) {
          await evolutionApi.sendTextMessage({
            instanceName: tenant.evolution_instance_name,
            remoteJid,
            text: chunk,
            delay: 1500,
            apiKey: tenant.evolution_api_key,
          });

          await messageService.logMessage({
            tenant_id: tenant.id,
            client_id: client.id,
            phone: remoteJid,
            role: 'assistant',
            content: chunk,
            message_type: 'text',
          });
        }

        // Atualiza memória episódica de longo prazo do cliente de forma assíncrona (zero impacto na latência)
        void memoryService
          .refreshClientMemoryInBackground({
            tenantId: tenant.id,
            client,
            recentMessages: history,
            latestUserMessage: fullMessage,
            latestAssistantReply: aiReply,
          })
          .catch((memErr) => {
            logger.warn({ err: memErr?.message, clientId: client.id }, 'Falha assíncrona ao sintetizar memória');
          });
      } catch (err: any) {
        logger.error({ err: err?.message, phone: remoteJid }, 'Erro crítico na resposta do agente para o cliente');
        try {
          const fallbackText =
            'Tive uma breve oscilação de conexão no momento. Você poderia repetir sua última pergunta por favor?';
          await evolutionApi.sendTextMessage({
            instanceName: tenant.evolution_instance_name,
            remoteJid,
            text: fallbackText,
            apiKey: tenant.evolution_api_key,
          });
          await messageService.logMessage({
            tenant_id: tenant.id,
            client_id: client.id,
            phone: remoteJid,
            role: 'assistant',
            content: fallbackText,
            message_type: 'text',
          });
        } catch {}
      }
    });
  } catch (err: any) {
    logger.error({ err: err.message, remoteJid, instanceName }, 'Erro ao processar webhook da Evolution');
  }
});
