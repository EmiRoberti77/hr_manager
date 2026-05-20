import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { deleteExpense, listExpenses, submitExpense, updateExpense, uploadReceipt, } from './expensesApi';
const CATEGORIES = ['travel', 'meals', 'office', 'other'];
function statusClass(status) {
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
function canUpload(user) {
    return user?.employee_id != null || user?.role === 'employee';
}
function formatAmount(value) {
    if (value == null || value === '')
        return '—';
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '—';
}
function isOwnDraft(expense, employeeId) {
    return expense.status === 'draft' && expense.employee_id === employeeId;
}
export function ExpensesPage({ demoUser, demoUsers }) {
    const current = demoUsers.find((u) => u.email === demoUser);
    const employeeId = current?.employee_id;
    const isManagerView = current?.role === 'manager' || current?.role === 'hr_admin';
    const [expenses, setExpenses] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const selected = expenses.find((e) => e.id === selectedId) ?? null;
    const [merchant, setMerchant] = useState('');
    const [expenseDate, setExpenseDate] = useState('');
    const [category, setCategory] = useState('other');
    const [total, setTotal] = useState('');
    const [notes, setNotes] = useState('');
    const [lineItems, setLineItems] = useState([]);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await listExpenses(demoUser);
            setExpenses(list);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setLoading(false);
        }
    }, [demoUser]);
    useEffect(() => {
        load();
    }, [load]);
    useEffect(() => {
        const hasProcessing = expenses.some((e) => e.status === 'processing');
        if (!hasProcessing)
            return;
        const timer = setInterval(load, 3000);
        return () => clearInterval(timer);
    }, [expenses, load]);
    useEffect(() => {
        setSelectedId(null);
    }, [demoUser]);
    useEffect(() => {
        if (!selected || selected.status !== 'draft')
            return;
        setMerchant(selected.merchant ?? '');
        setExpenseDate(selected.expense_date ?? '');
        setCategory(selected.category);
        setTotal(selected.total_amount != null ? String(selected.total_amount) : '');
        setNotes(selected.notes ?? '');
        setLineItems(selected.line_items.map((li) => ({
            description: li.description,
            quantity: Number(li.quantity),
            unit_price: li.unit_price != null ? Number(li.unit_price) : null,
            amount: Number(li.amount),
        })));
    }, [selected]);
    async function handleUpload(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setUploading(true);
        setError(null);
        try {
            const created = await uploadReceipt(demoUser, file);
            await load();
            setSelectedId(created.id);
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setUploading(false);
            e.target.value = '';
        }
    }
    async function handleSaveDraft() {
        if (!selected || !isOwnDraft(selected, employeeId))
            return;
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
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setSaving(false);
        }
    }
    async function handleSubmit() {
        if (!selected || !isOwnDraft(selected, employeeId))
            return;
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
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setSaving(false);
        }
    }
    async function handleDelete(id) {
        if (!confirm('Delete this expense?'))
            return;
        try {
            await deleteExpense(demoUser, id);
            if (selectedId === id)
                setSelectedId(null);
            await load();
        }
        catch (err) {
            setError(String(err));
        }
    }
    function updateLineItem(index, field, value) {
        setLineItems((prev) => {
            const next = [...prev];
            const item = { ...next[index] };
            if (field === 'description')
                item.description = value;
            else if (field === 'quantity')
                item.quantity = parseFloat(value) || 1;
            else if (field === 'amount')
                item.amount = parseFloat(value) || 0;
            else if (field === 'unit_price')
                item.unit_price = value ? parseFloat(value) : null;
            next[index] = item;
            return next;
        });
    }
    return (_jsxs("div", { className: "expenses-page", children: [_jsxs("header", { className: "expenses-header", children: [_jsx("h1", { children: "Expenses" }), _jsx("p", { children: canUpload(current)
                            ? 'Photograph a receipt to extract line items, review, and submit.'
                            : isManagerView
                                ? 'View team expense submissions (read-only).'
                                : 'Sign in with an employee account to submit expenses.' })] }), error && (_jsxs("div", { className: "expenses-error", role: "alert", children: [error, _jsx("button", { type: "button", onClick: () => setError(null), children: "Dismiss" })] })), canUpload(current) && (_jsx("div", { className: "expenses-upload-bar", children: _jsxs("label", { className: "expenses-upload-btn", children: [uploading ? 'Uploading…' : 'Upload receipt', _jsx("input", { type: "file", accept: "image/*", capture: "environment", onChange: handleUpload, disabled: uploading, hidden: true })] }) })), loading && expenses.length === 0 && _jsx("p", { className: "expenses-loading", children: "Loading\u2026" }), _jsxs("div", { className: "expenses-grid", children: [_jsxs("section", { className: "expenses-panel", children: [_jsx("h2", { children: isManagerView ? 'Team expenses' : 'My expenses' }), expenses.length === 0 && !loading && (_jsx("p", { className: "muted", children: "No expenses yet." })), _jsx("ul", { className: "expense-list", children: expenses.map((ex) => (_jsx("li", { children: _jsxs("button", { type: "button", className: selectedId === ex.id ? 'expense-item active' : 'expense-item', onClick: () => setSelectedId(ex.id), children: [_jsx("strong", { children: ex.merchant || ex.receipt_filename }), _jsxs("span", { className: "muted", children: [ex.employee_name, " \u00B7 ", ex.expense_date ?? '—'] }), _jsxs("span", { className: "expense-meta", children: [ex.currency, " ", formatAmount(ex.total_amount), ' ', _jsx("span", { className: `badge ${statusClass(ex.status)}`, children: ex.status })] })] }) }, ex.id))) })] }), _jsxs("section", { className: "expenses-panel expenses-panel-detail", children: [!selected && _jsx("p", { className: "muted", children: "Select an expense to view details." }), selected && selected.status === 'processing' && (_jsx("p", { className: "muted", children: "Extracting receipt data\u2026" })), selected && selected.status === 'failed' && selected.employee_id === employeeId && (_jsxs("div", { children: [_jsxs("p", { className: "expenses-failed", children: ["Extraction failed: ", selected.error_message] }), _jsx("button", { type: "button", className: "btn-danger", onClick: () => handleDelete(selected.id), children: "Delete" })] })), selected && selected.status === 'submitted' && (_jsxs("div", { className: "expense-detail", children: [_jsx("h2", { children: selected.merchant ?? 'Expense' }), _jsxs("p", { className: "muted", children: [selected.employee_name, " \u00B7 ", selected.expense_date, " \u00B7 ", selected.category] }), _jsxs("p", { className: "expense-total", children: [selected.currency, " ", formatAmount(selected.total_amount)] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Item" }), _jsx("th", { children: "Qty" }), _jsx("th", { children: "Amount" })] }) }), _jsx("tbody", { children: selected.line_items.map((li) => (_jsxs("tr", { children: [_jsx("td", { children: li.description }), _jsx("td", { children: li.quantity }), _jsx("td", { children: formatAmount(li.amount) })] }, li.id))) })] })] })), selected && isOwnDraft(selected, employeeId) && (_jsxs("form", { className: "expenses-form", onSubmit: (e) => {
                                    e.preventDefault();
                                    handleSubmit();
                                }, children: [_jsx("h2", { children: "Review expense" }), _jsxs("label", { children: ["Merchant", _jsx("input", { value: merchant, onChange: (e) => setMerchant(e.target.value) })] }), _jsxs("label", { children: ["Date", _jsx("input", { type: "date", value: expenseDate, onChange: (e) => setExpenseDate(e.target.value) })] }), _jsxs("label", { children: ["Category", _jsx("select", { value: category, onChange: (e) => setCategory(e.target.value), children: CATEGORIES.map((c) => (_jsx("option", { value: c, children: c }, c))) })] }), _jsxs("label", { children: ["Total (", selected.currency, ")", _jsx("input", { type: "number", step: "0.01", value: total, onChange: (e) => setTotal(e.target.value), required: true })] }), _jsx("h3", { children: "Line items" }), lineItems.map((li, i) => (_jsxs("div", { className: "line-item-row", children: [_jsx("input", { placeholder: "Description", value: li.description, onChange: (e) => updateLineItem(i, 'description', e.target.value) }), _jsx("input", { type: "number", step: "0.01", placeholder: "Qty", value: li.quantity, onChange: (e) => updateLineItem(i, 'quantity', e.target.value) }), _jsx("input", { type: "number", step: "0.01", placeholder: "Amount", value: li.amount, onChange: (e) => updateLineItem(i, 'amount', e.target.value) })] }, i))), _jsxs("label", { children: ["Notes", _jsx("textarea", { value: notes, onChange: (e) => setNotes(e.target.value), rows: 2 })] }), _jsxs("div", { className: "expenses-actions", children: [_jsx("button", { type: "button", onClick: handleSaveDraft, disabled: saving, children: "Save draft" }), _jsx("button", { type: "submit", disabled: saving, children: saving ? 'Submitting…' : 'Confirm & submit' }), _jsx("button", { type: "button", className: "btn-link-danger", onClick: () => handleDelete(selected.id), children: "Delete" })] })] })), selected &&
                                selected.status === 'draft' &&
                                selected.employee_id !== employeeId &&
                                isManagerView && (_jsx("p", { className: "muted", children: "Draft expense \u2014 awaiting employee submission." }))] })] })] }));
}
