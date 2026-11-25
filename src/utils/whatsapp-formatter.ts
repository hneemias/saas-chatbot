/**
 * Converte formatações de Markdown padrão para o padrão nativo do WhatsApp.
 * No WhatsApp:
 * - Negrito é `*texto*` (apenas um asterisco). O uso de `**texto**` é interpretado como aspas/asteriscos literais.
 * - Itálico é `_texto_`.
 * - Tachado é `~texto~`.
 * - Títulos (#, ##, ###) viram `*texto*`.
 * - Marcadores de lista `- ` viram `• `.
 * - Aspas dobradas `""texto""` são corrigidas para `*texto*` (destaque).
 */
export function formatWhatsAppText(text: string): string {
  if (!text) return '';

  return text
    // Converte títulos Markdown (# Título) para negrito nativo do WhatsApp (*Título*)
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    // Converte negrito + itálico Markdown (***texto***) para WhatsApp (*_texto_*)
    .replace(/\*\*\*([^*]+)\*\*\*/g, '*_$1_*')
    // Converte negrito Markdown (**texto**) para negrito nativo do WhatsApp (*texto*)
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    // Converte aspas dobradas (""texto"") para destaque (*texto*)
    .replace(/""([^"]+)""/g, '*$1*')
    // Limpa aspas que envelopam negritos (*"texto"* ou "*texto*")
    .replace(/\*"([^*]+)"\*/g, '*$1*')
    .replace(/"\*([^*]+)\*"/g, '*$1*')
    // Limpa quaisquer asteriscos duplos residuais que tenham sobrado soltos
    .replace(/\*\*/g, '*')
    // Converte marcadores de lista '- ' no início da linha para bullet visual '• '
    .replace(/^(\s*)-\s+/gm, '$1• ')
    .trim();
}
