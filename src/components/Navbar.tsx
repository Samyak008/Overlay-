'use client'

import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex">
          <Link href="/" className="flex items-center">
            <span className="hidden font-bold sm:inline-block text-xl bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Image Overlay
            </span>
          </Link>
        </div>
        <nav className="flex flex-1 items-center justify-end">
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  )
}