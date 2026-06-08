"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { CodeBlock } from "@agenthub/ui";

interface MarkdownRendererProps {
  content: string;
}

export const MARKDOWN_COMPONENTS: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? "");
    if (match) {
      return <CodeBlock code={String(children).replace(/\n$/, "")} language={match[1]!} />;
    }
    return (
      <code
        className="inline-code"
        {...props}
      >
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="markdown-table-wrapper">
        <table className="markdown-table">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="markdown-th">{children}</th>;
  },
  td({ children }) {
    return <td className="markdown-td">{children}</td>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-render">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
