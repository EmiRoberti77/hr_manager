// Maps a view spec to a concrete React component. The agent emits a spec; this
// file is the only place that knows about Recharts or TanStack Table. If the
// agent invents a `view.type` we don't recognise, we degrade to a JSON dump
// rather than crash.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ViewSpec } from './api';
import { MapView } from './MapView';

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'];

interface Props {
  spec: ViewSpec;
  data: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
}

function getFullNameKey(row: Record<string, unknown>): string | null {
  // Cube returns columns prefixed with the view name, e.g. "manager_analytics.full_name".
  for (const k of Object.keys(row)) {
    if (k.endsWith('.full_name') || k === 'full_name') return k;
  }
  return null;
}

export function ViewRenderer({ spec, data, onRowClick }: Props) {
  const { view, narrative } = spec;

  if (!data || data.length === 0) {
    return (
      <div className="view-card">
        <div className="narrative">{narrative}</div>
        <div className="empty">No data for this query.</div>
      </div>
    );
  }

  return (
    <div className="view-card">
      <div className="narrative">{narrative}</div>
      {renderView()}
    </div>
  );

  function renderView() {
    switch (view.type) {
      case 'stat':
        return renderStat();
      case 'bar_chart':
        return renderBar();
      case 'line_chart':
        return renderLine();
      case 'pie_chart':
        return renderPie();
      case 'table':
        return renderTable();
      case 'map':
        return renderMap();
      default:
        return <pre>{JSON.stringify(data, null, 2)}</pre>;
    }
  }

  function renderStat() {
    const y = view.y;
    const raw = y ? data[0]?.[y] : Object.values(data[0] ?? {})[0];
    const value =
      typeof raw === 'string' || typeof raw === 'number' ? raw : undefined;
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <div className="stat-value">{value ?? '—'}</div>
        <div className="stat-label">{y ?? ''}</div>
      </div>
    );
  }

  function renderBar() {
    const x = view.x ?? Object.keys(data[0])[0];
    const y = view.y ?? Object.keys(data[0])[1];
    return (
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={x} tick={{ fontSize: 12 }} angle={-30} textAnchor="end" height={80} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey={y} fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  function renderLine() {
    const x = view.x ?? Object.keys(data[0])[0];
    const y = view.y ?? Object.keys(data[0])[1];
    return (
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={x} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey={y} stroke="#6366f1" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  function renderPie() {
    const x = view.x ?? Object.keys(data[0])[0];
    const y = view.y ?? Object.keys(data[0])[1];
    return (
      <ResponsiveContainer width="100%" height={360}>
        <PieChart>
          <Pie data={data} dataKey={y} nameKey={x} outerRadius={120} label>
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  function renderMap() {
    const latKey = view.lat_key ?? 'manager_analytics.latitude';
    const lngKey = view.lng_key ?? 'manager_analytics.longitude';
    const labelKey = view.label_key ?? getFullNameKey(data[0]) ?? Object.keys(data[0])[0];
    const nameKey = getFullNameKey(data[0]);
    return (
      <MapView
        data={data}
        latKey={latKey}
        lngKey={lngKey}
        labelKey={labelKey}
        onPinClick={nameKey && onRowClick ? onRowClick : undefined}
      />
    );
  }

  function renderTable() {
    const columns = view.columns ?? Object.keys(data[0]);
    const nameKey = getFullNameKey(data[0]);
    return (
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{prettify(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const clickable = !!nameKey && !!onRowClick;
            return (
              <tr
                key={i}
                className={clickable ? 'clickable' : undefined}
                onClick={clickable ? () => onRowClick!(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c}>{String(row[c] ?? '')}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
}

function prettify(col: string): string {
  // "manager_analytics.full_name" → "Full Name"
  const last = col.split('.').pop() ?? col;
  return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
