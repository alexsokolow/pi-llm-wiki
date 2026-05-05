import { type ReactNode } from 'react'

interface Props {
  header: string
  nav: ReactNode
  children: ReactNode
  drawer?: ReactNode
}

export default function TerminalLayout({ header, nav, children, drawer }: Props) {
  return (
    <div className="terminal">
      <div className="scanlines" />
      <header className="terminal-header">
        <span className="prompt">&gt;</span> {header}
      </header>
      {nav}
      <main className="terminal-main">{children}</main>
      {drawer}
      <footer className="terminal-footer">
        <span className="cursor">█</span> pi-powered wiki
      </footer>
    </div>
  )
}
