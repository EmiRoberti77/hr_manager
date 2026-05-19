import { useEffect, useState } from 'react';
import {
  chat,
  resetFrame,
  type ChatResponse,
  type ContextFrame,
  type ViewSpec,
} from './api';
import { Chat } from './Chat';
import { ViewRenderer } from './ViewRenderer';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  demoUser: string;
}

export function App({ demoUser }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [frame, setFrame] = useState<ContextFrame | null>(null);
  const [viewSpec, setViewSpec] = useState<ViewSpec | null>(null);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);

  // Switching demo users resets the chat so we don't leak one manager's
  // conversation into another's scope.
  useEffect(() => {
    setConversationId(null);
    setFrame(null);
    setViewSpec(null);
    setData([]);
    setTurns([]);
  }, [demoUser]);

  async function send(message: string, setActiveEmployee: string | null = null) {
    if (!demoUser) return;
    setSending(true);
    setTurns((t) => [...t, { role: 'user', text: message }]);
    try {
      const resp: ChatResponse = await chat(demoUser, conversationId, message, setActiveEmployee);
      setConversationId(resp.conversation_id);
      setFrame(resp.frame);
      if (resp.view_spec) {
        setViewSpec(resp.view_spec);
        setData(resp.data ?? []);
        setTurns((t) => [...t, { role: 'assistant', text: resp.view_spec!.narrative }]);
      } else if (resp.error) {
        setTurns((t) => [...t, { role: 'assistant', text: `Error: ${resp.error}` }]);
      }
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', text: `Request failed: ${String(e)}` }]);
    } finally {
      setSending(false);
    }
  }

  function handleRowClick(row: Record<string, unknown>) {
    const nameKey = Object.keys(row).find((k) => k.endsWith('.full_name') || k === 'full_name');
    if (!nameKey) return;
    const name = String(row[nameKey]);
    send(`Tell me more about ${name} — role and holiday days taken this year.`, name);
  }

  async function handleResetFrame() {
    if (!conversationId || !demoUser) return;
    await resetFrame(demoUser, conversationId);
    setFrame({ active_employee: null, active_team: null, date_range: frame?.date_range ?? '2026' });
    setViewSpec(null);
    setData([]);
  }

  return (
    <div className="app">
      <Chat
        frame={frame}
        onResetFrame={handleResetFrame}
        turns={turns}
        sending={sending}
        onSend={(m) => send(m)}
      />
      <main className="main">
        {viewSpec ? (
          <ViewRenderer spec={viewSpec} data={data} onRowClick={handleRowClick} />
        ) : (
          <div className="empty">
            <h2 style={{ color: '#374151' }}>Ask a question to get started</h2>
            <p>Try “Show me the holiday schedule for my team.”</p>
          </div>
        )}
      </main>
    </div>
  );
}
