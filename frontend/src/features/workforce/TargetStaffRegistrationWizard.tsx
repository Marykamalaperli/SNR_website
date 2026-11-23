import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileCheck,
  FileText,
  FileUp,
  Image as ImageIcon,
  LocateFixed,
  Lock,
  Mail,
  Network,
  Phone,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import FormField from '../../components/forms/FormField';
import {
  createEmployee,
  listStores,
  Store,
} from '../../services/targetWorkforceService';
import {
  getOnboardingDossier,
  SALARY_TEMPLATES,
  SalaryBreakdown,
  saveOnboardingDossier,
  STORE_ROLE_DEFINITIONS,
  StoreRoleType,
} from '../../services/staffOnboardingService';

interface TargetStaffRegistrationWizardProps {
  initialStoreId?: string;
  initialRole?: StoreRoleType;
  onComplete?: (employeeCode: string, storeId: string) => void;
  onCancel?: () => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS = [
  'Personal & Photo',
  'Role & Store',
  'KYC & Verification',
  'Bank Details',
  'Salary Structure',
  'Review & Confirm',
];

export default function TargetStaffRegistrationWizard({
  initialStoreId,
  initialRole,
  onComplete,
  onCancel,
}: TargetStaffRegistrationWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successDossier, setSuccessDossier] = useState<{
    code: string;
    name: string;
    role: string;
    storeName: string;
  } | null>(null);

  // =========================================================================
  // STEP 1: PERSONAL DETAILS & LIVE PHOTO
  // =========================================================================
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('1998-01-01');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | 'Prefer not to say'>('Male');
  const [maritalStatus, setMaritalStatus] = useState<'Single' | 'Married' | 'Divorced' | 'Widowed'>('Single');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Emergency contact
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('Spouse');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Live photo state
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // =========================================================================
  // STEP 2: ROLE, STORE & DESIGNATION
  // =========================================================================
  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialStoreId || '');
  const [dateOfJoining, setDateOfJoining] = useState(() => new Date().toISOString().slice(0, 10));
  const [designation, setDesignation] = useState<StoreRoleType>(initialRole || 'picker_packer');
  const [customDesignation, setCustomDesignation] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');

  // =========================================================================
  // STEP 3: PREVIOUS EMPLOYMENT & KYC DOCUMENTS
  // =========================================================================
  const [prevCompany, setPrevCompany] = useState('');
  const [prevDesignation, setPrevDesignation] = useState('');
  const [payslip1Name, setPayslip1Name] = useState<string | null>(null);
  const [payslip2Name, setPayslip2Name] = useState<string | null>(null);
  const [payslip3Name, setPayslip3Name] = useState<string | null>(null);
  const [offerLetterName, setOfferLetterName] = useState<string | null>(null);

  const [aadharNumber, setAadharNumber] = useState('');
  const [aadharDocName, setAadharDocName] = useState<string | null>(null);
  const [panNumber, setPanNumber] = useState('');
  const [panDocName, setPanDocName] = useState<string | null>(null);
  const [otherDocName, setOtherDocName] = useState<string | null>(null);

  // =========================================================================
  // STEP 4: BANK DETAILS
  // =========================================================================
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [bankName, setBankName] = useState('State Bank of India');
  const [branchName, setBranchName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [passbookDocName, setPassbookDocName] = useState<string | null>(null);

  // =========================================================================
  // STEP 5: SALARY STRUCTURE
  // =========================================================================
  const [selectedSalaryTemplateKey, setSelectedSalaryTemplateKey] = useState<string>('picker_packer');
  const [salaryBasic, setSalaryBasic] = useState('11000');
  const [salaryHra, setSalaryHra] = useState('4000');
  const [salarySpecial, setSalarySpecial] = useState('3000');
  const [salaryPf, setSalaryPf] = useState('1320');
  const [salaryEsi, setSalaryEsi] = useState('135');
  const [salaryGross, setSalaryGross] = useState('18000');
  const [salaryNet, setSalaryNet] = useState('16545');

  // Load available stores on mount
  useEffect(() => {
    async function load() {
      setLoadingStores(true);
      try {
        const res = await listStores({ limit: 100 });
        setStores(res.items);
        if (!selectedStoreId && res.items.length > 0) {
          setSelectedStoreId(res.items[0].id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load store list.');
      } finally {
        setLoadingStores(false);
      }
    }
    load();
  }, []);

  // Sync designation to salary template
  useEffect(() => {
    const key = designation in SALARY_TEMPLATES ? designation : 'custom';
    setSelectedSalaryTemplateKey(key);
    applySalaryTemplate(key);
  }, [designation]);

  // Sync bank account holder name with first & last name if empty
  useEffect(() => {
    if (!bankAccountHolder && (firstName || lastName)) {
      setBankAccountHolder(`${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim());
    }
  }, [firstName, middleName, lastName]);

  // Auto-generate employee code suggestion
  useEffect(() => {
    const storeObj = stores.find((s) => s.id === selectedStoreId);
    const storeCode = storeObj ? storeObj.code : 'STR';
    let rolePrefix = 'STF';
    if (designation === 'store_manager') rolePrefix = 'SM';
    else if (designation === 'assistant_store_manager') rolePrefix = 'ASM';
    else if (designation === 'team_lead') rolePrefix = 'TL';
    else if (designation === 'picker_packer') rolePrefix = 'PP';
    else if (designation === 'security_guard') rolePrefix = 'SEC';

    const randomDigits = Math.floor(100 + Math.random() * 900);
    setEmployeeCode(`EMP-${storeCode}-${rolePrefix}-${randomDigits}`);
  }, [selectedStoreId, designation, stores]);

  function applySalaryTemplate(key: string) {
    const tmpl = SALARY_TEMPLATES[key] || SALARY_TEMPLATES.custom;
    setSalaryBasic(String(tmpl.basic));
    setSalaryHra(String(tmpl.hra));
    setSalarySpecial(String(tmpl.specialAllowance));
    setSalaryPf(String(tmpl.pfDeduction));
    setSalaryEsi(String(tmpl.esiDeduction));
    setSalaryGross(String(tmpl.grossSalary));
    setSalaryNet(String(tmpl.netTakeHome));
  }

  function handleSalaryComponentChange(
    basicVal: string,
    hraVal: string,
    specialVal: string,
    pfVal: string,
    esiVal: string,
  ) {
    const b = parseFloat(basicVal) || 0;
    const h = parseFloat(hraVal) || 0;
    const s = parseFloat(specialVal) || 0;
    const pf = parseFloat(pfVal) || 0;
    const esi = parseFloat(esiVal) || 0;

    const gross = b + h + s;
    const net = gross - (pf + esi);

    setSalaryBasic(basicVal);
    setSalaryHra(hraVal);
    setSalarySpecial(specialVal);
    setSalaryPf(pfVal);
    setSalaryEsi(esiVal);
    setSalaryGross(String(Math.round(gross)));
    setSalaryNet(String(Math.round(net)));
    setSelectedSalaryTemplateKey('custom');
  }

  // Camera handling for Live Photo
  async function startCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Camera API is not supported in this browser environment. Please upload a selfie or face photo file directly.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(
        `Unable to access webcam (${msg}). Please check browser camera permissions or upload a photo directly.`,
      );
      setCameraActive(false);
    }
  }

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  function snapPhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setPhotoDataUrl(dataUrl);
      stopCamera();
    }
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoDataUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const isManagementRole =
    designation === 'store_manager' ||
    designation === 'assistant_store_manager' ||
    designation === 'team_lead';

  // Validation before proceeding
  function validateCurrentStep(): boolean {
    setError(null);

    if (currentStep === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setError('First Name and Last Name are required.');
        return false;
      }
      if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
        setError('Please enter a valid 10-digit phone number.');
        return false;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address.');
        return false;
      }
      if (!photoDataUrl) {
        setError('Please take a live selfie photo or upload a photo to continue.');
        return false;
      }
      if (!emergencyName.trim() || !emergencyPhone.trim()) {
        setError('Emergency contact name and phone number are required.');
        return false;
      }
    }

    if (currentStep === 2) {
      if (!selectedStoreId) {
        setError('Please select a target store for this employee.');
        return false;
      }
      if (!dateOfJoining) {
        setError('Date of Joining is required.');
        return false;
      }
      if (designation === 'other' && !customDesignation.trim()) {
        setError('Please specify the custom designation name.');
        return false;
      }
    }

    if (currentStep === 3) {
      if (isManagementRole) {
        if (!prevCompany.trim()) {
          setError('Previous company name is required for managerial roles.');
          return false;
        }
        if (!payslip1Name && !payslip2Name && !payslip3Name) {
          setError('Please upload at least one of the last three months payslips.');
          return false;
        }
      }
      if (!aadharNumber.trim() || aadharNumber.replace(/\D/g, '').length < 12) {
        setError('Please enter a valid 12-digit Aadhar Card number.');
        return false;
      }
      if (!panNumber.trim() || panNumber.trim().length !== 10) {
        setError('Please enter a valid 10-character PAN number (e.g. ABCDE1234F).');
        return false;
      }
    }

    if (currentStep === 4) {
      if (!bankAccountHolder.trim()) {
        setError('Account holder name as per passbook is required.');
        return false;
      }
      if (!accountNumber.trim()) {
        setError('Bank account number is required.');
        return false;
      }
      if (accountNumber.trim() !== confirmAccountNumber.trim()) {
        setError('Account numbers do not match. Please verify.');
        return false;
      }
      if (!ifscCode.trim() || ifscCode.trim().length < 11) {
        setError('Please enter a valid 11-character IFSC code.');
        return false;
      }
    }

    return true;
  }

  function handleNext() {
    if (validateCurrentStep()) {
      setCurrentStep((prev) => (Math.min(prev + 1, 6) as WizardStep));
    }
  }

  function handleBack() {
    setError(null);
    setCurrentStep((prev) => (Math.max(prev - 1, 1) as WizardStep));
  }

  async function handleFinalSubmit() {
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    setError(null);

    const fullName = `${firstName.trim()} ${middleName.trim() ? middleName.trim() + ' ' : ''}${lastName.trim()}`.trim();
    const storeObj = stores.find((s) => s.id === selectedStoreId);
    const storeName = storeObj ? storeObj.name : 'Store';

    try {
      // 1. Register employee in authoritative backend
      const created = await createEmployee({
        employee_code: employeeCode.trim().toUpperCase(),
        display_name: fullName,
        home_store_id: selectedStoreId,
        hire_date: dateOfJoining,
        status: 'active',
      });

      // 2. Persist rich onboarding dossier (KYC, Bank, Photo, Role, Salary)
      const dossier: any = {
        employeeId: created.id,
        employeeCode: created.employee_code,
        storeId: selectedStoreId,
        storeName: storeName,
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        lastName: lastName.trim(),
        fullName,
        dob,
        gender,
        maritalStatus,
        livePhotoUrl: photoDataUrl || undefined,
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        emergencyContact: {
          name: emergencyName.trim(),
          relationship: emergencyRelation,
          phone: emergencyPhone.trim(),
        },
        designation,
        customDesignation: designation === 'other' ? customDesignation.trim() : undefined,
        dateOfJoining,
        previousEmployment: isManagementRole
          ? {
              companyName: prevCompany.trim(),
              designation: prevDesignation.trim() || STORE_ROLE_DEFINITIONS[designation].label,
              payslipsUploaded: {
                month1: Boolean(payslip1Name),
                month2: Boolean(payslip2Name),
                month3: Boolean(payslip3Name),
              },
              offerLetterUploaded: Boolean(offerLetterName),
            }
          : undefined,
        kycDocuments: {
          aadharNumber: aadharNumber.trim(),
          aadharUploaded: Boolean(aadharDocName),
          panNumber: panNumber.trim().toUpperCase(),
          panUploaded: Boolean(panDocName),
          otherDocsUploaded: Boolean(otherDocName),
        },
        bankDetails: {
          accountHolderName: bankAccountHolder.trim(),
          bankName,
          branchName: branchName.trim() || undefined,
          accountNumber: accountNumber.trim(),
          ifscCode: ifscCode.trim().toUpperCase(),
          passbookUploaded: Boolean(passbookDocName),
          passbookFileName: passbookDocName || undefined,
        },
        salary: {
          templateName: SALARY_TEMPLATES[selectedSalaryTemplateKey]?.templateName || 'Custom Salary',
          basic: parseFloat(salaryBasic) || 0,
          hra: parseFloat(salaryHra) || 0,
          specialAllowance: parseFloat(salarySpecial) || 0,
          pfDeduction: parseFloat(salaryPf) || 0,
          esiDeduction: parseFloat(salaryEsi) || 0,
          grossSalary: parseFloat(salaryGross) || 0,
          netTakeHome: parseFloat(salaryNet) || 0,
        },
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      saveOnboardingDossier(dossier);

      setSuccessDossier({
        code: created.employee_code,
        name: fullName,
        role: STORE_ROLE_DEFINITIONS[designation]?.label || designation,
        storeName,
      });

      if (onComplete) {
        onComplete(created.employee_code, selectedStoreId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register employee.');
    } finally {
      setSubmitting(false);
    }
  }

  // =========================================================================
  // SUCCESS SCREEN
  // =========================================================================
  if (successDossier) {
    return (
      <Card style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '680px', margin: '1rem auto' }}>
        <div style={{ display: 'inline-flex', padding: '1rem', background: '#ecfdf5', borderRadius: '50%', color: '#10b981', marginBottom: '1rem' }}>
          <CheckCircle2 size={48} />
        </div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
          Staff Registration Successful!
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.95rem', margin: '0 0 1.5rem 0' }}>
          Employee record, photo dossier, KYC credentials, and salary structure have been securely provisioned.
        </p>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', textAlign: 'left', marginBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Employee Name</span>
              <strong>{successDossier.name}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Employee Code</span>
              <span style={{ fontWeight: 700, color: '#0284c7' }}>{successDossier.code}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Designation / Level</span>
              <strong>{successDossier.role}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Assigned Store</span>
              <strong>{successDossier.storeName}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            onClick={() => {
              setSuccessDossier(null);
              setCurrentStep(1);
              setFirstName('');
              setMiddleName('');
              setLastName('');
              setPhone('');
              setEmail('');
              setPhotoDataUrl(null);
            }}
          >
            <UserPlus size={16} /> Register Another Employee
          </Button>

          {onCancel && (
            <Button variant="primary" onClick={onCancel}>
              <Check size={16} /> Finish & Return to Dashboard
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const roleDef = STORE_ROLE_DEFINITIONS[designation];

  return (
    <div className="target-staff-wizard" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header & Back navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: 'none',
                border: 'none',
                color: '#0284c7',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: 0,
                marginBottom: '0.35rem',
              }}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: '#0284c7',
              textTransform: 'uppercase',
            }}
          >
            SUPER ADMIN · WORKFORCE ONBOARDING
          </span>
          <h1 style={{ margin: '0.2rem 0 0.25rem 0', fontSize: '1.65rem', fontWeight: 700 }}>
            Store Staff Registration Wizard
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            Multi-step onboarding for Store Managers, Team Leads, Pickers/Packers, Security, and Associates.
          </p>
        </div>

        <StatusBadge tone="neutral">
          Step {currentStep} of {STEP_LABELS.length}
        </StatusBadge>
      </div>

      {/* Steps Indicator Progress Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${STEP_LABELS.length}, 1fr)`,
          gap: '0.5rem',
          background: '#f8fafc',
          padding: '0.75rem',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        {STEP_LABELS.map((label, idx) => {
          const stepNum = (idx + 1) as WizardStep;
          const isDone = currentStep > stepNum;
          const isCurrent = currentStep === stepNum;
          return (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.5rem',
                borderRadius: '6px',
                background: isCurrent ? '#e0f2fe' : 'transparent',
                border: isCurrent ? '1px solid #7dd3fc' : '1px solid transparent',
              }}
            >
              <span
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: isDone ? '#10b981' : isCurrent ? '#0284c7' : '#cbd5e1',
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {isDone ? <Check size={14} /> : stepNum}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? '#0369a1' : isDone ? '#0f172a' : '#64748b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <ShieldAlert size={18} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Step Container */}
      <Card style={{ padding: '1.75rem' }}>
        {/* ========================================================================= */}
        {/* STEP 1: PERSONAL DETAILS & LIVE PHOTO                                     */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
                Step 1: Personal Details & Live Photo
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                Enter the candidate&apos;s identity details and capture their mandatory live identification photo.
              </p>
            </div>

            {/* Names row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <FormField
                label="First Name *"
                type="text"
                placeholder="e.g. Ramesh"
                value={firstName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
                required
              />
              <FormField
                label="Middle Name"
                type="text"
                placeholder="Optional"
                value={middleName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMiddleName(e.target.value)}
              />
              <FormField
                label="Last Name *"
                type="text"
                placeholder="e.g. Kumar"
                value={lastName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
                required
              />
            </div>

            {/* Demographics row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <FormField
                label="Date of Birth *"
                type="date"
                value={dob}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDob(e.target.value)}
                required
              />
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Gender *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Marital Status *
                </label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value as any)}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </div>
            </div>

            {/* Contact Details row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <FormField
                label="Primary Phone Number *"
                type="tel"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                required
                hint="Used for attendance notifications and SMS OTPs."
              />
              <FormField
                label="Email Address *"
                type="email"
                placeholder="candidate@snr.com"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                required
                hint="Official correspondence and payslip delivery."
              />
            </div>

            {/* Emergency Contact */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                Emergency Contact Details
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <FormField
                  label="Contact Person Name *"
                  type="text"
                  placeholder="e.g. Priya Kumar"
                  value={emergencyName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmergencyName(e.target.value)}
                  required
                />
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                    Relationship *
                  </label>
                  <select
                    value={emergencyRelation}
                    onChange={(e) => setEmergencyRelation(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="Spouse">Spouse</option>
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Brother">Brother</option>
                    <option value="Sister">Sister</option>
                    <option value="Guardian">Guardian</option>
                    <option value="Friend">Friend</option>
                  </select>
                </div>
                <FormField
                  label="Emergency Phone *"
                  type="tel"
                  placeholder="Emergency phone number"
                  value={emergencyPhone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmergencyPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Live Photo Capture Section */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Mandatory Live Candidate Photo *
              </label>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.825rem', color: '#64748b' }}>
                Snap a live webcam selfie or upload a direct face photo for identity verification and kiosk attendance check.
              </p>

              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Photo Preview / Webcam Box */}
                <div
                  style={{
                    width: '280px',
                    height: '240px',
                    borderRadius: '8px',
                    border: cameraActive ? '2px solid #0284c7' : '2px dashed #cbd5e1',
                    background: cameraActive ? '#0f172a' : '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {/* Video Element: permanently mounted so ref is never null when getUserMedia resolves */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: cameraActive ? 'block' : 'none',
                    }}
                  />

                  {/* Live Recording Badge */}
                  {cameraActive && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: '#fff',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        zIndex: 10,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                      }}
                    >
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: '#fff',
                          display: 'inline-block',
                        }}
                      />
                      LIVE WEBCAM
                    </div>
                  )}

                  {/* Captured Photo Preview */}
                  {!cameraActive && photoDataUrl && (
                    <>
                      <img
                        src={photoDataUrl}
                        alt="Candidate live capture"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '10px',
                          left: '10px',
                          background: 'rgba(16, 185, 129, 0.9)',
                          color: '#fff',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          zIndex: 10,
                        }}
                      >
                        <Check size={12} />
                        PHOTO CAPTURED
                      </div>
                    </>
                  )}

                  {/* Empty state placeholder */}
                  {!cameraActive && !photoDataUrl && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>
                      <Camera size={44} style={{ margin: '0 auto 0.5rem auto', strokeWidth: 1.5 }} />
                      <span style={{ fontSize: '0.8rem', display: 'block', color: '#64748b' }}>
                        No live photo captured yet
                      </span>
                    </div>
                  )}
                </div>

                {/* Camera / Upload Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
                  {cameraActive ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button variant="primary" onClick={snapPhoto}>
                        <Camera size={16} /> Snap Live Photo Now
                      </Button>
                      <Button variant="secondary" onClick={stopCamera}>
                        Cancel Camera
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <Button variant="primary" onClick={startCamera}>
                        <Camera size={16} /> Open Device Camera
                      </Button>

                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 1rem',
                          background: '#fff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#334155',
                        }}
                      >
                        <Upload size={16} />
                        Upload Selfie File
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          style={{ display: 'none' }}
                        />
                      </label>

                      {photoDataUrl && (
                        <Button
                          variant="secondary"
                          onClick={() => setPhotoDataUrl(null)}
                          style={{ color: '#ef4444' }}
                        >
                          <RotateCcw size={14} /> Remove Photo
                        </Button>
                      )}
                    </div>
                  )}

                  {cameraError && (
                    <div style={{ fontSize: '0.8rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <AlertCircle size={14} /> {cameraError}
                    </div>
                  )}

                  <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '0.75rem', borderRadius: '6px' }}>
                    <ShieldCheck size={14} style={{ display: 'inline', color: '#16a34a', marginRight: '0.35rem' }} />
                    <strong>Privacy Notice:</strong> Per SNR NEST architecture, photos are stored in private S3 buckets accessed only via short-lived signed URLs. No raw biometric templates or automated face scan points are stored.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: ROLE, STORE & DESIGNATION                                         */}
        {/* ========================================================================= */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
                Step 2: Designation, Store & Role Assignment
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                Select the target work site and designation within the store organizational hierarchy.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {/* Store Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Select Home Store *
                </label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  required
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) · {s.timezone}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                  The employee will be anchored to this store&apos;s physical geofence and roster.
                </span>
              </div>

              {/* Date of Joining */}
              <FormField
                label="Date of Joining *"
                type="date"
                value={dateOfJoining}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateOfJoining(e.target.value)}
                required
                hint="Effective starting date for attendance and payroll."
              />
            </div>

            {/* Designation Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Designation / Position in Store Hierarchy *
              </label>

              <select
                value={designation}
                onChange={(e) => setDesignation(e.target.value as StoreRoleType)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  border: '2px solid #0284c7',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  background: '#f8fafc',
                }}
              >
                <optgroup label="Management Tier">
                  <option value="store_manager">Store Manager (SM)</option>
                  <option value="assistant_store_manager">Assistant Store Manager (ASM)</option>
                  <option value="team_lead">Team Lead (TL)</option>
                </optgroup>
                <optgroup label="Associate / Operational Tier">
                  <option value="picker_packer">Associate (Picker & Packer)</option>
                  <option value="security_guard">Security Guard & Watchman</option>
                  <option value="other">Other (Custom Role Designation)</option>
                </optgroup>
              </select>
            </div>

            {/* If 'Other' chosen, specify custom designation */}
            {designation === 'other' && (
              <FormField
                label="Specify Custom Role / Designation *"
                type="text"
                placeholder="e.g. Inventory Auditor, Dispatch Coordinator"
                value={customDesignation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomDesignation(e.target.value)}
                required
                hint="Will be registered as their official title."
              />
            )}

            {/* Employee Code */}
            <FormField
              label="Authoritative Employee Code"
              type="text"
              value={employeeCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeCode(e.target.value.toUpperCase())}
              required
              hint="Unique system identifier generated automatically; can be customized if your organization uses external codes."
            />

            {/* Role Scope & Authorization Card */}
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <ShieldCheck size={20} style={{ color: '#16a34a' }} />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#14532d' }}>
                  {roleDef.label} — Authorizations & Scope
                </h4>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#166534', marginBottom: '0.75rem' }}>
                <strong>Reporting Line:</strong> Reports directly to <strong>{roleDef.reportingTo}</strong>
              </div>

              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.825rem', color: '#15803d', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {roleDef.authorizations.map((auth, idx) => (
                  <li key={idx}>{auth}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: PREVIOUS EMPLOYMENT & KYC DOCUMENTS                               */}
        {/* ========================================================================= */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
                Step 3: Verification, Previous Employment & KYC Documents
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                {isManagementRole
                  ? 'Managerial candidate verification: previous employment history, payslips, and statutory KYC.'
                  : 'Statutory identity verification and KYC documentation for store staff.'}
              </p>
            </div>

            {/* Conditional Previous Employment for Management Tier */}
            {isManagementRole && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Briefcase size={18} style={{ color: '#0284c7' }} />
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                    Previous Employment Verification ({roleDef.label})
                  </h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                  <FormField
                    label="Previous Employer / Company Name *"
                    type="text"
                    placeholder="e.g. Zepto Retail Ltd, Blinkit, D-Mart"
                    value={prevCompany}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrevCompany(e.target.value)}
                    required
                  />
                  <FormField
                    label="Previous Job Title"
                    type="text"
                    placeholder="e.g. Shift Lead / Supervisor"
                    value={prevDesignation}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrevDesignation(e.target.value)}
                  />
                </div>

                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Last Three Months Pay Slips (Upload) *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                  {[
                    { label: 'Month 1 Payslip', state: payslip1Name, setter: setPayslip1Name },
                    { label: 'Month 2 Payslip', state: payslip2Name, setter: setPayslip2Name },
                    { label: 'Month 3 Payslip', state: payslip3Name, setter: setPayslip3Name },
                  ].map((item, idx) => (
                    <label
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        border: item.state ? '1px solid #10b981' : '1px dashed #cbd5e1',
                        background: item.state ? '#ecfdf5' : '#fff',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      {item.state ? (
                        <>
                          <CheckCircle2 size={20} style={{ color: '#10b981', marginBottom: '0.25rem' }} />
                          <strong style={{ color: '#065f46' }}>{item.state}</strong>
                          <span style={{ fontSize: '0.7rem', color: '#047857' }}>Uploaded</span>
                        </>
                      ) : (
                        <>
                          <FileUp size={20} style={{ color: '#64748b', marginBottom: '0.25rem' }} />
                          <span style={{ fontWeight: 600 }}>{item.label}</span>
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>PDF / Image</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) item.setter(f.name);
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  ))}
                </div>

                {/* Offer Letter Upload */}
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Previous Company Offer Letter / Relieving Certificate
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    background: offerLetterName ? '#ecfdf5' : '#fff',
                    border: offerLetterName ? '1px solid #10b981' : '1px dashed #cbd5e1',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  <FileText size={18} style={{ color: offerLetterName ? '#10b981' : '#64748b' }} />
                  <span>
                    {offerLetterName ? (
                      <strong>Offer/Relieving Letter: {offerLetterName}</strong>
                    ) : (
                      'Click to upload previous company offer letter or relieving letter (PDF)'
                    )}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setOfferLetterName(f.name);
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}

            {/* Statutory KYC: Aadhar & PAN */}
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                Statutory KYC Identity Verification
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {/* Aadhar Card Card */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc' }}>
                  <FormField
                    label="Aadhar Card Number *"
                    type="text"
                    placeholder="12-digit number (XXXX XXXX XXXX)"
                    value={aadharNumber}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAadharNumber(e.target.value)}
                    required
                  />

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '0.65rem 1rem',
                      background: aadharDocName ? '#ecfdf5' : '#fff',
                      border: aadharDocName ? '1px solid #10b981' : '1px dashed #94a3b8',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      marginTop: '0.75rem',
                    }}
                  >
                    <Upload size={14} />
                    <span>{aadharDocName ? `Uploaded: ${aadharDocName}` : 'Upload Aadhar Card (PDF / Image)'}</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setAadharDocName(f.name);
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                {/* PAN Card Card */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc' }}>
                  <FormField
                    label="PAN Card Number *"
                    type="text"
                    placeholder="10-character PAN (e.g. ABCDE1234F)"
                    value={panNumber}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPanNumber(e.target.value.toUpperCase())}
                    required
                  />

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '0.65rem 1rem',
                      background: panDocName ? '#ecfdf5' : '#fff',
                      border: panDocName ? '1px solid #10b981' : '1px dashed #94a3b8',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      marginTop: '0.75rem',
                    }}
                  >
                    <Upload size={14} />
                    <span>{panDocName ? `Uploaded: ${panDocName}` : 'Upload PAN Card (PDF / Image)'}</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setPanDocName(f.name);
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: BANK DETAILS                                                      */}
        {/* ========================================================================= */}
        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
                Step 4: Bank Account & Payment Details
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                Enter verified banking credentials for salary disbursement and direct NEFT/RTGS payroll.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <FormField
                label="Account Holder Name (as per Bank Passbook) *"
                type="text"
                placeholder="Full name on bank account"
                value={bankAccountHolder}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBankAccountHolder(e.target.value)}
                required
                hint="Must match passbook or cancelled cheque exactly."
              />

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Bank Name *
                </label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="State Bank of India">State Bank of India (SBI)</option>
                  <option value="HDFC Bank">HDFC Bank</option>
                  <option value="ICICI Bank">ICICI Bank</option>
                  <option value="Axis Bank">Axis Bank</option>
                  <option value="Punjab National Bank">Punjab National Bank</option>
                  <option value="Bank of Baroda">Bank of Baroda</option>
                  <option value="Canara Bank">Canara Bank</option>
                  <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                  <option value="Union Bank of India">Union Bank of India</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <FormField
                label="Bank Account Number *"
                type="password"
                placeholder="Enter account number"
                value={accountNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccountNumber(e.target.value)}
                required
              />
              <FormField
                label="Confirm Bank Account Number *"
                type="text"
                placeholder="Re-enter to verify match"
                value={confirmAccountNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmAccountNumber(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <FormField
                label="IFSC Code *"
                type="text"
                placeholder="e.g. SBIN0001234"
                value={ifscCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIfscCode(e.target.value.toUpperCase())}
                required
                hint="11-character alphanumeric code printed on cheque or passbook."
              />
              <FormField
                label="Bank Branch Name"
                type="text"
                placeholder="e.g. Indiranagar Branch"
                value={branchName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBranchName(e.target.value)}
              />
            </div>

            {/* Passbook / Cheque Upload */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Bank Passbook / Cancelled Cheque (PDF or Image) *
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  padding: '1.25rem',
                  background: passbookDocName ? '#ecfdf5' : '#f8fafc',
                  border: passbookDocName ? '1px solid #10b981' : '2px dashed #cbd5e1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {passbookDocName ? (
                  <>
                    <CheckCircle2 size={24} style={{ color: '#10b981' }} />
                    <div>
                      <strong style={{ color: '#065f46', display: 'block' }}>Passbook Document Uploaded</strong>
                      <span style={{ fontSize: '0.8rem', color: '#047857' }}>{passbookDocName}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <CreditCard size={24} style={{ color: '#64748b' }} />
                    <div>
                      <span style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>
                        Click to upload bank passbook first page or cancelled cheque
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Accepts PDF, PNG, JPG (Max 5MB)
                      </span>
                    </div>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPassbookDocName(f.name);
                  }}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 5: SALARY STRUCTURE & COMPENSATION                                    */}
        {/* ========================================================================= */}
        {currentStep === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
                Step 5: Salary Structure & Compensation Template
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                Store Admin salary templates for this role, with full breakdown customization for individual employees.
              </p>
            </div>

            {/* Template Selector Dropdown */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.4rem', color: '#0f172a' }}>
                Select Store Admin Salary Template
              </label>
              <select
                value={selectedSalaryTemplateKey}
                onChange={(e) => {
                  setSelectedSalaryTemplateKey(e.target.value);
                  applySalaryTemplate(e.target.value);
                }}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #94a3b8',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  background: '#fff',
                }}
              >
                {Object.entries(SALARY_TEMPLATES).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.templateName}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', display: 'block' }}>
                Pre-configures statutory Basic, HRA, and allowances. You can edit any individual field below.
              </span>
            </div>

            {/* Editable Line-Item Breakdown Grid */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                  Monthly Compensation Line-Item Breakdown
                </h4>
                <StatusBadge tone="neutral">Customizable</StatusBadge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <FormField
                  label="Basic Pay (₹) *"
                  type="number"
                  value={salaryBasic}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSalaryComponentChange(e.target.value, salaryHra, salarySpecial, salaryPf, salaryEsi)
                  }
                  required
                />
                <FormField
                  label="House Rent Allowance (HRA) (₹)"
                  type="number"
                  value={salaryHra}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSalaryComponentChange(salaryBasic, e.target.value, salarySpecial, salaryPf, salaryEsi)
                  }
                  required
                />
                <FormField
                  label="Special / Operational Allowance (₹)"
                  type="number"
                  value={salarySpecial}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSalaryComponentChange(salaryBasic, salaryHra, e.target.value, salaryPf, salaryEsi)
                  }
                  required
                />
              </div>

              {/* Deductions Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
                <FormField
                  label="Statutory PF Contribution (₹)"
                  type="number"
                  value={salaryPf}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSalaryComponentChange(salaryBasic, salaryHra, salarySpecial, e.target.value, salaryEsi)
                  }
                  hint="Standard 12% cap (₹1,800/mo) or wage percentage."
                />
                <FormField
                  label="ESI / Health Insurance (₹)"
                  type="number"
                  value={salaryEsi}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSalaryComponentChange(salaryBasic, salaryHra, salarySpecial, salaryPf, e.target.value)
                  }
                  hint="Applicable for gross wages under ₹21,000/mo."
                />
              </div>

              {/* Calculated Totals Summary Box */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  background: '#f1f5f9',
                  padding: '1rem',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Gross Monthly CTC / Wage
                  </span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
                    ₹{Number(salaryGross).toLocaleString('en-IN')}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.8rem', color: '#059669', textTransform: 'uppercase', fontWeight: 600 }}>
                    Estimated Net In-Hand Take-Home
                  </span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
                    ₹{Number(salaryNet).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>

            {/* SRS Compliance Alert */}
            <div
              style={{
                padding: '0.75rem 1rem',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '6px',
                color: '#92400e',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={16} />
              <span>
                <strong>SRS Rule:</strong> Until P-01 through P-10 payroll policies are officially sealed, all newly provisioned payroll calculation runs remain clearly tagged as <em>Draft - Not for payment</em>.
              </span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 6: REVIEW & CONFIRM                                                  */}
        {/* ========================================================================= */}
        {currentStep === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
                Step 6: Review Candidate Dossier & Confirm Registration
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                Please review all information before provisioning this employee into the store workforce.
              </p>
            </div>

            {/* Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {/* Box 1: Personal & Photo */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  {photoDataUrl ? (
                    <img
                      src={photoDataUrl}
                      alt="Candidate"
                      style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #0284c7' }}
                    />
                  ) : (
                    <User size={36} style={{ color: '#94a3b8' }} />
                  )}
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                      {firstName} {middleName} {lastName}
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {gender} · {maritalStatus} · DOB: {dob}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.825rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div>📞 {phone}</div>
                  <div>✉️ {email}</div>
                  <div>🚨 Emergency: {emergencyName} ({emergencyRelation}) - {emergencyPhone}</div>
                </div>
              </div>

              {/* Box 2: Store & Role */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 700 }}>Store & Role Assignment</h4>
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Target Store:</span>{' '}
                    <strong>{stores.find((s) => s.id === selectedStoreId)?.name || 'Selected Store'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Designation:</span>{' '}
                    <span style={{ fontWeight: 700, color: '#0284c7' }}>
                      {designation === 'other' ? customDesignation : roleDef.label}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Employee Code:</span>{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{employeeCode}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Joining Date:</span>{' '}
                    <strong>{dateOfJoining}</strong>
                  </div>
                </div>
              </div>

              {/* Box 3: Verification & KYC */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 700 }}>Identity & KYC</h4>
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Aadhar Card:</span>{' '}
                    <strong>{aadharNumber}</strong> ({aadharDocName ? 'Document Attached' : 'Number Verified'})
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>PAN Card:</span>{' '}
                    <strong>{panNumber}</strong> ({panDocName ? 'Document Attached' : 'Number Verified'})
                  </div>
                  {isManagementRole && (
                    <div>
                      <span style={{ color: '#64748b' }}>Previous Employer:</span>{' '}
                      <strong>{prevCompany}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Box 4: Bank & Salary */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 700 }}>Bank & Salary Structure</h4>
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Bank:</span> <strong>{bankName}</strong> ({ifscCode})
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Account:</span>{' '}
                    <span style={{ fontFamily: 'monospace' }}>•••• {accountNumber.slice(-4)}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Gross Monthly:</span>{' '}
                    <strong>₹{Number(salaryGross).toLocaleString('en-IN')}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#059669' }}>Net Take-Home:</span>{' '}
                    <strong style={{ color: '#059669' }}>₹{Number(salaryNet).toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step Navigation Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          {currentStep > 1 ? (
            <Button variant="secondary" onClick={handleBack} disabled={submitting}>
              <ArrowLeft size={16} /> Back to Step {currentStep - 1}
            </Button>
          ) : (
            <div />
          )}

          {currentStep < 6 ? (
            <Button variant="primary" onClick={handleNext}>
              Continue to {STEP_LABELS[currentStep]} <ArrowRight size={16} />
            </Button>
          ) : (
            <Button variant="primary" onClick={handleFinalSubmit} disabled={submitting}>
              <CheckCircle2 size={16} />
              {submitting ? 'Registering Staff Member…' : 'Confirm & Register Employee'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

