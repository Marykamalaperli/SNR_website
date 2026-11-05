// Synthetic data. This module must only be imported by the DEV-only preview entry.
export const sampleDay = '2026-11-05';
export const sampleLabel = 'Thursday, 5 November 2026';
export const employees = [
  {
    id: 'SNR-001',
    name: 'Alex Morgan',
    initials: 'AM',
    email: 'alex@example.invalid',
    department: 'Operations',
    site: 'Hyderabad',
    shift: '09:00 – 18:00',
    status: 'Present',
    punch: '08:58',
  },
  {
    id: 'SNR-002',
    name: 'Arjun Mehta',
    initials: 'AR',
    email: 'arjun@example.invalid',
    department: 'Operations',
    site: 'Hyderabad',
    shift: '09:00 – 18:00',
    status: 'Present',
    punch: '09:02',
  },
  {
    id: 'SNR-003',
    name: 'Kavya Nair',
    initials: 'KN',
    email: 'kavya@example.invalid',
    department: 'Operations',
    site: 'Hyderabad',
    shift: '09:00 – 18:00',
    status: 'Missed punch',
    punch: '—',
  },
  {
    id: 'SNR-004',
    name: 'Rahul Verma',
    initials: 'RV',
    email: 'rahul@example.invalid',
    department: 'Operations',
    site: 'Hyderabad',
    shift: '09:00 – 18:00',
    status: 'Absent',
    punch: '—',
  },
  {
    id: 'SNR-005',
    name: 'Meera Patel',
    initials: 'MP',
    email: 'meera@example.invalid',
    department: 'People',
    site: 'Bengaluru',
    shift: '09:00 – 18:00',
    status: 'Present',
    punch: '08:55',
  },
  {
    id: 'SNR-006',
    name: 'Dev Reddy',
    initials: 'DR',
    email: 'dev@example.invalid',
    department: 'Engineering',
    site: 'Bengaluru',
    shift: '10:00 – 19:00',
    status: 'Present',
    punch: '09:58',
  },
  {
    id: 'SNR-007',
    name: 'Sana Khan',
    initials: 'SK',
    email: 'sana@example.invalid',
    department: 'Engineering',
    site: 'Hyderabad',
    shift: '09:00 – 18:00',
    status: 'Clocked out',
    punch: '08:50',
  },
  {
    id: 'SNR-008',
    name: 'Ishan Rao',
    initials: 'IR',
    email: 'ishan@example.invalid',
    department: 'Operations',
    site: 'Hyderabad',
    shift: '09:00 – 18:00',
    status: 'Present',
    punch: '08:59',
  },
];
export const attendance = [
  {
    id: 'a-1',
    date: '04 Nov 2026',
    day: 'Wednesday',
    clockIn: '08:57',
    clockOut: '18:02',
    status: 'Completed',
  },
  {
    id: 'a-2',
    date: '03 Nov 2026',
    day: 'Tuesday',
    clockIn: '09:01',
    clockOut: '18:00',
    status: 'Completed',
  },
  {
    id: 'a-3',
    date: '02 Nov 2026',
    day: 'Monday',
    clockIn: '09:00',
    clockOut: '—',
    status: 'Missed punch',
  },
  {
    id: 'a-4',
    date: '30 Oct 2026',
    day: 'Friday',
    clockIn: '08:59',
    clockOut: '18:03',
    status: 'Completed',
  },
];
export const corrections = [
  {
    id: 'CR-104',
    employeeId: 'SNR-003',
    name: 'Kavya Nair',
    department: 'Operations',
    date: '04 Nov 2026',
    type: 'Clock-in',
    time: '09:00',
    reason: 'The clock-in screen was unavailable when I arrived.',
    status: 'Pending',
    recommendation: null,
  },
  {
    id: 'CR-103',
    employeeId: 'SNR-001',
    name: 'Alex Morgan',
    department: 'Operations',
    date: '02 Nov 2026',
    type: 'Clock-out',
    time: '18:00',
    reason: 'I forgot to clock out after the team handover.',
    status: 'Pending',
    recommendation: 'Recommended',
  },
  {
    id: 'CR-102',
    employeeId: 'SNR-006',
    name: 'Dev Reddy',
    department: 'Engineering',
    date: '03 Nov 2026',
    type: 'Clock-in',
    time: '10:00',
    reason: 'Please review my arrival time with my supervisor.',
    status: 'Pending',
    recommendation: null,
  },
];
export const documents = [
  {
    id: 'd-1',
    name: 'Employee handbook',
    category: 'Company guide',
    updated: '01 Nov 2026',
    content:
      'This is a synthetic handbook preview, not an approved company policy. Real documents will appear only after private storage and access controls are configured.',
  },
  {
    id: 'd-2',
    name: 'Getting started',
    category: 'Onboarding',
    updated: '01 Nov 2026',
    content:
      'A sample welcome document. Your actual onboarding instructions will be provided by your HR team. No private documents are connected to this preview.',
  },
];

export function createDemoState(role) {
  const scopedEmployees =
    role === 'supervisor'
      ? employees.filter((item) => item.department === 'Operations')
      : employees;
  const scopedCorrections =
    role === 'employee'
      ? corrections.filter((item) => item.employeeId === 'SNR-001')
      : role === 'supervisor'
        ? corrections.filter((item) => item.department === 'Operations')
        : corrections;
  return {
    employees: structuredClone(scopedEmployees),
    corrections: structuredClone(scopedCorrections),
    attendance: structuredClone(attendance),
    documents: structuredClone(documents),
    clock: { status: 'Not started', clockIn: '—', clockOut: '—' },
    notice: '',
  };
}
