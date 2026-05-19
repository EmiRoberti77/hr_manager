import { jsx as _jsx } from "react/jsx-runtime";
export function YouTubeEmbed({ videoId, title }) {
    return (_jsx("div", { className: "youtube-embed", children: _jsx("iframe", { src: `https://www.youtube.com/embed/${videoId}`, title: title ?? 'Training video', allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true }) }));
}
