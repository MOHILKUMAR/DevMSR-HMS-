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

export const DEMO_HOSPITAL_DETAILS = {
  addressLine: '1 Demo Road (fake address)',
  city: 'Demo City',
  state: 'Demo State',
  pincode: '100001',
  phone: '+91 00000 00000',
  email: 'demo-hospital@example.invalid',
};

export const DEMO_DEPARTMENTS = [
  { code: 'GENMED', name: 'General Medicine' },
  { code: 'PAED', name: 'Paediatrics' },
  { code: 'ORTHO', name: 'Orthopaedics' },
  { code: 'OBGYN', name: 'Obstetrics and Gynaecology' },
  { code: 'SURG', name: 'General Surgery' },
];

/** Fake doctors. The first is linked to the `doctor` login so that user has a queue. */
export const DEMO_DOCTORS: {
  fullName: string;
  department: string;
  qualification: string;
  registrationNumber: string;
  username?: string;
  isVisiting?: boolean;
}[] = [
  { fullName: 'Dr Demo Doctor', department: 'GENMED', qualification: 'MBBS, MD (Medicine)', registrationNumber: 'DEMO-REG-0001', username: 'doctor' },
  { fullName: 'Dr Kavya Nair', department: 'PAED', qualification: 'MBBS, MD (Paediatrics)', registrationNumber: 'DEMO-REG-0002' },
  { fullName: 'Dr Arjun Mehta', department: 'ORTHO', qualification: 'MBBS, MS (Ortho)', registrationNumber: 'DEMO-REG-0003' },
  { fullName: 'Dr Priya Iyer', department: 'OBGYN', qualification: 'MBBS, MS (OBG)', registrationNumber: 'DEMO-REG-0004' },
  { fullName: 'Dr Rahul Das', department: 'SURG', qualification: 'MBBS, MS (Surgery)', registrationNumber: 'DEMO-REG-0005', isVisiting: true },
];

export const DEMO_ROOM_CATEGORIES = [
  { code: 'GENERAL', name: 'General ward' },
  { code: 'PRIVATE', name: 'Private room' },
  { code: 'ICU', name: 'ICU' },
];

type DemoBedStatus = 'free' | 'cleaning' | 'reserved' | 'blocked';

export const DEMO_WARDS: { code: string; name: string; roomCategory: string; beds: number; statuses?: Record<number, DemoBedStatus> }[] = [
  { code: 'GEN-M', name: 'General ward (male)', roomCategory: 'GENERAL', beds: 12, statuses: { 12: 'cleaning' } },
  { code: 'GEN-F', name: 'General ward (female)', roomCategory: 'GENERAL', beds: 12 },
  { code: 'ICU', name: 'ICU', roomCategory: 'ICU', beds: 6, statuses: { 6: 'blocked' } },
  { code: 'PVT', name: 'Private rooms', roomCategory: 'PRIVATE', beds: 8, statuses: { 8: 'reserved' } },
];

/**
 * FAKE demo rates in paise, for testing only. The real hospital enters its own on the Rates and
 * fees screen (docs/billing-rules.md). Tax is 0 because the demo makes no tax decision.
 */
export const DEMO_RATES_FROM = '2026-04-01';

export const DEMO_SERVICE_ITEMS: {
  code: string;
  name: string;
  kind: 'consultation' | 'room' | 'nursing' | 'procedure' | 'investigation' | 'other';
  doctor?: string;
  roomCategory?: string;
  ratePaise: number;
}[] = [
  { code: 'CONS-GENMED', name: 'Consultation: Dr Demo Doctor', kind: 'consultation', doctor: 'Dr Demo Doctor', ratePaise: 50_000 },
  { code: 'CONS-PAED', name: 'Consultation: Dr Kavya Nair', kind: 'consultation', doctor: 'Dr Kavya Nair', ratePaise: 60_000 },
  { code: 'CONS-ORTHO', name: 'Consultation: Dr Arjun Mehta', kind: 'consultation', doctor: 'Dr Arjun Mehta', ratePaise: 70_000 },
  { code: 'CONS-OBGYN', name: 'Consultation: Dr Priya Iyer', kind: 'consultation', doctor: 'Dr Priya Iyer', ratePaise: 60_000 },
  { code: 'CONS-SURG', name: 'Consultation: Dr Rahul Das', kind: 'consultation', doctor: 'Dr Rahul Das', ratePaise: 80_000 },
  { code: 'ROOM-GENERAL', name: 'Room rent: general ward (per day)', kind: 'room', roomCategory: 'GENERAL', ratePaise: 100_000 },
  { code: 'ROOM-PRIVATE', name: 'Room rent: private room (per day)', kind: 'room', roomCategory: 'PRIVATE', ratePaise: 300_000 },
  { code: 'ROOM-ICU', name: 'Room rent: ICU (per day)', kind: 'room', roomCategory: 'ICU', ratePaise: 600_000 },
  { code: 'NURS-GENERAL', name: 'Nursing: general ward (per day)', kind: 'nursing', roomCategory: 'GENERAL', ratePaise: 30_000 },
  { code: 'NURS-PRIVATE', name: 'Nursing: private room (per day)', kind: 'nursing', roomCategory: 'PRIVATE', ratePaise: 50_000 },
  { code: 'NURS-ICU', name: 'Nursing: ICU (per day)', kind: 'nursing', roomCategory: 'ICU', ratePaise: 150_000 },
  { code: 'DRESSING', name: 'Dressing (small)', kind: 'procedure', ratePaise: 20_000 },
  { code: 'ECG', name: 'ECG', kind: 'investigation', ratePaise: 30_000 },
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
