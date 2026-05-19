-- Policy document RAG: PDF storage metadata, vector chunks, chat history, audit log.
-- Run on existing DBs: psql postgresql://hr:hr@localhost:5432/hr -f db/migrations/002_policies.sql
-- Requires pgvector extension (use pgvector/pgvector:pg16 image for fresh Docker installs).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE policy_documents (
    id                SERIAL PRIMARY KEY,
    title             TEXT NOT NULL,
    filename          TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    team              TEXT NOT NULL,
    category          TEXT NOT NULL DEFAULT 'general',
    uploaded_by_email TEXT NOT NULL,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    status            TEXT NOT NULL DEFAULT 'processing'
                      CHECK (status IN ('processing', 'ready', 'failed')),
    page_count        INTEGER,
    error_message     TEXT
);

CREATE INDEX policy_documents_team_idx ON policy_documents(team);
CREATE INDEX policy_documents_status_idx ON policy_documents(status);

CREATE TABLE policy_chunks (
    id           SERIAL PRIMARY KEY,
    document_id  INTEGER NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    page_number  INTEGER,
    token_count  INTEGER,
    embedding    vector(1536) NOT NULL,
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX policy_chunks_document_idx ON policy_chunks(document_id);

-- Build after some rows exist for best recall; empty-table creation is valid for dev.
CREATE INDEX policy_chunks_embedding_idx ON policy_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE policy_chat_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    manager_email   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX policy_chat_messages_conversation_idx
    ON policy_chat_messages(conversation_id, created_at);

CREATE TABLE policy_query_log (
    id             SERIAL PRIMARY KEY,
    manager_email  TEXT NOT NULL,
    team           TEXT NOT NULL,
    question       TEXT NOT NULL,
    chunk_ids      INTEGER[] NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: managers see only their team's documents and chunks.
ALTER TABLE policy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_documents_team_select ON policy_documents
    FOR SELECT
    USING (team = current_setting('app.manager_team', true));

CREATE POLICY policy_documents_hr_select ON policy_documents
    FOR SELECT
    USING (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY policy_documents_hr_insert ON policy_documents
    FOR INSERT
    WITH CHECK (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY policy_documents_hr_update ON policy_documents
    FOR UPDATE
    USING (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY policy_documents_hr_delete ON policy_documents
    FOR DELETE
    USING (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY policy_chunks_team_select ON policy_chunks
    FOR SELECT
    USING (
        document_id IN (
            SELECT id FROM policy_documents
            WHERE team = current_setting('app.manager_team', true)
        )
    );

CREATE POLICY policy_chunks_hr_select ON policy_chunks
    FOR SELECT
    USING (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY policy_chunks_hr_insert ON policy_chunks
    FOR INSERT
    WITH CHECK (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY policy_chunks_hr_delete ON policy_chunks
    FOR DELETE
    USING (current_setting('app.is_hr_admin', true) = 'true');

-- Chat and audit: managers write/read own rows; HR admin reads all for support.
ALTER TABLE policy_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_chat_messages_owner ON policy_chat_messages
    FOR ALL
    USING (manager_email = current_setting('app.manager_email', true))
    WITH CHECK (manager_email = current_setting('app.manager_email', true));

CREATE POLICY policy_chat_messages_hr ON policy_chat_messages
    FOR SELECT
    USING (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY policy_query_log_insert ON policy_query_log
    FOR INSERT
    WITH CHECK (
        manager_email = current_setting('app.manager_email', true)
        AND team = current_setting('app.manager_team', true)
    );

CREATE POLICY policy_query_log_hr_insert ON policy_query_log
    FOR INSERT
    WITH CHECK (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY policy_query_log_team_select ON policy_query_log
    FOR SELECT
    USING (team = current_setting('app.manager_team', true));

CREATE POLICY policy_query_log_hr_select ON policy_query_log
    FOR SELECT
    USING (current_setting('app.is_hr_admin', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON policy_documents TO api_writer;
GRANT SELECT, INSERT, DELETE ON policy_chunks TO api_writer;
GRANT SELECT, INSERT ON policy_chat_messages TO api_writer;
GRANT SELECT, INSERT ON policy_query_log TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE policy_documents_id_seq TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE policy_chunks_id_seq TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE policy_chat_messages_id_seq TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE policy_query_log_id_seq TO api_writer;

GRANT SELECT ON teams TO api_writer;
