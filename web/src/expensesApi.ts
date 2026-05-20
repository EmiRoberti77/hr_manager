// Employee expenses API client.

const API_BASE = '';

export interface ExpenseLineItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number | null;
  amount: number;
  position: number;
}

export interface Expense {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_team: string;
  status: 'processing' | 'draft' | 'submitted' | 'failed';
  merchant: string | null;
  expense_date: string | null;
  currency: string;
  total_amount: number | null;
  category: string;
  receipt_filename: string;
  error_message: string | null;
  notes: string | null;
  created_at: string;
  submitted_at: string | null;
  line_items: ExpenseLineItem[];
}

export interface LineItemInput {
  description: string;
  quantity: number;
  unit_price?: number | null;
  amount: number;
}

function authHeaders(demoUser: string): HeadersInit {
  return { 'X-Demo-User': demoUser };
}

function jsonHeaders(demoUser: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Demo-User': demoUser,
  };
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

export function listExpenses(demoUser: string): Promise<Expense[]> {
  return request(demoUser, '/expenses');
}

export function getExpense(demoUser: string, expenseId: number): Promise<Expense> {
  return request(demoUser, `/expenses/${expenseId}`);
}

export function uploadReceipt(demoUser: string, file: File): Promise<Expense> {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${API_BASE}/expenses/receipts`, {
    method: 'POST',
    headers: authHeaders(demoUser),
    body: form,
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`/expenses/receipts: ${r.status} ${text}`);
    }
    return r.json();
  });
}

export function updateExpense(
  demoUser: string,
  expenseId: number,
  body: {
    merchant?: string | null;
    expense_date?: string | null;
    currency?: string;
    total_amount?: number;
    category?: string;
    notes?: string | null;
    line_items?: LineItemInput[];
  },
): Promise<Expense> {
  return request(demoUser, `/expenses/${expenseId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function submitExpense(demoUser: string, expenseId: number): Promise<Expense> {
  return request(demoUser, `/expenses/${expenseId}/submit`, { method: 'POST' });
}

export function deleteExpense(demoUser: string, expenseId: number): Promise<void> {
  return request(demoUser, `/expenses/${expenseId}`, { method: 'DELETE' });
}
