import type messages from './messages/en.json';

// Type-checked message keys: a missing or misspelt key fails the build.
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'en';
    Messages: typeof messages;
  }
}
