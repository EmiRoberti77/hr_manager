// Policy document RAG API client.

const API_BASE = '';

export interface PolicyDocument {
  id: number;
  title: string;
  filename: string;
  team: string;
  category: string;
  uploaded_by_email: string;
  uploaded_at: string;
  status: 'processing' | 'ready' | 'failed';
  page_count: number | null;
  error_message: string | null;
}

export interface PolicySource {
  document_id: number;
  document_title: string;
  page_number: number | null;
  excerpt: string;
  similarity: number;
}

export interface PolicyChatResponse {
  conversation_id: string;
  answer: string;
  sources: PolicySource[];
}

export interface PolicyChatTurn {
  role: 'user' | 'assistant';
  content: string;
  sources?: PolicySource[];
}

function jsonHeaders(demoUser: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Demo-User': demoUser,
  };
}

function authHeaders(demoUser: string): HeadersInit {
  return { 'X-Demo-User': demoUser };
}

async function request<T>(
  demoUser: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...jsonHeaders(demoUser), ...init?.headers },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${path}: ${r.status} ${text}`);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

export function listDocuments(demoUser: string): Promise<PolicyDocument[]> {
  return request(demoUser, '/policies/documents');
}

export function uploadDocument(
  demoUser: string,
  form: FormData,
): Promise<PolicyDocument> {
  return fetch(`${API_BASE}/policies/documents`, {
    method: 'POST',
    headers: authHeaders(demoUser),
    body: form,
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`/policies/documents: ${r.status} ${text}`);
    }
    return r.json();
  });
}

export function deleteDocument(demoUser: string, documentId: number): Promise<void> {
  return request(demoUser, `/policies/documents/${documentId}`, { method: 'DELETE' });
}

export function policyChat(
  demoUser: string,
  body: { message: string; conversation_id?: string },
): Promise<PolicyChatResponse> {
  return request(demoUser, '/policies/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
