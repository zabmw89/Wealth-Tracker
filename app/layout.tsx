/**
 * @file app/layout.tsx
 * @description Root layout for the Next.js App Router — wraps every page with the global CSS
 * stylesheet, SEO metadata, and the HTML shell.
 *
 * Key Decisions:
 * - `suppressHydrationWarning` is applied to both `<html>` and `<body>` to silently absorb
 *   attribute mutations injected by browser extensions (e.g. IDM, Grammarly) before React
 *   hydrates. This suppression is intentionally shallow (one level deep) and does not mask
 *   legitimate hydration mismatches in application components.
 * - The layout is a Server Component (no "use client" directive), which lets Next.js stream
 *   the initial HTML shell from the server before the client bundle arrives.
 */

import type { Metadata } from 'next';
// @ts-expect-error Next.js handles global CSS imports at build time.
import './globals.css';

/**
 * Static SEO metadata applied globally. Individual pages can override these values
 * through their own exported `metadata` object.
 */
export const metadata: Metadata = {
  title: 'Wealth Portfolio Tracker',
  description: 'Multi-asset portfolio management prototype with policy-enforced RBAC and AI tool orchestration.',
};

/**
 * RootLayout — mandatory root layout component.
 * Renders the outer HTML document structure shared across all routes.
 *
 * @param {{ children: React.ReactNode }} props - Page content injected by Next.js App Router.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: prevents false-positive hydration warnings from browser extensions.
    // lang and dir are initially set to English LTR; page.tsx updates them dynamically via
    // document.documentElement.setAttribute() when the user switches to Arabic (RTL).
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
