/**
 * Utilitários de normalização canônica de telefone / JID do WhatsApp.
 * Evita cadastros duplicados por sufixo de dispositivo (`:12@s.whatsapp.net`),
 * variações de formatação ou diferença do 9º dígito em celulares brasileiros (DDDs 11–99).
 */

export function normalizeWhatsAppJid(rawPhone: string): string {
  const trimmed = (rawPhone || '').trim();
  if (!trimmed) return '';

  // Mantém grupos intactos (apenas limpando espaços)
  if (trimmed.endsWith('@g.us')) {
    return trimmed;
  }

  const [userPartRaw, domainRaw] = trimmed.split('@');
  // Remove sufixo multi-device do WhatsApp (ex: "556496063283:14" -> "556496063283")
  const cleanUser = (userPartRaw || '').split(':')[0].replace(/\D/g, '');
  if (!cleanUser) return trimmed;

  const domain = (domainRaw || 's.whatsapp.net').toLowerCase();
  if (domain === 'lid') {
    return `${cleanUser}@lid`;
  }

  // Se vier número brasileiro sem DDI 55 (10 ou 11 dígitos), prefixa 55
  let normalizedDigits = cleanUser;
  if (normalizedDigits.length >= 10 && normalizedDigits.length <= 11 && !normalizedDigits.startsWith('55')) {
    normalizedDigits = `55${normalizedDigits}`;
  }

  return `${normalizedDigits}@s.whatsapp.net`;
}

/**
 * Retorna a chave numérica canônica para comparação/deduplicação de números brasileiros.
 * Ex: `5564996063283@s.whatsapp.net` e `556496063283@s.whatsapp.net` geram a mesma chave `556496063283`.
 */
export function getCanonicalPhoneKey(rawPhone: string): string {
  const normalized = normalizeWhatsAppJid(rawPhone);
  if (!normalized || normalized.endsWith('@g.us') || normalized.endsWith('@lid')) {
    return normalized;
  }

  const digits = normalized.split('@')[0];
  // Celular BR com 13 dígitos (55 + DDD + 9 + 8 dígitos) -> reduz para chave base de 12 dígitos
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    return digits.slice(0, 4) + digits.slice(5);
  }
  return digits;
}

/**
 * Retorna os JIDs equivalentes (com e sem 9º dígito no Brasil) para buscas tolerantes no banco,
 * impedindo que um contato cadastrado manualmente com 9 dígitos duplique quando o WhatsApp entrega 8 dígitos (ou vice-versa).
 */
export function getEquivalentPhoneJids(rawPhone: string): string[] {
  const primary = normalizeWhatsAppJid(rawPhone);
  if (!primary) return [];

  if (primary.endsWith('@g.us') || primary.endsWith('@lid')) {
    return [primary];
  }

  const digits = primary.split('@')[0];
  const variants = new Set<string>([primary]);

  if (digits.startsWith('55')) {
    if (digits.length === 13 && digits[4] === '9') {
      // Possui 9º dígito -> adiciona variante de 12 dígitos
      const withoutNine = digits.slice(0, 4) + digits.slice(5);
      variants.add(`${withoutNine}@s.whatsapp.net`);
    } else if (digits.length === 12) {
      // 12 dígitos -> adiciona variante de 13 dígitos com 9º dígito
      const firstLocalDigit = Number(digits[4]);
      if (firstLocalDigit >= 6 && firstLocalDigit <= 9) {
        const withNine = `${digits.slice(0, 4)}9${digits.slice(4)}`;
        variants.add(`${withNine}@s.whatsapp.net`);
      }
    }
  }

  return Array.from(variants);
}
