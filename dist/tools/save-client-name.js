import { SchemaType } from '@google/generative-ai';
import { clientService } from '../services/client.service.js';
export const saveClientNameTool = {
    declaration: {
        name: 'save_client_name',
        description: 'Salva o nome do cliente no banco de dados quando ele se identifica.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: {
                    type: SchemaType.STRING,
                    description: 'O nome completo ou primeiro nome informado pelo cliente.',
                },
            },
            required: ['name'],
        },
    },
    execute: async (args, context) => {
        if (!args.name) {
            return { success: false, message: 'Nome não fornecido.' };
        }
        const success = await clientService.updateName(context.phone, context.tenantId, args.name.trim());
        return {
            success,
            message: success
                ? `Nome do cliente registrado como "${args.name}".`
                : 'Não foi possível atualizar o nome.',
        };
    },
};
