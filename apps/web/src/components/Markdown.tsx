import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders memo markdown (GFM tables + bold) with Tailwind Typography styling.
 * Table styling is tuned for the findings table the memo contains.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-h2:text-xl prose-h3:text-base prose-table:text-sm prose-th:text-left prose-td:align-top">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
