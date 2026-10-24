// Fake data for development only. Names are common Indian names chosen at random, phone numbers start
// with +910 (no Indian mobile number does), and Aadhaar and ABHA numbers start with 0 (never issued).

import type { RoleCode } from '../apps/api/src/auth/permission-matrix.js';

export const DEMO_HOSPITAL = { code: 'DEMO', name: 'Sample Care Hospital (demo)' };
export const DEMO_BRANCH = { code: 'MAIN', name: 'Main campus' };

/** One login per seeded role. All share SEED_USER_PASSWORD. */
export const DEMO_USERS: { role: RoleCode; username: string; displayName: string }[] = [
  { role: 'super_admin', username: 'superadmin', displayName: 'Demo Super Admin' },
  { role: 'hospital_admin', username: 'admin', displayName: 'Demo Hospital Admin' },
  { role: 'md', username: 'md', displayName: 'Demo MD' },
  { role: 'accountant', username: 'accounts', displayName: 'Demo Accountant' },
  { role: 'billing_clerk', username: 'billing', displayName: 'Demo Billing Clerk' },
  { role: 'cashier', username: 'cashier', displayName: 'Demo Cashier' },
  { role: 'receptionist', username: 'reception', displayName: 'Demo Receptionist' },
  { role: 'doctor', username: 'doctor', displayName: 'Dr Demo Doctor' },
  { role: 'nurse', username: 'nurse', displayName: 'Demo Nurse' },
  { role: 'pharmacist', username: 'pharmacy', displayName: 'Demo Pharmacist' },
  { role: 'lab_technician', username: 'lab', displayName: 'Demo Lab Technician' },
  { role: 'ot_coordinator', username: 'ot', displayName: 'Demo OT Coordinator' },
];

type DemoBedStatus = 'free' | 'cleaning' | 'reserved' | 'blocked';

export const DEMO_WARDS: { code: string; name: string; beds: number; statuses?: Record<number, DemoBedStatus> }[] = [
  { code: 'GEN-M', name: 'General ward (male)', beds: 12, statuses: { 12: 'cleaning' } },
  { code: 'GEN-F', name: 'General ward (female)', beds: 12 },
  { code: 'ICU', name: 'ICU', beds: 6, statuses: { 6: 'blocked' } },
  { code: 'PVT', name: 'Private rooms', beds: 8, statuses: { 8: 'reserved' } },
];

export const PATIENT_COUNT = 50;

export const MALE_FIRST_NAMES = [
  'Aarav', 'Vihaan', 'Arjun', 'Rohan', 'Kabir', 'Ishaan', 'Rahul', 'Suresh', 'Ramesh', 'Mahesh',
  'Anil', 'Vikram', 'Sanjay', 'Imran', 'Joseph', 'Gurpreet', 'Harish', 'Manoj', 'Deepak', 'Prakash',
];

export const FEMALE_FIRST_NAMES = [
  'Aanya', 'Diya', 'Priya', 'Ananya', 'Kavya', 'Meera', 'Sunita', 'Lakshmi', 'Pooja', 'Neha',
  'Fatima', 'Mary', 'Harpreet', 'Rekha', 'Asha', 'Geeta', 'Shalini', 'Divya', 'Nisha', 'Radha',
];

export const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Das',
  'Khan', 'Fernandes', 'Mehta', 'Joshi', 'Yadav', 'Banerjee', 'Pillai', 'Chauhan', 'Mishra', 'Rao',
];

/** Small seeded generator, so every run produces the same patients. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick from an empty list');
  return item;
}

export function digits(random: () => number, count: number): string {
  let out = '';
  for (let i = 0; i < count; i += 1) out += String(Math.floor(random() * 10));
  return out;
}
