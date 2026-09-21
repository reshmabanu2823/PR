'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, PanelRight } from 'lucide-react';
import MermaidDiagram from './MermaidDiagram';

interface MarkdownRendererProps {
  content: string;
  onOpenArtifact?: (title: string, content: string, language?: string) => void;
}

export default function MarkdownRenderer({ content, onOpenArtifact }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-3 last:mb-0 text-[0.9375rem] leading-[1.75]">{children}</p>
        ),

        // Headings
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mt-6 mb-3 text-foreground">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold mt-5 mb-2 text-foreground">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold mt-4 mb-2 text-foreground">{children}</h3>
        ),

        // Lists
        ul: ({ children }) => (
          <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-[0.9375rem] leading-[1.75]">{children}</li>
        ),

        // Strong / em
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-foreground/90">{children}</em>
        ),

        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="border-l-[3px] border-border pl-4 my-3 text-muted-foreground italic">
            {children}
          </blockquote>
        ),

        // Horizontal rule
        hr: () => <hr className="border-border my-4" />,

        // Links & Document Downloads
        a: ({ href, children }) => {
          const text = extractText(children);
          const raw = href || text || '';
          const isDoc = /\.(docx|pdf|xlsx|csv|pptx)$/i.test(raw.trim());
          let targetUrl = href || '#';
          if (isDoc) {
            const cleanName = raw.trim().split('/').pop() || raw.trim();
            targetUrl = `/api/documents/download/${encodeURIComponent(cleanName)}`;
          }
          return (
            <a
              href={targetUrl}
              download={isDoc ? true : undefined}
              target={isDoc ? '_self' : '_blank'}
              rel="noopener noreferrer"
              className={
                isDoc
                  ? "inline-flex items-center gap-1.5 px-3 py-1 my-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium text-xs border border-primary/30 transition-all active:scale-95 no-underline font-mono"
                  : "text-primary underline underline-offset-[3px] hover:text-primary/80 transition-colors duration-150"
              }
            >
              {children}
            </a>
          );
        },

        // Images & Media
        img: ({ src, alt }) => {
          const rawSrc = src || '';
          const proxiedSrc = rawSrc.startsWith('http://') || rawSrc.startsWith('https://')
            ? `/api/image-proxy?url=${encodeURIComponent(rawSrc)}`
            : rawSrc;

          return (
            <span className="block my-3 rounded-xl overflow-hidden border border-border/50 bg-card/60 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxiedSrc}
                alt={alt || 'Generated image'}
                className="w-full max-h-[520px] object-contain rounded-lg mx-auto bg-black/20"
                loading="eager"
                onError={(e) => {
                  const target = e.currentTarget;
                  // If proxied failed, try direct src or vice-versa
                  if (rawSrc && target.src.includes('/api/image-proxy')) {
                    target.src = rawSrc;
                  }
                }}
              />
              {alt && (
                <span className="block text-xs text-muted-foreground px-3.5 py-2 border-t border-border/30 bg-muted/20 font-mono">
                  {alt}
                </span>
              )}
            </span>
          );
        },

        // Inline code
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-');
          if (isBlock) {
            return <code className={`${className} bg-transparent`}>{children}</code>;
          }
          return (
            <code className="bg-transparent text-primary px-0.5 py-0 text-[0.875em] font-mono font-medium">
              {children}
            </code>
          );
        },

        // Code blocks (pre)
        pre: ({ children }) => {
          return <CodeBlock onOpenArtifact={onOpenArtifact}>{children}</CodeBlock>;
        },

        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-border/40 bg-transparent">
            <table className="w-full text-sm bg-transparent">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-transparent border-b border-border/40">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3.5 py-2 text-left font-semibold text-foreground border-b border-border/40 text-sm bg-transparent">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3.5 py-2 text-foreground/90 border-b border-border/20 text-sm bg-transparent">
            {children}
          </td>
        ),
        tr: ({ children }) => (
          <tr className="bg-transparent hover:bg-white/[0.02] transition-colors duration-100">{children}</tr>
        ),
      }}
    >
      {stripEmojis(content)}
    </ReactMarkdown>
  );
}

function stripEmojis(text: string): string {
  if (!text) return '';
  return text.replace(/[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '');
}

function CodeBlock({
  children,
  onOpenArtifact,
}: {
  children: React.ReactNode;
  onOpenArtifact?: (title: string, content: string, language?: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  // Extract language and code text from children
  let language = '';
  let codeText = '';

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const props = child.props as { className?: string; children?: React.ReactNode };
      const className = props.className ?? '';
      const match = className.match(/language-(\w+)/);
      if (match) language = match[1];
      codeText = extractText(props.children);
    }
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border/40 bg-transparent">
      {/* Code block header */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-transparent border-b border-border/20">
        <span className="text-xs font-medium text-muted-foreground/70 font-mono uppercase tracking-wider">
          {language || 'text'}
        </span>
        <div className="flex items-center gap-1.5">
          {onOpenArtifact && (
            <button
              onClick={() => onOpenArtifact(language ? `${language.toUpperCase()} Artifact` : 'Code Artifact', codeText, language)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-primary transition-colors duration-150 px-2 py-1 rounded hover:bg-white/5"
              aria-label="Open in Artifact panel"
            >
              <PanelRight size={12} />
              <span>Artifact</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150 px-2 py-1 rounded hover:bg-white/5"
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <Check size={12} className="text-green-400" />
                <span className="text-green-400">Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code content */}
      {language?.toLowerCase() === 'mermaid' || /^\s*(sequenceDiagram|flowchart|graph|classDiagram|stateDiagram|erDiagram|mindmap|gantt|gitGraph)/.test(codeText) ? (
        <MermaidDiagram code={codeText} className="border-0 rounded-none bg-transparent" />
      ) : (
        <div className="overflow-x-auto bg-transparent">
          <pre className="p-3.5 text-sm leading-relaxed bg-transparent">
            <code className="font-mono text-[0.8125rem] text-foreground/90 whitespace-pre bg-transparent">
              {codeText}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return '';
}