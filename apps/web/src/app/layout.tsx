import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DevMSR HMS',
  description: 'Hospital management system',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
