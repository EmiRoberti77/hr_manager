import { useCallback, useEffect, useState } from 'react';
import type { DemoUser } from './api';
import {
  deleteExpense,
  listExpenses,
  submitExpense,
  updateExpense,
  uploadReceipt,
  type Expense,
  type LineItemInput,
} from './expensesApi';

interface Props {
  demoUser: string;
  demoUsers: DemoUser[];
}

const CATEGORIES = ['travel', 'meals', 'office', 'other'];

function statusClass(status: Expense['status']): string {
  switch (status) {
    case 'submitted':
      return 'badge-ready';
    case 'draft':
      return 'badge-processing';
    case 'processing':
      return 'badge-processing';
    case 'failed':
      return 'badge-failed';
  }
}

function canUpload(user: DemoUser | undefined): boolean {
  return user?.employee_id != null || user?.role === 'employee';
}

function formatAmount(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

function isOwnDraft(expense: Expense, employeeId: number | null | undefined): boolean {
  return expense.status === 'draft' && expense.employee_id === employeeId;
}

export function ExpensesPage({ demoUser, demoUsers }: Props) {
  const current = demoUsers.find((u) => u.email === demoUser);
  const employeeId = current?.employee_id;
  const isManagerView = current?.role === 'manager' || current?.role === 'hr_admin';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = expenses.find((e) => e.id === selectedId) ?? null;

  const [merchant, setMerchant] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [category, setCategory] = useState('other');
  const [total, setTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItemInput[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listExpenses(demoUser);
      setExpenses(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [demoUser]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const hasProcessing = expenses.some((e) => e.status === 'processing');
    if (!hasProcessing) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [expenses, load]);

  useEffect(() => {
    setSelectedId(null);
  }, [demoUser]);

  useEffect(() => {
    if (!selected || selected.status !== 'draft') return;
    setMerchant(selected.merchant ?? '');
    setExpenseDate(selected.expense_date ?? '');
    setCategory(selected.category);
    setTotal(selected.total_amount != null ? String(selected.total_amount) : '');
    setNotes(selected.notes ?? '');
    setLineItems(
      selected.line_items.map((li) => ({
        description: li.description,
        quantity: Number(li.quantity),
        unit_price: li.unit_price != null ? Number(li.unit_price) : null,
        amount: Number(li.amount),
      })),
    );
  }, [selected]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const created = await uploadReceipt(demoUser, file);
      await load();
      setSelectedId(created.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSaveDraft() {
    if (!selected || !isOwnDraft(selected, employeeId)) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateExpense(demoUser, selected.id, {
        merchant: merchant || null,
        expense_date: expenseDate || null,
        category,
        total_amount: total ? parseFloat(total) : undefined,
        notes: notes || null,
        line_items: lineItems,
      });
      setExpenses((prev) => prev.map((ex) => (ex.id === updated.id ? updated : ex)));
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!selected || !isOwnDraft(selected, employeeId)) return;
    setSaving(true);
    setError(null);
    try {
      await updateExpense(demoUser, selected.id, {
        merchant: merchant || null,
        expense_date: expenseDate || null,
        category,
        total_amount: total ? parseFloat(total) : undefined,
        notes: notes || null,
        line_items: lineItems,
      });
      const submitted = await submitExpense(demoUser, selected.id);
      setExpenses((prev) => prev.map((ex) => (ex.id === submitted.id ? submitted : ex)));
      setSelectedId(submitted.id);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this expense?')) return;
    try {
      await deleteExpense(demoUser, id);
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  function updateLineItem(index: number, field: keyof LineItemInput, value: string) {
    setLineItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === 'description') item.description = value;
      else if (field === 'quantity') item.quantity = parseFloat(value) || 1;
      else if (field === 'amount') item.amount = parseFloat(value) || 0;
      else if (field === 'unit_price') item.unit_price = value ? parseFloat(value) : null;
      next[index] = item;
      return next;
    });
  }

  return (
    <div className="expenses-page">
      <header className="expenses-header">
        <h1>Expenses</h1>
        <p>
          {canUpload(current)
            ? 'Photograph a receipt to extract line items, review, and submit.'
            : isManagerView
              ? 'View team expense submissions (read-only).'
              : 'Sign in with an employee account to submit expenses.'}
        </p>
      </header>

      {error && (
        <div className="expenses-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {canUpload(current) && (
        <div className="expenses-upload-bar">
          <label className="expenses-upload-btn">
            {uploading ? 'Uploading…' : 'Upload receipt'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUpload}
              disabled={uploading}
              hidden
            />
          </label>
        </div>
      )}

      {loading && expenses.length === 0 && <p className="expenses-loading">Loading…</p>}

      <div className="expenses-grid">
        <section className="expenses-panel">
          <h2>{isManagerView ? 'Team expenses' : 'My expenses'}</h2>
          {expenses.length === 0 && !loading && (
            <p className="muted">No expenses yet.</p>
          )}
          <ul className="expense-list">
            {expenses.map((ex) => (
              <li key={ex.id}>
                <button
                  type="button"
                  className={selectedId === ex.id ? 'expense-item active' : 'expense-item'}
                  onClick={() => setSelectedId(ex.id)}
                >
                  <strong>{ex.merchant || ex.receipt_filename}</strong>
                  <span className="muted">
                    {ex.employee_name} · {ex.expense_date ?? '—'}
                  </span>
                  <span className="expense-meta">
                    {ex.currency} {formatAmount(ex.total_amount)}{' '}
                    <span className={`badge ${statusClass(ex.status)}`}>{ex.status}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="expenses-panel expenses-panel-detail">
          {!selected && <p className="muted">Select an expense to view details.</p>}

          {selected && selected.status === 'processing' && (
            <p className="muted">Extracting receipt data…</p>
          )}

          {selected && selected.status === 'failed' && selected.employee_id === employeeId && (
            <div>
              <p className="expenses-failed">Extraction failed: {selected.error_message}</p>
              <button type="button" className="btn-danger" onClick={() => handleDelete(selected.id)}>
                Delete
              </button>
            </div>
          )}

          {selected && selected.status === 'submitted' && (
            <div className="expense-detail">
              <h2>{selected.merchant ?? 'Expense'}</h2>
              <p className="muted">
                {selected.employee_name} · {selected.expense_date} · {selected.category}
              </p>
              <p className="expense-total">
                {selected.currency} {formatAmount(selected.total_amount)}
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.line_items.map((li) => (
                    <tr key={li.id}>
                      <td>{li.description}</td>
                      <td>{li.quantity}</td>
                      <td>{formatAmount(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selected && isOwnDraft(selected, employeeId) && (
            <form
              className="expenses-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <h2>Review expense</h2>
              <label>
                Merchant
                <input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </label>
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Total ({selected.currency})
                <input
                  type="number"
                  step="0.01"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  required
                />
              </label>
              <h3>Line items</h3>
              {lineItems.map((li, i) => (
                <div key={i} className="line-item-row">
                  <input
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Qty"
                    value={li.quantity}
                    onChange={(e) => updateLineItem(i, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={li.amount}
                    onChange={(e) => updateLineItem(i, 'amount', e.target.value)}
                  />
                </div>
              ))}
              <label>
                Notes
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </label>
              <div className="expenses-actions">
                <button type="button" onClick={handleSaveDraft} disabled={saving}>
                  Save draft
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? 'Submitting…' : 'Confirm & submit'}
                </button>
                <button
                  type="button"
                  className="btn-link-danger"
                  onClick={() => handleDelete(selected.id)}
                >
                  Delete
                </button>
              </div>
            </form>
          )}

          {selected &&
            selected.status === 'draft' &&
            selected.employee_id !== employeeId &&
            isManagerView && (
              <p className="muted">Draft expense — awaiting employee submission.</p>
            )}
        </section>
      </div>
    </div>
  );
}
