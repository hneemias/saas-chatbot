import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
export class TtsService {
    apiUrl;
    apiKey;
    constructor() {
        this.apiUrl = env.MULTIVOZES_API_URL || 'http://multivozes.76.13.232.73.sslip.io/v1/audio/speech';
        this.apiKey = env.MULTIVOZES_API_KEY || 'multivozes_br_engine_123';
    }
    /**
     * Normaliza o texto para leitura natural pelo motor de TTS (remove emojis e formatações pesadas)
     */
    normalizeTextForSpeech(text) {
        if (!text)
            return '';
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
     * Síntese direta via motor nativo MsEdgeTTS (altíssima fidelidade neural brasileira, zero latência e sem dependência de microserviço HTTP)
     */
    async generateSpeechDirect(rawText, voice = 'pt-BR-AntonioNeural') {
        const text = this.normalizeTextForSpeech(rawText);
        if (!text)
            return null;
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                logger.warn({ voice }, 'Timeout na síntese direta MsEdgeTTS (10s)');
                resolve(null);
            }, 10000);
            try {
                const edgeTts = new MsEdgeTTS();
                const selectedVoice = voice.includes('Neural')
                    ? voice
                    : voice === 'alloy' || voice === 'echo' || voice === 'onyx'
                        ? 'pt-BR-AntonioNeural'
                        : 'pt-BR-FranciscaNeural';
                edgeTts
                    .setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
                    .then(() => {
                    const { audioStream } = edgeTts.toStream(text);
                    const chunks = [];
                    audioStream.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    audioStream.on('end', () => {
                        clearTimeout(timer);
                        const fullBuffer = Buffer.concat(chunks);
                        if (fullBuffer.length > 0) {
                            logger.info({ voice: selectedVoice, bytes: fullBuffer.length }, 'Áudio sintetizado com sucesso via MsEdgeTTS direto');
                            resolve(fullBuffer.toString('base64'));
                        }
                        else {
                            resolve(null);
                        }
                    });
                    audioStream.on('error', (streamErr) => {
                        clearTimeout(timer);
                        logger.warn({ err: streamErr?.message }, 'Falha no stream direto do MsEdgeTTS');
                        resolve(null);
                    });
                })
                    .catch((metaErr) => {
                    clearTimeout(timer);
                    logger.warn({ err: metaErr?.message }, 'Falha ao inicializar metadados do MsEdgeTTS');
                    resolve(null);
                });
            }
            catch (err) {
                clearTimeout(timer);
                logger.warn({ err: err?.message }, 'Exceção ao instanciar MsEdgeTTS');
                resolve(null);
            }
        });
    }
    /**
     * Gera áudio com cascata:
     * 1. Tenta sintetizar diretamente via MsEdgeTTS Neural em memória;
     * 2. Se falhar, tenta o microserviço HTTP Multivozes;
     */
    async generateSpeechBase64(rawText, voice = 'alloy') {
        const text = this.normalizeTextForSpeech(rawText);
        if (!text)
            return null;
        // 1. Motor direto nativo (ultra-rápido, voz natural neural brasileira)
        const directBase64 = await this.generateSpeechDirect(text, voice);
        if (directBase64) {
            return directBase64;
        }
        // 2. Fallback para microserviço HTTP Multivozes
        try {
            logger.info('Tentando fallback para serviço HTTP Multivozes...');
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
                logger.error({ status: res.status, errText }, 'Falha no fallback HTTP Multivozes');
                return null;
            }
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return buffer.toString('base64');
        }
        catch (err) {
            logger.error({ err: err.message }, 'Exceção no fallback HTTP Multivozes');
            return null;
        }
    }
}
export const ttsService = new TtsService();
