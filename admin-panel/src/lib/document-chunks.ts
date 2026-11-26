/**
 * Reconstitui o texto completo contínuo de múltiplos chunks pertencentes ao mesmo documento original,
 * ordenando por `chunk_index` e removendo a sobreposição contextual (overlap).
 */
export function reconstructFullDocumentText(chunks: any[]): string {
    if (!chunks || chunks.length === 0) return "";
    if (chunks.length === 1) return chunks[0].content || "";

    const sorted = [...chunks].sort((a, b) => {
        const idxA = a.metadata?.chunk_index ?? 0;
        const idxB = b.metadata?.chunk_index ?? 0;
        return idxA - idxB;
    });

    let fullText = sorted[0].content || "";
    for (let i = 1; i < sorted.length; i++) {
        const nextChunk = sorted[i].content || "";
        if (!nextChunk) continue;

        let overlapFound = false;
        const maxOverlap = Math.min(fullText.length, nextChunk.length, 300);

        for (let len = maxOverlap; len >= 15; len--) {
            const suffix = fullText.slice(-len);
            if (nextChunk.startsWith(suffix)) {
                fullText += nextChunk.slice(len);
                overlapFound = true;
                break;
            }
        }

        if (!overlapFound) {
            fullText += "\n\n" + nextChunk;
        }
    }

    return fullText.trim();
}
