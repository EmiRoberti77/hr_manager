import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoUser } from './api';
import {
  deleteDocument,
  listDocuments,
  policyChat,
  uploadDocument,
  type PolicyChatTurn,
  type PolicyDocument,
} from './policiesApi';

interface Props {
  demoUser: string;
  demoUsers: DemoUser[];
}

const TEAMS = ['Engineering', 'Sales', 'People'];
const CATEGORIES = [
  'general',
  'holiday',
  'expenses',
  'travel',
  'safety',
  'benefits',
  'conduct',
];

function statusBadgeClass(status: PolicyDocument['status']): string {
  switch (status) {
    case 'ready':
      return 'badge-ready';
    case 'processing':
      return 'badge-processing';
    case 'failed':
      return 'badge-failed';
  }
}

export function PoliciesPage({ demoUser, demoUsers }: Props) {
  const isHrAdmin = demoUsers.find((u) => u.email === demoUser)?.is_hr_admin ?? false;
  const currentTeam = demoUsers.find((u) => u.email === demoUser)?.team ?? '';

  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTeam, setUploadTeam] = useState('Engineering');
  const [uploadCategory, setUploadCategory] = useState('general');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [conversationId, setConversationId] = useState<string | undefined>();
  const [turns, setTurns] = useState<PolicyChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await listDocuments(demoUser);
      setDocuments(docs);
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
    const hasProcessing = documents.some((d) => d.status === 'processing');
    if (!hasProcessing) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [documents, load]);

  useEffect(() => {
    setConversationId(undefined);
    setTurns([]);
    setChatInput('');
  }, [demoUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, chatSending]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile || !uploadTitle.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('title', uploadTitle.trim());
      form.append('team', uploadTeam);
      form.append('category', uploadCategory);
      form.append('file', uploadFile);
      await uploadDocument(demoUser, form);
      setUploadTitle('');
      setUploadFile(null);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this policy document and all its indexed content?')) return;
    try {
      await deleteDocument(demoUser, id);
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message || chatSending) return;
    setChatInput('');
    setChatSending(true);
    setTurns((prev) => [...prev, { role: 'user', content: message }]);
    setError(null);
    try {
      const res = await policyChat(demoUser, {
        message,
        conversation_id: conversationId,
      });
      setConversationId(res.conversation_id);
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: res.answer, sources: res.sources },
      ]);
    } catch (err) {
      setError(String(err));
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setChatSending(false);
    }
  }

  return (
    <div className="policies-page">
      <header className="policies-header">
        <h1>Policy documents</h1>
        <p>
          Ask questions about HR policies for your team ({currentTeam}). Answers are grounded in
          uploaded PDFs with citations.
          {isHrAdmin && ' As HR admin you can upload PDFs per team.'}
        </p>
      </header>

      {error && (
        <div className="policies-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {loading && documents.length === 0 && <p className="policies-loading">Loading…</p>}

      <div className="policies-grid">
        <section className="policies-panel">
          <h2>Documents</h2>
          {documents.length === 0 && !loading && (
            <p className="muted">
              No policy documents yet
              {isHrAdmin ? ' — upload a PDF below.' : '.'}
            </p>
          )}
          <ul className="policy-doc-list">
            {documents.map((doc) => (
              <li key={doc.id} className="policy-doc-item">
                <div className="policy-doc-main">
                  <strong>{doc.title}</strong>
                  <span className="muted">
                    {doc.team} · {doc.category}
                  </span>
                  <span className={`badge ${statusBadgeClass(doc.status)}`}>{doc.status}</span>
                  {doc.status === 'failed' && doc.error_message && (
                    <span className="policy-doc-error">{doc.error_message}</span>
                  )}
                </div>
                {isHrAdmin && (
                  <button
                    type="button"
                    className="btn-link-danger"
                    onClick={() => handleDelete(doc.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>

          {isHrAdmin && (
            <form className="policies-form" onSubmit={handleUpload}>
              <h3>Upload PDF</h3>
              <input
                placeholder="Title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                required
              />
              <select value={uploadTeam} onChange={(e) => setUploadTeam(e.target.value)}>
                {TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                required
              />
              <button type="submit" disabled={saving || !uploadFile}>
                {saving ? 'Uploading…' : 'Upload & index'}
              </button>
            </form>
          )}
        </section>

        <section className="policies-panel policies-panel-chat">
          <h2>Ask about policies</h2>
          <div className="policy-chat-transcript">
            {turns.length === 0 && (
              <p className="muted">
                Try: &quot;What is the holiday entitlement?&quot; or &quot;What is the travel
                expense policy?&quot;
              </p>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={`policy-turn policy-turn-${turn.role}`}>
                <p>{turn.content}</p>
                {turn.sources && turn.sources.length > 0 && (
                  <details className="policy-sources">
                    <summary>Sources ({turn.sources.length})</summary>
                    <ul>
                      {turn.sources.map((s, j) => (
                        <li key={j}>
                          <strong>{s.document_title}</strong>
                          {s.page_number != null && ` — page ${s.page_number}`}
                          <p className="muted">{s.excerpt}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form className="policy-chat-form" onSubmit={handleChat}>
            <input
              placeholder="Ask a policy question…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatSending}
            />
            <button type="submit" disabled={chatSending || !chatInput.trim()}>
              {chatSending ? 'Thinking…' : 'Send'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
