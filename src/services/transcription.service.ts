import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class TranscriptionService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  /**
   * Transcreve áudio do WhatsApp (base64) diretamente para texto utilizando Gemini
   */
  async transcribeAudioBase64(audioBase64: string, mimeType = 'audio/ogg'): Promise<string | null> {
    if (!audioBase64) return null;

    const cleanBase64 = audioBase64.replace(/^data:audio\/\w+;base64,/, '');

    try {
      const model = this.genAI.getGenerativeModel({ model: env.GEMINI_MODEL });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: 'Transcreva com fidelidade e pontuação correta o que foi falado neste áudio em português. Retorne apenas o texto transcrito, sem comentários, introduções ou explicações.',
        },
      ]);

      const text = result.response.text();
      return (text || '').trim();
    } catch (err: any) {
      logger.error({ err: err.message }, 'Falha ao transcrever áudio com Gemini');
      return null;
    }
  }
}

export const transcriptionService = new TranscriptionService();
