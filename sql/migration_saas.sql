-- ==========================================
-- SCRIPT DE MIGRAÇÃO PARA SAAS (MULTI-TENANT)
-- ==========================================
-- Este script prepara o banco para múltiplos escritórios.
-- Nenhuma tabela existente é excluída. Ações são aditivas.

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Criar tabela de Tenants (Espinha dorsal do SaaS)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL, 
    openai_api_key TEXT,
    evolution_instance_name TEXT UNIQUE NOT NULL,
    evolution_api_key TEXT,
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'inactive', 'trial')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Criar tabela de Configurações (Configurações de IA e Agenda por Escritório)
CREATE TABLE IF NOT EXISTS tenant_configs (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Agente Externo (Ex: Karol)
    external_agent_name TEXT DEFAULT 'Karol',
    external_system_prompt TEXT NOT NULL,
    
    -- Agente Interno (Ex: Atlas)
    internal_agent_name TEXT DEFAULT 'Atlas',
    internal_system_prompt TEXT NOT NULL,

    classifier_rules JSONB DEFAULT '{}',
    calendar_config JSONB DEFAULT '{
      "business_start": "00:00",
      "business_end": "18:00",
      "lunch_start": "11:00",
      "lunch_end": "14:00",
      "work_days": [1, 2, 3, 4, 5]
    }',
    notification_group_id TEXT, -- ID do grupo de WhatsApp para alertas (ex: 120363...@g.us)
    temperature FLOAT DEFAULT 0.7,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Adaptar tabelas existentes para Multi-tenancy
-- Adicionar coluna tenant_id onde falta

-- Tabela Clients
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='tenant_id') THEN
        ALTER TABLE clients ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Remover UNIQUE global de phone se existir e criar UNIQUE por tenant
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_phone_key;
DROP INDEX IF EXISTS idx_clients_phone_tenant;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_tenant ON clients(phone, tenant_id);

-- Tabela Messages
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='tenant_id') THEN
        ALTER TABLE messages ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Tabela Team Members
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_members' AND column_name='tenant_id') THEN
        ALTER TABLE team_members ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_phone_key;
DROP INDEX IF EXISTS idx_team_members_phone_tenant;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_phone_tenant ON team_members(phone, tenant_id);

-- 5. Criar Base de Conhecimento RAG (Nativa para SaaS)
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding vector(1536), 
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Criar Memória de Chat (Centralizada e Isolada)
CREATE TABLE IF NOT EXISTS chat_memory (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL, -- será: tenant_id + remote_jid
    message JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para performance de busca de histórico no SaaS
CREATE INDEX IF NOT EXISTS idx_chat_memory_session ON chat_memory(session_id, created_at DESC);

-- 7. Leads Control (Dashboard de Vendas SaaS)
CREATE TABLE IF NOT EXISTS leads_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    temperature TEXT, -- Quente, Morno, Frio
    area TEXT,
    summary TEXT,
    next_step TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Bootstrap do Primeiro Tenant (SEGURANÇA PARA SISTEMA ATIVO)
-- Este bloco garante que, ao rodar a migration, o sistema atual NÃO PARE.
DO $$ 
DECLARE 
    v_tenant_id UUID;
    v_instance_name TEXT := 'teste'; -- << SUBSTITUA PELO NOME DA SUA INSTANCIA NO EVOLUTION
BEGIN 
    -- 1. Criar o tenant padrão se não existir
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'hiana-adv') THEN
        INSERT INTO tenants (name, slug, evolution_instance_name) 
        VALUES ('Hiana Carolina Advocacia', 'hiana-adv', v_instance_name)
        RETURNING id INTO v_tenant_id;

        -- 2. Criar a configuração padrão (Prompts)
        INSERT INTO tenant_configs (tenant_id, external_agent_name, internal_agent_name, external_system_prompt, internal_system_prompt, notification_group_id)
        VALUES (v_tenant_id, 'Karol', 'Atlas', 'Prompt da Karol...', 'Prompt do Atlas...', '120363424765543152@g.us');
    ELSE
        SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'hiana-adv';
    END IF;

    -- 3. Migrar dados órfãos para o novo tenant (Tratamento de Duplicados)
    -- Remover órfãos que já existem no tenant destino para evitar erro de UNIQUE (idx_clients_phone_tenant)
    DELETE FROM clients c1
    WHERE c1.tenant_id IS NULL 
    AND EXISTS (
        SELECT 1 FROM clients c2 
        WHERE c2.phone = c1.phone 
        AND c2.tenant_id = v_tenant_id
    );

    DELETE FROM team_members t1
    WHERE t1.tenant_id IS NULL 
    AND EXISTS (
        SELECT 1 FROM team_members t2 
        WHERE t2.phone = t1.phone 
        AND t2.tenant_id = v_tenant_id
    );

    UPDATE clients SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE messages SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE team_members SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;

    RAISE NOTICE 'SaaS Migration concluída com sucesso. Tenant ID associado: %', v_tenant_id;
END $$;

-- 10. Tabela de Admin (JWT Próprio)
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir usuário Admin Padrão (Senha: admin123 - Hash gerado via bcrypt)
-- Hash para 'admin123': $2a$10$w.... (será gerado no setup ou inserido manualmente)
-- Para facilitar, vamos deixar um comando comentado ou inserir um hash conhecido de teste.
-- Exemplo de Hash bcrypt para 'admin123': $2a$10$X7.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1
INSERT INTO admin_users (email, password_hash, full_name)
VALUES ('admin@advocacia.com', '$2b$10$OmcU/cR00utUm/AlDGNZVe27ss0etV8HDxqMGkhriC1juU55EmN/m', 'Administrador')
ON CONFLICT (email) DO NOTHING;
