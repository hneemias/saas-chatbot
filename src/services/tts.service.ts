import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class TtsService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = env.MULTIVOZES_API_URL || 'http://multivozes.76.13.232.73.sslip.io/v1/audio/speech';
    this.apiKey = env.MULTIVOZES_API_KEY || 'multivozes_br_engine_123';
  }

  /**
   * Normaliza o texto para leitura natural pelo motor de TTS (remove emojis e formatações pesadas)
   */
  normalizeTextForSpeech(text: string): string {
    if (!text) return '';

    return text
      // Remove emojis
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      // Remove marcadores de lista e formatações Markdown
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#/g, '')
      .replace(/`{1,3}/g, '')
      .replace(/wa\.me\/\S+/g, 'link do WhatsApp')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Gera o áudio via requisição HTTP para o motor Multivozes
   */
  async generateSpeechBase64(rawText: string, voice = 'alloy'): Promise<string | null> {
    const text = this.normalizeTextForSpeech(rawText);
    if (!text) return null;

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error({ status: res.status, errText }, 'Falha ao gerar áudio no serviço TTS');
        return null;
      }

      // Converte o arrayBuffer do áudio para Base64
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return buffer.toString('base64');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Exceção ao chamar serviço Multivozes de áudio');
      return null;
    }
  }
}

export const ttsService = new TtsService();
