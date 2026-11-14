import {
  LayoutDashboard,
  Clock3,
  CalendarDays,
  FilePenLine,
  FolderOpen,
  UserRound,
  UsersRound,
  CircleAlert,
  ClipboardCheck,
  Building2,
  ChartNoAxesCombined,
  Settings,
  ShieldCheck,
} from 'lucide-react';

export const workspaces = {
  employee: {
    slug: 'me',
    name: 'Employee',
    label: 'MY WORKSPACE',
    links: [
      ['', 'Dashboard', LayoutDashboard],
      ['attendance', 'My Attendance', Clock3],
      ['schedule', 'My Schedule', CalendarDays],
      ['corrections', 'Correction Requests', FilePenLine],
      ['documents', 'My Documents', FolderOpen],
      ['profile', 'Profile', UserRound],
    ],
  },
  supervisor: {
    slug: 'team',
    name: 'Supervisor',
    label: 'TEAM WORKSPACE',
    links: [
      ['', 'Dashboard', LayoutDashboard],
      ['attendance', 'Team Attendance', Clock3],
      ['members', 'Team Members', UsersRound],
      ['exceptions', 'Exceptions', CircleAlert],
      ['corrections', 'Correction Reviews', ClipboardCheck],
    ],
  },
  hr: {
    slug: 'hr',
    name: 'HR / Admin',
    label: 'PEOPLE WORKSPACE',
    links: [
      ['', 'Dashboard', LayoutDashboard],
      ['employees', 'Employees', UsersRound],
      ['attendance', 'Attendance', Clock3],
      ['security', 'Security checks', ShieldCheck],
      ['approvals', 'Approvals', ClipboardCheck],
      ['sites', 'Sites & Shifts', Building2],
      ['documents', 'Documents', FolderOpen],
      ['reports', 'Reports', ChartNoAxesCombined],
      ['settings', 'Settings', Settings],
    ],
  },
};
