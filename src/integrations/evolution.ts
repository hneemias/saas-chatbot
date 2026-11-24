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

export class EvolutionApiClient {
  private baseUrl: string;
  private defaultApiKey: string;

  constructor() {
    this.baseUrl = env.EVOLUTION_API_URL.replace(/\/+$/, '');
    this.defaultApiKey = env.EVOLUTION_API_KEY;
  }

  async sendTextMessage(options: SendTextOptions): Promise<any> {
    const { instanceName, remoteJid, text, delay = 1000, apiKey } = options;

    if (!text || text.trim() === '') {
      logger.warn({ remoteJid }, 'Tentativa de enviar mensagem vazia abortada');
      return null;
    }

    const url = `${this.baseUrl}/message/sendText/${instanceName}`;
    const key = apiKey || this.defaultApiKey;

    const body = {
      number: remoteJid.replace('@s.whatsapp.net', ''),
      text: text.trim(),
      delay,
    };

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

      const data = await res.json();
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

      const data = await res.json();
      logger.info({ remoteJid, instanceName }, 'Áudio enviado com sucesso pelo WhatsApp');
      return data;
    } catch (err: any) {
      logger.error({ err: err.message, remoteJid }, 'Exceção ao chamar Evolution API sendAudio');
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
