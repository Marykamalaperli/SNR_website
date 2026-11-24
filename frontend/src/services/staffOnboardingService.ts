export type StoreRoleType =
  | 'store_manager'
  | 'assistant_store_manager'
  | 'team_lead'
  | 'picker_packer'
  | 'security_guard'
  | 'other';

export interface RoleDefinition {
  type: StoreRoleType;
  label: string;
  category: 'management' | 'supervisory' | 'associate';
  reportingTo: string;
  level: number;
  requiresPreviousEmploymentDocs: boolean;
  authorizations: string[];
  description: string;
}

export const STORE_ROLE_DEFINITIONS: Record<StoreRoleType, RoleDefinition> = {
  store_manager: {
    type: 'store_manager',
    label: 'Store Manager (SM)',
    category: 'management',
    reportingTo: 'Store Administrator',
    level: 1,
    requiresPreviousEmploymentDocs: true,
    authorizations: [
      'Full store operational oversight',
      'Daily shift schedule & break approvals',
      'Attendance exception review & approvals',
      'Store inventory & floor replenishment direction',
      'Emergency escalation & incident response',
    ],
    description: 'Direct in-store executive authority overseeing all shifts, teams, and daily operations.',
  },
  assistant_store_manager: {
    type: 'assistant_store_manager',
    label: 'Assistant Store Manager (ASM)',
    category: 'management',
    reportingTo: 'Store Manager',
    level: 2,
    requiresPreviousEmploymentDocs: true,
    authorizations: [
      'Operational shift execution & handover',
      'Inbound/outbound stock verification',
      'Roster coverage & floor supervisor coordination',
      'Secondary attendance exception review',
    ],
    description: 'Second-in-command assisting Store Manager in daily execution and shift handovers.',
  },
  team_lead: {
    type: 'team_lead',
    label: 'Team Lead (TL)',
    category: 'supervisory',
    reportingTo: 'Assistant Store Manager',
    level: 3,
    requiresPreviousEmploymentDocs: true,
    authorizations: [
      'Floor line supervision',
      'Picker & packer work allocation',
      'Order fulfillment queue monitoring',
      'Team punctuality & break coordination',
    ],
    description: 'Floor supervisor managing front-line pickers, packers, and operational throughput.',
  },
  picker_packer: {
    type: 'picker_packer',
    label: 'Associate (Picker & Packer)',
    category: 'associate',
    reportingTo: 'Team Lead',
    level: 4,
    requiresPreviousEmploymentDocs: false,
    authorizations: [
      'Barcode scanning & SKU item picking',
      'Order packing & quality inspection',
      'Kiosk tablet clock-in and clock-out',
      'Material handling & shelf replenishment',
    ],
    description: 'Front-line store fulfillment team fulfilling customer orders with precision.',
  },
  security_guard: {
    type: 'security_guard',
    label: 'Security Guard & Watchman',
    category: 'associate',
    reportingTo: 'Store Manager / ASM',
    level: 4,
    requiresPreviousEmploymentDocs: false,
    authorizations: [
      'Physical entrance & gate monitoring',
      'Attendance QR kiosk station security',
      'Visitor register & baggage check logs',
      'Facility perimeter & nighttime vigilance',
    ],
    description: 'Facility protection and gate control ensuring safety and anti-loss measures.',
  },
  other: {
    type: 'other',
    label: 'Other (Custom Designation)',
    category: 'associate',
    reportingTo: 'Store Manager',
    level: 4,
    requiresPreviousEmploymentDocs: false,
    authorizations: [
      'Role-specific duties as assigned by Store Admin',
      'Kiosk tablet attendance access',
    ],
    description: 'Specialist or custom operational role created with custom designations.',
  },
};

export interface SalaryBreakdown {
  templateName: string;
  basic: number;
  hra: number;
  specialAllowance: number;
  pfDeduction: number;
  esiDeduction: number;
  grossSalary: number;
  netTakeHome: number;
}

export const SALARY_TEMPLATES: Record<string, SalaryBreakdown> = {
  store_manager: {
    templateName: 'Store Manager Tier (₹60,000)',
    basic: 30000,
    hra: 15000,
    specialAllowance: 15000,
    pfDeduction: 1800,
    esiDeduction: 0,
    grossSalary: 60000,
    netTakeHome: 58200,
  },
  assistant_store_manager: {
    templateName: 'Assistant Store Manager Tier (₹42,000)',
    basic: 21000,
    hra: 10500,
    specialAllowance: 10500,
    pfDeduction: 1800,
    esiDeduction: 0,
    grossSalary: 42000,
    netTakeHome: 40200,
  },
  team_lead: {
    templateName: 'Team Lead Tier (₹30,000)',
    basic: 15000,
    hra: 7500,
    specialAllowance: 7500,
    pfDeduction: 1800,
    esiDeduction: 0,
    grossSalary: 30000,
    netTakeHome: 28200,
  },
  picker_packer: {
    templateName: 'Associate - Picker & Packer Tier (₹18,000)',
    basic: 11000,
    hra: 4000,
    specialAllowance: 3000,
    pfDeduction: 1320,
    esiDeduction: 135,
    grossSalary: 18000,
    netTakeHome: 16545,
  },
  security_guard: {
    templateName: 'Security Guard & Watchman Tier (₹16,500)',
    basic: 10500,
    hra: 3500,
    specialAllowance: 2500,
    pfDeduction: 1260,
    esiDeduction: 124,
    grossSalary: 16500,
    netTakeHome: 15116,
  },
  custom: {
    templateName: 'Custom Salary Structure',
    basic: 15000,
    hra: 5000,
    specialAllowance: 5000,
    pfDeduction: 1800,
    esiDeduction: 0,
    grossSalary: 25000,
    netTakeHome: 23200,
  },
};

export interface StaffOnboardingDossier {
  employeeId: string;
  employeeCode: string;
  storeId: string;
  storeName?: string;

  // Step 1: Personal Details
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  maritalStatus: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  livePhotoUrl?: string; // base64 or photo URL
  phone: string;
  email: string;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };

  // Step 2: Role & Designation
  designation: StoreRoleType;
  customDesignation?: string;
  dateOfJoining: string;

  // Step 3: Previous Employment & KYC Documents
  previousEmployment?: {
    companyName: string;
    designation: string;
    payslipsUploaded: { month1: boolean; month2: boolean; month3: boolean };
    offerLetterUploaded: boolean;
  };
  kycDocuments: {
    aadharNumber: string;
    aadharUploaded: boolean;
    panNumber: string;
    panUploaded: boolean;
    otherDocsUploaded?: boolean;
  };

  // Step 4: Bank Details
  bankDetails: {
    accountHolderName: string;
    bankName: string;
    branchName?: string;
    accountNumber: string;
    ifscCode: string;
    passbookUploaded: boolean;
    passbookFileName?: string;
  };

  // Step 5: Salary Structure
  salary: SalaryBreakdown;

  status: 'active' | 'deactivated';
  createdAt: string;
}

const STORAGE_KEY = 'snr_staff_onboarding_dossiers';

const SEED_DOSSIERS: StaffOnboardingDossier[] = [
  {
    employeeId: 'seed-emp-sm-1',
    employeeCode: 'EMP-SM-101',
    storeId: '',
    storeName: 'Development Store',
    firstName: 'Raghav',
    lastName: 'Sharma',
    fullName: 'Raghav Sharma',
    dob: '1988-06-14',
    gender: 'Male',
    maritalStatus: 'Married',
    phone: '9876543210',
    email: 'raghav.sharma@example.com',
    emergencyContact: {
      name: 'Sunita Sharma',
      relationship: 'Spouse',
      phone: '9876543211',
    },
    designation: 'store_manager',
    dateOfJoining: '2024-01-15',
    previousEmployment: {
      companyName: 'Blinkit Fulfillment Ltd',
      designation: 'Assistant Store Operations Manager',
      payslipsUploaded: { month1: true, month2: true, month3: true },
      offerLetterUploaded: true,
    },
    kycDocuments: {
      aadharNumber: 'XXXX-XXXX-4589',
      aadharUploaded: true,
      panNumber: 'ABCPS4589K',
      panUploaded: true,
    },
    bankDetails: {
      accountHolderName: 'Raghav Sharma',
      bankName: 'HDFC Bank',
      branchName: 'Indiranagar',
      accountNumber: '50100234567890',
      ifscCode: 'HDFC0001234',
      passbookUploaded: true,
      passbookFileName: 'passbook_raghav.pdf',
    },
    salary: SALARY_TEMPLATES.store_manager,
    status: 'active',
    createdAt: '2024-01-15T09:00:00Z',
  },
  {
    employeeId: 'seed-emp-asm-1',
    employeeCode: 'EMP-ASM-102',
    storeId: '',
    storeName: 'Development Store',
    firstName: 'Pooja',
    lastName: 'Nair',
    fullName: 'Pooja Nair',
    dob: '1992-09-22',
    gender: 'Female',
    maritalStatus: 'Single',
    phone: '9812345678',
    email: 'pooja.nair@example.com',
    emergencyContact: {
      name: 'Ramesh Nair',
      relationship: 'Father',
      phone: '9812345679',
    },
    designation: 'assistant_store_manager',
    dateOfJoining: '2024-03-01',
    previousEmployment: {
      companyName: 'Instamart Hub',
      designation: 'Shift Team Leader',
      payslipsUploaded: { month1: true, month2: true, month3: true },
      offerLetterUploaded: true,
    },
    kycDocuments: {
      aadharNumber: 'XXXX-XXXX-6721',
      aadharUploaded: true,
      panNumber: 'ABCPN6721M',
      panUploaded: true,
    },
    bankDetails: {
      accountHolderName: 'Pooja Nair',
      bankName: 'ICICI Bank',
      branchName: 'Koramangala',
      accountNumber: '001201567890',
      ifscCode: 'ICIC0000012',
      passbookUploaded: true,
      passbookFileName: 'passbook_pooja.pdf',
    },
    salary: SALARY_TEMPLATES.assistant_store_manager,
    status: 'active',
    createdAt: '2024-03-01T09:00:00Z',
  },
  {
    employeeId: 'seed-emp-tl-1',
    employeeCode: 'EMP-TL-103',
    storeId: '',
    storeName: 'Development Store',
    firstName: 'Vikram',
    lastName: 'Singh',
    fullName: 'Vikram Singh',
    dob: '1995-11-05',
    gender: 'Male',
    maritalStatus: 'Single',
    phone: '9765432109',
    email: 'vikram.singh@example.com',
    emergencyContact: {
      name: 'Gurmeet Singh',
      relationship: 'Brother',
      phone: '9765432108',
    },
    designation: 'team_lead',
    dateOfJoining: '2024-04-10',
    previousEmployment: {
      companyName: 'BigBasket Dark Store',
      designation: 'Senior Picking Specialist',
      payslipsUploaded: { month1: true, month2: true, month3: true },
      offerLetterUploaded: true,
    },
    kycDocuments: {
      aadharNumber: 'XXXX-XXXX-9812',
      aadharUploaded: true,
      panNumber: 'ABCPS9812L',
      panUploaded: true,
    },
    bankDetails: {
      accountHolderName: 'Vikram Singh',
      bankName: 'State Bank of India',
      branchName: 'Whitefield',
      accountNumber: '20345678901',
      ifscCode: 'SBIN0004567',
      passbookUploaded: true,
      passbookFileName: 'passbook_vikram.pdf',
    },
    salary: SALARY_TEMPLATES.team_lead,
    status: 'active',
    createdAt: '2024-04-10T09:00:00Z',
  },
  {
    employeeId: 'seed-emp-pp-1',
    employeeCode: 'EMP-PP-201',
    storeId: '',
    storeName: 'Development Store',
    firstName: 'Kavita',
    lastName: 'Reddy',
    fullName: 'Kavita Reddy',
    dob: '1998-04-18',
    gender: 'Female',
    maritalStatus: 'Single',
    phone: '9654321098',
    email: 'kavita.reddy@example.com',
    emergencyContact: {
      name: 'Anil Reddy',
      relationship: 'Brother',
      phone: '9654321097',
    },
    designation: 'picker_packer',
    dateOfJoining: '2024-06-01',
    kycDocuments: {
      aadharNumber: 'XXXX-XXXX-1123',
      aadharUploaded: true,
      panNumber: 'ABCPR1123P',
      panUploaded: true,
    },
    bankDetails: {
      accountHolderName: 'Kavita Reddy',
      bankName: 'State Bank of India',
      branchName: 'Marathahalli',
      accountNumber: '30456789012',
      ifscCode: 'SBIN0007890',
      passbookUploaded: true,
      passbookFileName: 'passbook_kavita.jpg',
    },
    salary: SALARY_TEMPLATES.picker_packer,
    status: 'active',
    createdAt: '2024-06-01T09:00:00Z',
  },
  {
    employeeId: 'seed-emp-sec-1',
    employeeCode: 'EMP-SEC-301',
    storeId: '',
    storeName: 'Development Store',
    firstName: 'Mahesh',
    lastName: 'Yadav',
    fullName: 'Mahesh Yadav',
    dob: '1984-02-10',
    gender: 'Male',
    maritalStatus: 'Married',
    phone: '9543210987',
    email: 'mahesh.yadav@example.com',
    emergencyContact: {
      name: 'Geeta Yadav',
      relationship: 'Spouse',
      phone: '9543210986',
    },
    designation: 'security_guard',
    dateOfJoining: '2024-02-15',
    kycDocuments: {
      aadharNumber: 'XXXX-XXXX-3344',
      aadharUploaded: true,
      panNumber: 'ABCPY3344Q',
      panUploaded: true,
    },
    bankDetails: {
      accountHolderName: 'Mahesh Yadav',
      bankName: 'Punjab National Bank',
      branchName: 'Domlur',
      accountNumber: '102345678901',
      ifscCode: 'PUNB0012300',
      passbookUploaded: true,
      passbookFileName: 'passbook_mahesh.jpg',
    },
    salary: SALARY_TEMPLATES.security_guard,
    status: 'active',
    createdAt: '2024-02-15T09:00:00Z',
  },
];

export function getOnboardingDossiers(): StaffOnboardingDossier[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DOSSIERS));
      return SEED_DOSSIERS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_DOSSIERS;
  } catch {
    return SEED_DOSSIERS;
  }
}

export function saveOnboardingDossier(dossier: StaffOnboardingDossier): void {
  try {
    const list = getOnboardingDossiers();
    const existingIndex = list.findIndex(
      (d) => d.employeeId === dossier.employeeId || d.employeeCode === dossier.employeeCode,
    );
    if (existingIndex >= 0) {
      list[existingIndex] = dossier;
    } else {
      list.unshift(dossier);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save onboarding dossier:', err);
  }
}

export function getOnboardingDossier(idOrCode: string): StaffOnboardingDossier | undefined {
  const list = getOnboardingDossiers();
  return list.find((d) => d.employeeId === idOrCode || d.employeeCode === idOrCode);
}

export function getCurrentEmployeeDossier(
  user?: { email?: string; display_name?: string; user_id?: string } | string | null,
): StaffOnboardingDossier {
  const list = getOnboardingDossiers();
  
  if (user) {
    if (typeof user === 'string') {
      const match = list.find(
        (d) =>
          d.employeeId === user ||
          d.employeeCode === user ||
          d.email.toLowerCase() === user.toLowerCase() ||
          d.fullName.toLowerCase() === user.toLowerCase(),
      );
      if (match) return match;
    } else {
      const userEmail = (user.email || '').toLowerCase();
      const userName = (user.display_name || '').toLowerCase();
      const match = list.find(
        (d) =>
          (userEmail && d.email.toLowerCase() === userEmail) ||
          (userName && d.fullName.toLowerCase() === userName) ||
          (user.user_id && d.employeeId === user.user_id),
      );
      if (match) return match;
    }
  }

  // If a specific session name or email was given, dynamically initialize a tailored dossier
  const resolvedName =
    typeof user === 'object' && user?.display_name
      ? user.display_name
      : typeof user === 'string' && user
        ? user
        : 'Tarun Teja';
  const resolvedEmail =
    typeof user === 'object' && user?.email
      ? user.email
      : 'tarun.teja@snrnest.local';

  const defaultDossier: StaffOnboardingDossier = {
    employeeId: 'emp-tarun-01',
    employeeCode: 'EMP-HYD-PP-105',
    storeId: 'store-dev-01',
    storeName: 'Development Store',
    firstName: resolvedName.split(' ')[0] || 'Tarun',
    lastName: resolvedName.split(' ').slice(1).join(' ') || 'Teja',
    fullName: resolvedName,
    dob: '1998-05-12',
    gender: 'Male',
    maritalStatus: 'Single',
    phone: '9876543210',
    email: resolvedEmail,
    emergencyContact: {
      name: 'Suresh Teja',
      relationship: 'Father',
      phone: '9876543219',
    },
    designation: 'picker_packer',
    dateOfJoining: '2024-05-01',
    previousEmployment: {
      companyName: 'Fulfillment Logistics India',
      designation: 'Fulfillment Associate',
      payslipsUploaded: { month1: true, month2: true, month3: true },
      offerLetterUploaded: true,
    },
    kycDocuments: {
      aadharNumber: 'XXXX-XXXX-4819',
      aadharUploaded: true,
      panNumber: 'ABCDE4819F',
      panUploaded: true,
      otherDocsUploaded: true,
    },
    bankDetails: {
      accountHolderName: resolvedName,
      bankName: 'HDFC Bank',
      branchName: 'Madhapur Branch, Hyderabad',
      accountNumber: '50100492819283',
      ifscCode: 'HDFC0001234',
      passbookUploaded: true,
      passbookFileName: 'passbook_tarunteja.pdf',
    },
    salary: SALARY_TEMPLATES.picker_packer,
    status: 'active',
    createdAt: '2024-05-01T09:00:00Z',
  };

  saveOnboardingDossier(defaultDossier);
  return defaultDossier;
}

export function updateEmployeeBankDetails(
  idOrCode: string,
  updatedBank: StaffOnboardingDossier['bankDetails'],
): StaffOnboardingDossier {
  const list = getOnboardingDossiers();
  let found = list.find((d) => d.employeeId === idOrCode || d.employeeCode === idOrCode);
  
  if (!found) {
    found = getCurrentEmployeeDossier(idOrCode);
  }

  found.bankDetails = {
    ...found.bankDetails,
    ...updatedBank,
  };

  saveOnboardingDossier(found);
  return found;
}

