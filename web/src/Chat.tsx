// Chat sidebar — demo-user picker, context frame, transcript, prompt input.
// "Drill down" is implemented in App.tsx via the onRowClick callback on the
// rendered view; clicking a name sets active_employee in the frame.

import { useEffect, useRef, useState } from 'react';
import type { ContextFrame } from './api';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  frame: ContextFrame | null;
  onResetFrame: () => void;
  turns: Turn[];
  sending: boolean;
  onSend: (msg: string) => void;
}

const SUGGESTIONS = [
  'Show me the holiday schedule for my team',
  'What is my team headcount?',
  'Compare holiday days taken across people in 2025',
  'List everyone who joined this year',
];

export function Chat({
  frame,
  onResetFrame,
  turns,
  sending,
  onSend,
}: Props) {
  const [draft, setDraft] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns]);

  function submit() {
    const m = draft.trim();
    if (!m || sending) return;
    setDraft('');
    onSend(m);
  }

  return (
    <aside className="sidebar">
      <header>
        <h1>HR analytics</h1>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Ask about headcount, holidays, joiners, individuals.
        </div>
      </header>

      <div className="context-frame">
        <h2>Context frame</h2>
        <dl>
          <dt>Employee</dt>
          <dd>{frame?.active_employee ?? '—'}</dd>
          <dt>Team</dt>
          <dd>{frame?.active_team ?? '—'}</dd>
          <dt>Date range</dt>
          <dd>{frame?.date_range ?? '—'}</dd>
        </dl>
        <button onClick={onResetFrame}>Reset frame</button>
      </div>

      <div className="transcript" ref={transcriptRef}>
        {turns.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>
            No messages yet. Try one of the suggestions below.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`turn ${t.role}`}>
            {t.role === 'user' ? '› ' : ''}
            {t.text}
          </div>
        ))}
        {sending && <div className="turn assistant">…thinking</div>}
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} disabled={sending} onClick={() => onSend(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="composer">
        <input
          value={draft}
          placeholder="Ask anything about your team…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          disabled={sending}
        />
        <button onClick={submit} disabled={sending || !draft.trim()}>
          Send
        </button>
      </div>
    </aside>
  );
}
