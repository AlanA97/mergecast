'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'

interface DashboardShellProps {
  workspace: { name: string; slug: string; plan: string }
  children: React.ReactNode
}

export function DashboardShell({ workspace, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex">
        <Sidebar workspace={workspace} />
      </div>

      {/* Mobile sidebar — slide-in overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative z-50 h-full w-64">
            <Sidebar
              workspace={workspace}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-sm">Mergecast</span>
        </header>

        <main className="flex-1 overflow-auto bg-muted/10">
          {children}
        </main>
      </div>
    </div>
  )
}
