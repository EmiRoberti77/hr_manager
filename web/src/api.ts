// Thin client for the FastAPI backend. The X-Demo-User header is the mock
// auth — production would replace this with a real SSO session cookie.

// Empty base so all requests go through Vite's proxy (vite.config.ts).
// In production, replace with the actual API origin.
const API_BASE = '';

export interface ViewSpec {
  narrative: string;
  cube_query: Record<string, unknown>;
  view: {
    type: 'bar_chart' | 'line_chart' | 'pie_chart' | 'table' | 'stat' | 'map';
    x?: string;
    y?: string;
    series?: string;
    columns?: string[];
    lat_key?: string;
    lng_key?: string;
    label_key?: string;
  };
}

export interface ContextFrame {
  active_employee: string | null;
  active_team: string | null;
  date_range: string | null;
}

export interface ChatResponse {
  conversation_id: string;
  view_spec?: ViewSpec;
  data?: Record<string, unknown>[];
  frame: ContextFrame;
  error?: string;
}

export interface DemoUser {
  email: string;
  team: string;
}

function headers(demoUser: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Demo-User': demoUser,
  };
}

export async function listDemoUsers(): Promise<DemoUser[]> {
  const r = await fetch(`${API_BASE}/demo-users`);
  if (!r.ok) throw new Error(`demo-users: ${r.status}`);
  return r.json();
}

export async function chat(
  demoUser: string,
  conversationId: string | null,
  message: string,
  setActiveEmployee: string | null = null,
): Promise<ChatResponse> {
  const r = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: headers(demoUser),
    body: JSON.stringify({
      conversation_id: conversationId,
      message,
      set_active_employee: setActiveEmployee,
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`chat ${r.status}: ${text}`);
  }
  return r.json();
}

export async function resetFrame(demoUser: string, conversationId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/conversations/reset-frame`, {
    method: 'POST',
    headers: headers(demoUser),
    body: JSON.stringify({ conversation_id: conversationId }),
  });
  if (!r.ok) throw new Error(`reset-frame: ${r.status}`);
}
