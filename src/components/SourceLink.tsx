import { formatIsoDate, type Source } from "@/lib/rules";

export function SourceLink({ source }: { source: Source }) {
  return (
    <a className="source-link" href={source.url} target="_blank" rel="noopener noreferrer">
      {source.name}
      {source.publishedAt && ` (${formatIsoDate(source.publishedAt)})`}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only">(새 탭에서 열림)</span>
    </a>
  );
}
