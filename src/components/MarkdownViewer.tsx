import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  onLinkClick?: (title: string) => void
}

export default function MarkdownViewer({ content, onLinkClick }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ node: _node, href, children, ...props }) {
          const text = String(children || '')
          if (href && href.startsWith('#')) {
            return (
              <a href={href} {...props}>
                {children}
              </a>
            )
          }
          if (onLinkClick && text.startsWith('[[') && text.endsWith(']]')) {
            const title = text.slice(2, -2)
            return (
              <button className="wiki-link" onClick={() => onLinkClick(title)}>
                {title}
              </button>
            )
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
