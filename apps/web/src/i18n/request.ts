import { getRequestConfig } from 'next-intl/server';
import messages from '../messages/en.json';

// English only for now, without locale prefixes in URLs. Hindi is added by loading messages/hi.json
// for staff who choose it.
export default getRequestConfig(() =>
  Promise.resolve({
    locale: 'en',
    messages,
    timeZone: 'Asia/Kolkata',
  }),
);
