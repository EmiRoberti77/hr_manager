import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Maps a view spec to a concrete React component. The agent emits a spec; this
// file is the only place that knows about Recharts or TanStack Table. If the
// agent invents a `view.type` we don't recognise, we degrade to a JSON dump
// rather than crash.
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from 'recharts';
import { MapView } from './MapView';
const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'];
function getFullNameKey(row) {
    // Cube returns columns prefixed with the view name, e.g. "manager_analytics.full_name".
    for (const k of Object.keys(row)) {
        if (k.endsWith('.full_name') || k === 'full_name')
            return k;
    }
    return null;
}
export function ViewRenderer({ spec, data, onRowClick }) {
    const { view, narrative } = spec;
    if (!data || data.length === 0) {
        return (_jsxs("div", { className: "view-card", children: [_jsx("div", { className: "narrative", children: narrative }), _jsx("div", { className: "empty", children: "No data for this query." })] }));
    }
    return (_jsxs("div", { className: "view-card", children: [_jsx("div", { className: "narrative", children: narrative }), renderView()] }));
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
                return _jsx("pre", { children: JSON.stringify(data, null, 2) });
        }
    }
    function renderStat() {
        const y = view.y;
        const value = y ? data[0]?.[y] : Object.values(data[0] ?? {})[0];
        return (_jsxs("div", { style: { textAlign: 'center', padding: 20 }, children: [_jsx("div", { className: "stat-value", children: value ?? '—' }), _jsx("div", { className: "stat-label", children: y ?? '' })] }));
    }
    function renderBar() {
        const x = view.x ?? Object.keys(data[0])[0];
        const y = view.y ?? Object.keys(data[0])[1];
        return (_jsx(ResponsiveContainer, { width: "100%", height: 360, children: _jsxs(BarChart, { data: data, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: x, tick: { fontSize: 12 }, angle: -30, textAnchor: "end", height: 80 }), _jsx(YAxis, { tick: { fontSize: 12 } }), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: y, fill: "#6366f1" })] }) }));
    }
    function renderLine() {
        const x = view.x ?? Object.keys(data[0])[0];
        const y = view.y ?? Object.keys(data[0])[1];
        return (_jsx(ResponsiveContainer, { width: "100%", height: 360, children: _jsxs(LineChart, { data: data, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: x, tick: { fontSize: 12 } }), _jsx(YAxis, { tick: { fontSize: 12 } }), _jsx(Tooltip, {}), _jsx(Legend, {}), _jsx(Line, { type: "monotone", dataKey: y, stroke: "#6366f1", strokeWidth: 2 })] }) }));
    }
    function renderPie() {
        const x = view.x ?? Object.keys(data[0])[0];
        const y = view.y ?? Object.keys(data[0])[1];
        return (_jsx(ResponsiveContainer, { width: "100%", height: 360, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: data, dataKey: y, nameKey: x, outerRadius: 120, label: true, children: data.map((_, i) => (_jsx(Cell, { fill: PIE_COLORS[i % PIE_COLORS.length] }, i))) }), _jsx(Tooltip, {}), _jsx(Legend, {})] }) }));
    }
    function renderMap() {
        const latKey = view.lat_key ?? 'manager_analytics.latitude';
        const lngKey = view.lng_key ?? 'manager_analytics.longitude';
        const labelKey = view.label_key ?? getFullNameKey(data[0]) ?? Object.keys(data[0])[0];
        const nameKey = getFullNameKey(data[0]);
        return (_jsx(MapView, { data: data, latKey: latKey, lngKey: lngKey, labelKey: labelKey, onPinClick: nameKey && onRowClick ? onRowClick : undefined }));
    }
    function renderTable() {
        const columns = view.columns ?? Object.keys(data[0]);
        const nameKey = getFullNameKey(data[0]);
        return (_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsx("tr", { children: columns.map((c) => (_jsx("th", { children: prettify(c) }, c))) }) }), _jsx("tbody", { children: data.map((row, i) => {
                        const clickable = !!nameKey && !!onRowClick;
                        return (_jsx("tr", { className: clickable ? 'clickable' : undefined, onClick: clickable ? () => onRowClick(row) : undefined, children: columns.map((c) => (_jsx("td", { children: String(row[c] ?? '') }, c))) }, i));
                    }) })] }));
    }
}
function prettify(col) {
    // "manager_analytics.full_name" → "Full Name"
    const last = col.split('.').pop() ?? col;
    return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
