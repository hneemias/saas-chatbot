import { SchemaType } from '@google/generative-ai';
import { productService } from '../services/product.service.js';
import { messageService } from '../services/message.service.js';
import { evolutionApi } from '../integrations/evolution.js';
import { ToolContext } from '../types/index.js';
import { AgentTool } from './types.js';
import { logger } from '../utils/logger.js';

function formatBrl(value: number): string {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Ferramenta de consulta ao Catálogo de Produtos (Agente Externo — Clientes).
 */
export const searchProductsTool: AgentTool = {
  declaration: {
    name: 'search_products',
    description:
      'Consulta em tempo real o catálogo de produtos da loja (preço de venda, saldo em estoque, código SKU e se possui foto disponível). Use SEMPRE que o cliente perguntar se tem algum produto, quais modelos existem ou quanto custa.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            'Termo de busca do produto (ex: "teclado mecânico", "mouse sem fio", "SSD 480", "headset", ou código do item).',
        },
        max_price: {
          type: SchemaType.NUMBER,
          description:
            'Opcional: valor máximo em reais caso o cliente informe limite de orçamento (ex: 250).',
        },
        include_out_of_stock: {
          type: SchemaType.BOOLEAN,
          description:
            'Opcional: defina true apenas se quiser verificar também itens temporariamente sem saldo em estoque.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (
    args: { query: string; max_price?: number; include_out_of_stock?: boolean },
    context: ToolContext
  ) => {
    logger.info(
      { query: args.query, maxPrice: args.max_price, tenantId: context.tenantId },
      'Consultando catálogo de produtos'
    );

    const hits = await productService.searchProducts({
      tenantId: context.tenantId,
      query: args.query,
      onlyInStock: !args.include_out_of_stock,
      maxPrice: args.max_price,
      limit: 8,
    });

    if (!hits || hits.length === 0) {
      return {
        found: false,
        message:
          'Nenhum produto em estoque correspondeu diretamente a essa busca no catálogo cadastrado. Não invente modelos nem preços: informe com simpatia que vai confirmar a disponibilidade atual no balcão/estoque com a equipe.',
      };
    }

    const items = hits.map((p) => ({
      sku: p.sku,
      name: p.name,
      category: p.category || undefined,
      description: p.description || undefined,
      price_brl: formatBrl(p.price),
      stock_quantity: p.stock_quantity,
      has_photo: Array.isArray(p.image_urls) && p.image_urls.length > 0,
    }));

    return {
      found: true,
      count: items.length,
      products: items,
      instruction:
        'Apresente as opções mais adequadas de forma consultiva informando o valor exato de `price_brl`. Para itens com `has_photo: true`, se o cliente pediu foto (ou se fizer sentido mostrar), use `send_product_photo` passando o(s) `sku` (máximo 3 por vez).',
    };
  },
};

// Cache em memória para evitar envio duplicado da mesma foto na mesma interação
const recentSentPhotos = new Map<string, number>();

function isPhotoRecentlySent(key: string): boolean {
  const now = Date.now();
  const sentAt = recentSentPhotos.get(key);
  if (sentAt && now - sentAt < 45000) {
    return true;
  }
  recentSentPhotos.set(key, now);
  if (recentSentPhotos.size > 200) {
    for (const [k, v] of recentSentPhotos.entries()) {
      if (now - v > 60000) recentSentPhotos.delete(k);
    }
  }
  return false;
}

/**
 * Ferramenta de envio de foto real do produto no WhatsApp do cliente.
 */
export const sendProductPhotoTool: AgentTool = {
  declaration: {
    name: 'send_product_photo',
    description:
      'Envia no WhatsApp do cliente a foto real de até 3 produtos do catálogo (apenas produtos que retornaram `has_photo: true` em `search_products`). A foto já inclui legenda com nome, código e valor. Gere apenas uma frase curta e simpática acompanhando o envio, SEM repetir a legenda e SEM escrever "[Foto enviada]".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        skus: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description:
            'Lista de códigos (`sku`) dos produtos cujas fotos devem ser enviadas (máximo de 3 códigos por mensagem).',
        },
      },
      required: ['skus'],
    },
  },
  execute: async (args: { skus: string[] }, context: ToolContext) => {
    const requestedSkus = Array.isArray(args.skus) ? args.skus.slice(0, 3) : [];
    if (requestedSkus.length === 0) {
      return { success: false, error: 'Informe ao menos um código SKU válido.' };
    }

    const products = await productService.getProductsBySkus(context.tenantId, requestedSkus);
    if (products.length === 0) {
      return { success: false, error: 'Produtos não localizados para os códigos informados.' };
    }

    const sentProducts: string[] = [];
    const withoutPhoto: string[] = [];

    for (const prod of products) {
      const urls = Array.isArray(prod.image_urls) ? prod.image_urls.filter(Boolean) : [];
      if (urls.length === 0) {
        withoutPhoto.push(`${prod.name} (${prod.sku})`);
        continue;
      }

      const dedupeKey = `${context.tenantId}:${context.phone}:${prod.sku}`;
      if (isPhotoRecentlySent(dedupeKey)) {
        logger.info({ sku: prod.sku, phone: context.phone }, 'Foto já enviada recentemente, ignorando retransmissão duplicada');
        sentProducts.push(`${prod.name} (${formatBrl(prod.price)})`);
        continue;
      }

      const caption = `*${prod.name}*\nCódigo: ${prod.sku} • Valor: *${formatBrl(prod.price)}*`;

      try {
        await evolutionApi.sendImageMessage({
          instanceName: context.instanceName,
          remoteJid: context.phone,
          imageUrl: urls[0],
          caption,
          delay: 900,
          apiKey: context.evolutionApiKey,
        });

        await messageService.logMessage({
          tenant_id: context.tenantId,
          client_id: context.clientId || null,
          phone: context.phone,
          role: 'assistant',
          content: caption,
          message_type: 'image',
        });

        sentProducts.push(`${prod.name} (${formatBrl(prod.price)})`);
      } catch (err: any) {
        logger.error({ err: err.message, sku: prod.sku }, 'Falha ao enviar foto do produto');
      }
    }

    return {
      success: sentProducts.length > 0,
      sent_count: sentProducts.length,
      sent_products: sentProducts,
      instruction:
        'A foto já foi enviada no WhatsApp com a legenda completa (nome, código e valor). Na sua resposta em texto de acompanhamento, NÃO repita a legenda e NÃO escreva "[Foto enviada]". Apenas escreva 1 ou 2 frases simpáticas comentando sobre o modelo e perguntando a opinião do cliente.',
      without_photo: withoutPhoto.length > 0 ? withoutPhoto : undefined,
    };
  },
};

/**
 * Versão interna para o Copiloto da Equipe (consulta estoque completo inclusive zerados).
 */
export const internalSearchProductsTool: AgentTool = {
  declaration: {
    name: 'search_products',
    description:
      'Consulta o catálogo completo de produtos da loja (incluindo itens com estoque zerado, códigos SKU e preços de venda) para apoiar técnicos, vendedores e gerência.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'Nome, categoria, marca ou código SKU do produto.',
        },
        only_in_stock: {
          type: SchemaType.BOOLEAN,
          description: 'Se true, retorna apenas produtos com saldo maior que zero.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (
    args: { query: string; only_in_stock?: boolean },
    context: ToolContext
  ) => {
    const hits = await productService.searchProducts({
      tenantId: context.tenantId,
      query: args.query,
      onlyInStock: Boolean(args.only_in_stock),
      limit: 12,
    });

    return {
      found: hits.length > 0,
      count: hits.length,
      products: hits.map((p) => ({
        sku: p.sku,
        name: p.name,
        category: p.category || undefined,
        price_brl: formatBrl(p.price),
        stock_quantity: p.stock_quantity,
        has_photo: Array.isArray(p.image_urls) && p.image_urls.length > 0,
      })),
    };
  },
};
