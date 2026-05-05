import { type ReactNode } from 'react'

interface Props {
  header: string
  nav: ReactNode
  children: ReactNode
}

export default function TerminalLayout({ header, nav, children }: Props) {
  return (
    <div className="terminal">
      <div className="scanlines" />
      <header className="terminal-header">
        <span className="prompt">&gt;</span> {header}
      </header>
      {nav}
      <main className="terminal-main">{children}</main>
      <footer className="terminal-footer">
        <span className="cursor">█</span> pi-powered wiki
      </footer>
    </div>
  )
}
