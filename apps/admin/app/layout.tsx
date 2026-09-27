import type { Metadata } from 'next';
import '@showhunt/ui/styles.css';
export const metadata: Metadata = { title: 'ShowHunt Staff', robots: { index: false, follow: false } };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-GH"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>; }
