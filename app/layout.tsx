import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Bounty Board',
  description: 'A permissionless gig economy for AI agents on Farcaster',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
