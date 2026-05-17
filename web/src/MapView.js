import { jsx as _jsx } from "react/jsx-runtime";
// Renders a Leaflet map for `map` view specs.
// Pins are placed at (lat_key, lng_key) from each data row; pin popups show
// the label_key value plus any other fields in the row.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
// Leaflet's default icon paths break under Vite's asset hashing. Point them
// at the CDN copies instead.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
function prettify(col) {
    const last = col.split('.').pop() ?? col;
    return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
export function MapView({ data, latKey, lngKey, labelKey, onPinClick }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    useEffect(() => {
        if (!containerRef.current)
            return;
        // Destroy any previous map instance (React strict-mode double-mount).
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }
        const map = L.map(containerRef.current).setView([51.5, -1.5], 5);
        mapRef.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18,
        }).addTo(map);
        const points = [];
        for (const row of data) {
            const lat = parseFloat(String(row[latKey] ?? ''));
            const lng = parseFloat(String(row[lngKey] ?? ''));
            if (isNaN(lat) || isNaN(lng))
                continue;
            const label = String(row[labelKey] ?? '');
            // Build a popup showing all fields.
            const popupHtml = [
                `<strong>${label}</strong>`,
                ...Object.entries(row)
                    .filter(([k]) => k !== latKey && k !== lngKey)
                    .map(([k, v]) => `<span style="color:#6b7280">${prettify(k)}:</span> ${v ?? '—'}`),
            ].join('<br/>');
            const marker = L.marker([lat, lng]).addTo(map);
            marker.bindPopup(popupHtml);
            if (onPinClick) {
                marker.on('click', () => onPinClick(row));
            }
            points.push(L.latLng(lat, lng));
        }
        // Fit the map to show all pins.
        if (points.length > 0) {
            map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
        }
        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, [data, latKey, lngKey, labelKey, onPinClick]);
    return _jsx("div", { ref: containerRef, style: { height: 480, width: '100%', borderRadius: 8 } });
}
