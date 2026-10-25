import type { Metadata } from 'next';
import { Inter, Noto_Sans_Devanagari } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { THEME_COOKIE } from '@/lib/cookies';
import { cn } from '@/lib/utils';
import { Providers } from './providers';
import './globals.css';

// Self-hosted by next/font: downloaded at build time, no request to Google at runtime.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' });
// Only loaded when Hindi text appears, so English screens do not pay for it.
const devanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600'],
  variable: '--font-devanagari',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'DevMSR HMS',
  description: 'Hospital management system',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Read on the server so the chosen theme is in the first paint, with no flash.
  const dark = (await cookies()).get(THEME_COOKIE)?.value === 'dark';
  const locale = await getLocale();
  return (
    <html lang={locale} className={cn(inter.variable, devanagari.variable, dark && 'dark')}>
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
