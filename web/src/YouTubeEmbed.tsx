interface Props {
  videoId: string;
  title?: string;
}

export function YouTubeEmbed({ videoId, title }: Props) {
  return (
    <div className="youtube-embed">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title ?? 'Training video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
