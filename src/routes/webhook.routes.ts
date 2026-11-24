import { Router, Request, Response } from 'express';
import { EvolutionWebhookPayload } from '../types/index.js';
import { tenantService } from '../services/tenant.service.js';
import { clientService } from '../services/client.service.js';
import { messageService } from '../services/message.service.js';
import { debounceService } from '../services/debounce.service.js';
import { agentService } from '../services/agent.service.js';
import { internalAgentService } from '../services/internal-agent.service.js';
import { teamService } from '../services/team.service.js';
import { ttsService } from '../services/tts.service.js';
import { transcriptionService } from '../services/transcription.service.js';
import { evolutionApi } from '../integrations/evolution.js';
import { logger } from '../utils/logger.js';
import { compileSystemPrompt } from '../utils/prompt-compiler.js';

export const webhookRouter = Router();

webhookRouter.post('/evolution', async (req: Request, res: Response): Promise<void> => {
  // Responde imediatamente 200 OK para evitar retransmissões
  res.status(200).json({ status: 'received' });

  const body = req.body as EvolutionWebhookPayload;

  if (!body || !body.data || !body.data.key) {
    return;
  }

  const remoteJid = body.data.key.remoteJid;
  if (!remoteJid || remoteJid.endsWith('@g.us')) {
    // Ignora grupos comuns
    return;
  }

  const instanceName = body.instance;
  const isFromMe = body.data.key.fromMe;
  const messageId = body.data.key.id;

  try {
    // 1. Obtém os dados do Inquilino (Tenant)
    const bundle = await tenantService.getByInstanceName(instanceName);
    if (!bundle) {
      logger.warn({ instanceName }, 'Inquilino não localizado para a instância');
      return;
    }

    const { tenant, config } = bundle;

    // 2. HANDOVER HUMANO: Se a mensagem foi enviada pelo próprio celular do escritório (fromMe: true)
    if (isFromMe) {
      logger.info({ remoteJid }, 'Mensagem enviada pelo atendente humano (fromMe=true): pausando IA para este cliente');
      
      // Cria ou atualiza o cliente pausando a IA
      const client = await clientService.getOrCreate(remoteJid, tenant.id);
      await clientService.setStatus(remoteJid, tenant.id, 'paused');

      const outText =
        body.data.message?.conversation ||
        body.data.message?.extendedTextMessage?.text ||
        '[Mensagem do Atendente]';

      await messageService.logMessage({
        tenant_id: tenant.id,
        client_id: client.id,
        phone: remoteJid,
        role: 'user', // Registrado como operador humano
        content: outText,
        message_type: body.data.messageType,
      });

      return;
    }

    const pushName = body.data.pushName || 'Desconhecido';
    const messageType = body.data.messageType || 'conversation';
    const isAudio = messageType === 'audioMessage' || messageType === 'voiceMessage';

    // 3. EXTRAÇÃO OU TRANSCRIÇÃO DE ÁUDIO VIA GEMINI
    let messageText =
      body.data.message?.conversation ||
      body.data.message?.extendedTextMessage?.text ||
      '';

    if (isAudio) {
      logger.info({ remoteJid, messageId }, 'Mensagem de áudio recebida, buscando base64 para transcrição...');
      
      // 3.1 Obtém o áudio em base64 da Evolution API
      let audioBase64: string | null | undefined = body.data.message?.audioMessage?.base64;
      if (!audioBase64) {
        audioBase64 = await evolutionApi.getBase64FromMediaMessage(
          instanceName,
          messageId,
          tenant.evolution_api_key
        );
      }

      // 3.2 Transcreve com Gemini
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
      // Outras mídias (imagem, documento, vídeo, figurinha)
      messageText = `[Arquivo de Mídia recebido: ${messageType} - A equipe analisará]`;
    }

    // 4. VERIFICA SE É MEMBRO DA EQUIPE / ADMIN
    const teamMember = await teamService.getMember(remoteJid, tenant.id);

    if (teamMember && teamMember.role === 'admin') {
      logger.info({ admin: teamMember.name, remoteJid }, 'Mensagem recebida de membro da equipe/admin');

      // 4.1 Tratamento de Comandos de Controle (!shhh e !volte)
      const trimmed = messageText.trim();
      if (trimmed.startsWith('!')) {
        if (trimmed === '!shhh') {
          await teamService.setStatus(remoteJid, tenant.id, 'paused');
          await evolutionApi.sendTextMessage({
            instanceName: tenant.evolution_instance_name,
            remoteJid,
            text: '🤫 *Modo silêncio ativado!*\nNão vou responder suas mensagens até você me chamar com *!volte*.',
            apiKey: tenant.evolution_api_key,
          });
          return;
        }

        // Qualquer outro comando reativa o bot
        await teamService.setStatus(remoteJid, tenant.id, 'active');
        await evolutionApi.sendTextMessage({
          instanceName: tenant.evolution_instance_name,
          remoteJid,
          text: '👋 *Estou de volta!*\nComo posso ajudar você e o escritório hoje?',
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
      await debounceService.bufferMessage(remoteJid, messageText, async (fullText) => {
        await messageService.logMessage({
          tenant_id: tenant.id,
          phone: remoteJid,
          role: 'admin',
          content: fullText,
          message_type: messageType,
        });

        const history = await messageService.getRecentHistory(remoteJid, tenant.id, 10);
        const historyFormatted = messageService.formatHistoryForAgent(
          history,
          config.internal_agent_name || 'Atlas',
          teamMember.name
        );

        const context = {
          tenantId: tenant.id,
          instanceName: tenant.evolution_instance_name,
          notificationGroupId: config.notification_group_id,
          phone: remoteJid,
          clientName: teamMember.name,
          historyFormatted,
        };

        const reply = await internalAgentService.runInternalAssistant({
          systemPrompt: config.internal_system_prompt || '',
          userMessage: fullText,
          historyFormatted,
          context,
          adminName: teamMember.name,
          adminRole: teamMember.role,
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

    await debounceService.bufferMessage(remoteJid, messageText, async (fullMessage) => {
      // Registra mensagem do cliente
      await messageService.logMessage({
        tenant_id: tenant.id,
        client_id: client.id,
        phone: remoteJid,
        role: 'user',
        content: fullMessage,
        message_type: messageType,
      });

      const history = await messageService.getRecentHistory(remoteJid, tenant.id, 12);
      const historyFormatted = messageService.formatHistoryForAgent(
        history,
        config.external_agent_name || 'Karol',
        client.name || pushName
      );

      const rawPrompt = config.external_system_prompt || 'Você é uma assistente jurídica profissional e atenciosa.';
      const compiledPrompt = compileSystemPrompt(rawPrompt, {
        tenantName: tenant.name,
        clientName: client.name || pushName,
        clientStatus: client.status,
        phone: remoteJid,
        agentName: config.external_agent_name || 'Karol',
        historyFormatted,
      });

      const context = {
        tenantId: tenant.id,
        instanceName: tenant.evolution_instance_name,
        notificationGroupId: config.notification_group_id,
        phone: remoteJid,
        clientId: client.id,
        clientName: client.name || pushName,
        historyFormatted,
      };

      const aiReply = await agentService.runConversation({
        systemPrompt: compiledPrompt,
        userMessage: fullMessage,
        historyFormatted,
        context,
        temperature: config.temperature || 0.4,
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
    });
  } catch (err: any) {
    logger.error({ err: err.message, remoteJid, instanceName }, 'Erro ao processar webhook da Evolution');
  }
});
