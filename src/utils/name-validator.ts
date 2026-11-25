/**
 * Utilitário de validação e sanitização de nomes do WhatsApp (pushName).
 *
 * Filtra expressões que claramente NÃO são nomes próprios de pessoas:
 * - Frases religiosas ou slogans (ex: "Deus é Fiel", "Jesus te ama")
 * - Declarações de afeto ou homenagens familiares (ex: "Alice amor do papai", "Mãe do Theo")
 * - Nomes comerciais ou serviços (ex: "Borracharia do Zé", "Ana Bolos", "Vendas Online")
 * - Siglas, emojis isolados, símbolos ou textos longos (4+ palavras).
 */

const SUSPICIOUS_WORDS = new Set([
  // Religiosos / Slogans de Fé
  'deus',
  'jesus',
  'cristo',
  'salvador',
  'senhor',
  'fiel',
  'gospel',
  'igreja',
  'amem',
  'paz',
  'amor',
  'fe',
  'abencoado',
  'abencoada',
  'bencao',
  'gratidao',
  'gloria',
  'aleluia',
  'pastor',
  'pastora',
  'irmao',
  'irma',
  // Afeto / Relações Familiares / Apelidos
  'papai',
  'mamae',
  'pai',
  'mae',
  'filho',
  'filha',
  'bebe',
  'principe',
  'princesa',
  'vida',
  'coracao',
  'lindinho',
  'lindinha',
  'lindo',
  'linda',
  'gatinho',
  'gatinha',
  'menino',
  'menina',
  'meninos',
  'meninas',
  // Comerciais / Profissionais / Negócios
  'loja',
  'vendas',
  'comercio',
  'assistencia',
  'conserto',
  'celular',
  'celulares',
  'manutencao',
  'advogado',
  'advocacia',
  'mecanico',
  'oficina',
  'bolos',
  'lanches',
  'pizzaria',
  'entregas',
  'suporte',
  'tecnico',
  'oficial',
  'cia',
  'ltda',
  'meu',
  'minha',
  // Verbos e conectivos de frases
  'sou',
  'tem',
  'salva',
  'cuida',
  'vive',
  'faz',
  'foi',
  'pra',
  'com',
  'sem',
  'por',
  'sobre',
]);

export function sanitizePushName(rawName?: string | null): string {
  if (!rawName) return 'Desconhecido';

  // 1. Remove emojis e caracteres especiais decorativos, preservando letras e acentos
  const cleaned = rawName
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return 'Desconhecido';
  }

  // 2. Divide em palavras
  const words = cleaned.split(' ').filter(Boolean);

  // Se tiver 4 ou mais palavras, é quase certamente uma frase/slogan
  if (words.length >= 4) {
    return 'Desconhecido';
  }

  // 3. Verifica termos suspeitos (slogans, frases, comércios, homenagens)
  const lowerWords = words.map((w) =>
    w
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  );

  for (const w of lowerWords) {
    if (SUSPICIOUS_WORDS.has(w)) {
      return 'Desconhecido';
    }
  }

  // 4. Se tiver apenas consoantes (ex: "JK", "BR", "XYZ")
  const hasVowels = /[aeiouyáéíóúâêîôûãõàèìòù]/i.test(cleaned);
  if (!hasVowels) {
    return 'Desconhecido';
  }

  return cleaned;
}
