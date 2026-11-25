import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface SendTextOptions {
  instanceName: string;
  remoteJid: string;
  text: string;
  delay?: number;
  apiKey?: string;
}

export interface SendAudioOptions {
  instanceName: string;
  remoteJid: string;
  audioBase64: string;
  delay?: number;
  apiKey?: string;
}

export interface SendImageOptions {
  instanceName: string;
  remoteJid: string;
  imageUrl: string;
  caption?: string;
  delay?: number;
  apiKey?: string;
}

function normalizeJid(jid: string): string {
  return (jid || '').trim().toLowerCase();
}

function normalizeText(text: string): string {
  return (text || '').trim().replace(/\s+/g, ' ');
}

export class EvolutionApiClient {
  private baseUrl: string;
  private defaultApiKey: string;
  // Rastreia IDs e assinaturas de mensagens enviadas pelo próprio bot nos últimos segundos
  // para evitar que o eco do webhook (fromMe: true) pause indevidamente o cliente (Handover).
  private recentMessageIds = new Map<string, number>();
  private recentOutboxSignatures = new Map<string, number>();
  private OUTBOX_TTL_MS = 45_000;

  constructor() {
    this.baseUrl = env.EVOLUTION_API_URL.replace(/\/+$/, '');
    this.defaultApiKey = env.EVOLUTION_API_KEY;
  }

  private pruneOutbox(now = Date.now()): void {
    for (const [k, exp] of this.recentMessageIds.entries()) {
      if (exp <= now) this.recentMessageIds.delete(k);
    }
    for (const [k, exp] of this.recentOutboxSignatures.entries()) {
      if (exp <= now) this.recentOutboxSignatures.delete(k);
    }
  }

  private makeSignature(instanceName: string, remoteJid: string, contentMarker: string): string {
    return `${instanceName.toLowerCase()}::${normalizeJid(remoteJid)}::${contentMarker}`;
  }

  markOutgoingBotMessage(params: {
    instanceName: string;
    remoteJid: string;
    text?: string;
    isAudio?: boolean;
    isImage?: boolean;
    messageId?: string;
  }): void {
    const now = Date.now();
    this.pruneOutbox(now);
    const expiresAt = now + this.OUTBOX_TTL_MS;

    if (params.messageId) {
      this.recentMessageIds.set(params.messageId, expiresAt);
    }
    if (params.text) {
      const sig = this.makeSignature(params.instanceName, params.remoteJid, normalizeText(params.text));
      this.recentOutboxSignatures.set(sig, expiresAt);
    }
    if (params.isAudio) {
      const audioSig = this.makeSignature(params.instanceName, params.remoteJid, '__BOT_AUDIO__');
      this.recentOutboxSignatures.set(audioSig, expiresAt);
    }
    if (params.isImage) {
      const imgSig = this.makeSignature(params.instanceName, params.remoteJid, '__BOT_IMAGE__');
      this.recentOutboxSignatures.set(imgSig, expiresAt);
    }
  }

  /**
   * Verifica se um evento `fromMe: true` recebido no webhook foi disparado pelo próprio bot
   * (e não por um atendente humano digitando no WhatsApp Web / celular).
   */
  wasRecentlySentByBot(params: {
    instanceName: string;
    remoteJid: string;
    messageId?: string;
    text?: string;
    messageType?: string;
  }): boolean {
    const now = Date.now();
    this.pruneOutbox(now);

    if (params.messageId && this.recentMessageIds.has(params.messageId)) {
      this.recentMessageIds.delete(params.messageId);
      return true;
    }

    if (params.text) {
      const sig = this.makeSignature(params.instanceName, params.remoteJid, normalizeText(params.text));
      if (this.recentOutboxSignatures.has(sig)) {
        this.recentOutboxSignatures.delete(sig);
        return true;
      }
    }

    if (params.messageType === 'audioMessage' || params.messageType === 'voiceMessage') {
      const audioSig = this.makeSignature(params.instanceName, params.remoteJid, '__BOT_AUDIO__');
      if (this.recentOutboxSignatures.has(audioSig)) {
        this.recentOutboxSignatures.delete(audioSig);
        return true;
      }
    }

    if (params.messageType === 'imageMessage') {
      const imgSig = this.makeSignature(params.instanceName, params.remoteJid, '__BOT_IMAGE__');
      if (this.recentOutboxSignatures.has(imgSig)) {
        this.recentOutboxSignatures.delete(imgSig);
        return true;
      }
    }

    return false;
  }

  async sendTextMessage(options: SendTextOptions): Promise<any> {
    const { instanceName, remoteJid, text, delay = 1000, apiKey } = options;

    if (!text || text.trim() === '') {
      logger.warn({ remoteJid }, 'Tentativa de enviar mensagem vazia abortada');
      return null;
    }

    const trimmedText = text.trim();
    const url = `${this.baseUrl}/message/sendText/${instanceName}`;
    const key = apiKey || this.defaultApiKey;

    const body = {
      number: remoteJid.replace('@s.whatsapp.net', ''),
      text: trimmedText,
      delay,
    };

    // Registra ANTES do fetch para evitar condição de corrida caso o webhook chegue antes da resposta HTTP
    this.markOutgoingBotMessage({ instanceName, remoteJid, text: trimmedText });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error({ status: res.status, errText, remoteJid }, 'Erro ao enviar mensagem via Evolution API');
        throw new Error(`Evolution API sendText failed: ${res.status} - ${errText}`);
      }

      const data = (await res.json()) as any;
      const sentId = data?.key?.id || data?.data?.key?.id;
      if (sentId) {
        this.markOutgoingBotMessage({ instanceName, remoteJid, messageId: sentId });
      }

      logger.info({ remoteJid, instanceName }, 'Mensagem enviada com sucesso pelo WhatsApp');
      return data;
    } catch (err: any) {
      logger.error({ err: err.message, remoteJid }, 'Exceção ao chamar Evolution API sendText');
      throw err;
    }
  }

  async sendAudioMessage(options: SendAudioOptions): Promise<any> {
    const { instanceName, remoteJid, audioBase64, delay = 1000, apiKey } = options;
    const url = `${this.baseUrl}/message/sendWhatsAppAudio/${instanceName}`;
    const key = apiKey || this.defaultApiKey;

    const cleanBase64 = audioBase64.replace(/^data:audio\/\w+;base64,/, '');

    const body = {
      number: remoteJid.replace('@s.whatsapp.net', ''),
      audio: cleanBase64,
      delay,
      encoding: true,
    };

    this.markOutgoingBotMessage({ instanceName, remoteJid, isAudio: true });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error({ status: res.status, errText, remoteJid }, 'Erro ao enviar áudio via Evolution API');
        throw new Error(`Evolution API sendAudio failed: ${res.status} - ${errText}`);
      }

      const data = (await res.json()) as any;
      const sentId = data?.key?.id || data?.data?.key?.id;
      if (sentId) {
        this.markOutgoingBotMessage({ instanceName, remoteJid, messageId: sentId });
      }

      logger.info({ remoteJid, instanceName }, 'Áudio enviado com sucesso pelo WhatsApp');
      return data;
    } catch (err: any) {
      logger.error({ err: err.message, remoteJid }, 'Exceção ao chamar Evolution API sendAudio');
      throw err;
    }
  }

  async sendImageMessage(options: SendImageOptions): Promise<any> {
    const { instanceName, remoteJid, imageUrl, caption = '', delay = 1000, apiKey } = options;
    const url = `${this.baseUrl}/message/sendMedia/${instanceName}`;
    const key = apiKey || this.defaultApiKey;

    const body = {
      number: remoteJid.replace('@s.whatsapp.net', ''),
      mediatype: 'image',
      media: imageUrl,
      caption: caption.trim(),
      delay,
    };

    this.markOutgoingBotMessage({ instanceName, remoteJid, isImage: true, text: caption.trim() || undefined });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error({ status: res.status, errText, remoteJid }, 'Erro ao enviar imagem via Evolution API');
        throw new Error(`Evolution API sendMedia failed: ${res.status} - ${errText}`);
      }

      const data = (await res.json()) as any;
      const sentId = data?.key?.id || data?.data?.key?.id;
      if (sentId) {
        this.markOutgoingBotMessage({ instanceName, remoteJid, messageId: sentId, isImage: true });
      }

      logger.info({ remoteJid, instanceName }, 'Imagem de produto enviada com sucesso pelo WhatsApp');
      return data;
    } catch (err: any) {
      logger.error({ err: err.message, remoteJid }, 'Exceção ao chamar Evolution API sendMedia');
      throw err;
    }
  }

  /**
   * Baixa a mídia (áudio/imagem) em Base64 através da Evolution API
   */
  async getBase64FromMediaMessage(instanceName: string, messageId: string, apiKey?: string): Promise<string | null> {
    const url = `${this.baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`;
    const key = apiKey || this.defaultApiKey;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
        },
        body: JSON.stringify({
          message: {
            key: {
              id: messageId,
            },
          },
          convertToMp4: false,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.warn({ status: res.status, messageId, errText }, 'Não foi possível obter mídia base64 da Evolution API');
        return null;
      }

      const data = (await res.json()) as any;
      return data?.base64 || data?.data?.base64 || null;
    } catch (err: any) {
      logger.error({ err: err.message, messageId }, 'Erro ao buscar mídia base64 na Evolution API');
      return null;
    }
  }
}

export const evolutionApi = new EvolutionApiClient();
