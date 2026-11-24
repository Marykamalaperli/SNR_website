import React, { useState } from 'react';
import {
  User,
  Briefcase,
  CreditCard,
  Calculator,
  FileText,
  Building2,
  Calendar,
  Phone,
  Mail,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Download,
  Upload,
  Lock,
  Clock,
  HeartHandshake,
  Check,
  FileCheck,
  X,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import FormField from '../../components/forms/FormField';
import StatusBadge from '../../components/common/StatusBadge';
import { useAuth } from '../../hooks/useAuth';
import {
  getCurrentEmployeeDossier,
  StaffOnboardingDossier,
  STORE_ROLE_DEFINITIONS,
  updateEmployeeBankDetails,
} from '../../services/staffOnboardingService';

type ProfileTab = 'basic' | 'experience' | 'bank' | 'salary' | 'documents';
type DocumentCategory = 'all' | 'kyc' | 'offer' | 'joining' | 'payslips' | 'bank';

export default function TargetEmployeeProfile() {
  const { session } = useAuth();
  const [dossier, setDossier] = useState<StaffOnboardingDossier>(() =>
    getCurrentEmployeeDossier(session),
  );
  const [activeTab, setActiveTab] = useState<ProfileTab>('basic');
  const [docCategory, setDocCategory] = useState<DocumentCategory>('all');
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  // Bank edit state
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editHolderName, setEditHolderName] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editBranchName, setEditBranchName] = useState('');
  const [editAccountNumber, setEditAccountNumber] = useState('');
  const [editConfirmAccountNumber, setEditConfirmAccountNumber] = useState('');
  const [editIfscCode, setEditIfscCode] = useState('');
  const [editPassbookFileName, setEditPassbookFileName] = useState('');
  const [bankSaveError, setBankSaveError] = useState('');
  const [bankSuccessBanner, setBankSuccessBanner] = useState('');

  // Document preview modal state
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    type: string;
    category: string;
    date: string;
    filename: string;
    verified: boolean;
  } | null>(null);

  const roleDef =
    STORE_ROLE_DEFINITIONS[dossier.designation] || STORE_ROLE_DEFINITIONS.picker_packer;

  // Open edit modal with current bank details
  const handleOpenBankModal = () => {
    setEditHolderName(dossier.bankDetails.accountHolderName);
    setEditBankName(dossier.bankDetails.bankName);
    setEditBranchName(dossier.bankDetails.branchName || '');
    setEditAccountNumber(dossier.bankDetails.accountNumber);
    setEditConfirmAccountNumber(dossier.bankDetails.accountNumber);
    setEditIfscCode(dossier.bankDetails.ifscCode);
    setEditPassbookFileName(dossier.bankDetails.passbookFileName || 'passbook_verified.pdf');
    setBankSaveError('');
    setBankModalOpen(true);
  };

  const handleSaveBankDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setBankSaveError('');

    if (!editHolderName.trim()) {
      setBankSaveError('Account holder name is required.');
      return;
    }
    if (!editBankName.trim()) {
      setBankSaveError('Bank name is required.');
      return;
    }
    if (!editAccountNumber.trim()) {
      setBankSaveError('Account number is required.');
      return;
    }
    if (editAccountNumber !== editConfirmAccountNumber) {
      setBankSaveError('Account numbers do not match. Please re-enter.');
      return;
    }
    const cleanIfsc = editIfscCode.trim().toUpperCase();
    if (!cleanIfsc || cleanIfsc.length !== 11) {
      setBankSaveError('IFSC code must be exactly 11 characters (e.g., HDFC0001234).');
      return;
    }

    const updated = updateEmployeeBankDetails(dossier.employeeId, {
      accountHolderName: editHolderName.trim(),
      bankName: editBankName.trim(),
      branchName: editBranchName.trim(),
      accountNumber: editAccountNumber.trim(),
      ifscCode: cleanIfsc,
      passbookUploaded: true,
      passbookFileName: editPassbookFileName || 'updated_passbook.pdf',
    });

    setDossier(updated);
    setBankModalOpen(false);
    setBankSuccessBanner('Bank details updated successfully and synchronized with payroll.');
    setTimeout(() => setBankSuccessBanner(''), 6000);
  };

  // Document list
  const documentsList = [
    {
      id: 'aadhar',
      category: 'kyc',
      title: 'Aadhar Card',
      type: 'National Identity Proof',
      number: dossier.kycDocuments.aadharNumber,
      filename: `aadhar_${dossier.employeeCode.toLowerCase()}.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'pan',
      category: 'kyc',
      title: 'PAN Card',
      type: 'Tax & Permanent Account Number',
      number: dossier.kycDocuments.panNumber,
      filename: `pan_${dossier.employeeCode.toLowerCase()}.jpg`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'offer',
      category: 'offer',
      title: 'Official Offer Letter',
      type: 'SNR NEST Employment Offer',
      number: `SNR-OFR-${dossier.employeeCode}`,
      filename: `Offer_Letter_${dossier.employeeCode}.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'joining',
      category: 'joining',
      title: 'Joining & Appointment Letter',
      type: 'Store Placement Confirmation',
      number: `SNR-APPT-${dossier.employeeCode}`,
      filename: `Appointment_Letter_${dossier.employeeCode}.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'payslip1',
      category: 'payslips',
      title: 'Pay Slip — Month 1 (Previous Employer)',
      type: 'Income Verification',
      number: 'DOC-PS-M1',
      filename: `payslip_month_1.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'payslip2',
      category: 'payslips',
      title: 'Pay Slip — Month 2 (Previous Employer)',
      type: 'Income Verification',
      number: 'DOC-PS-M2',
      filename: `payslip_month_2.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'payslip3',
      category: 'payslips',
      title: 'Pay Slip — Month 3 (Previous Employer)',
      type: 'Income Verification',
      number: 'DOC-PS-M3',
      filename: `payslip_month_3.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'bank_doc',
      category: 'bank',
      title: 'Bank Passbook / Cancelled Cheque',
      type: 'Banking Proof',
      number: dossier.bankDetails.ifscCode,
      filename: dossier.bankDetails.passbookFileName || 'passbook_record.pdf',
      date: dossier.dateOfJoining,
      verified: true,
    },
  ];

  const filteredDocuments =
    docCategory === 'all' ? documentsList : documentsList.filter((d) => d.category === docCategory);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* --------------------------------------------------------------------- */}
      {/* HEADER PROFILE HERO CARD                                             */}
      {/* --------------------------------------------------------------------- */}
      <Card
        className="profile-hero-card"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          padding: '1.75rem',
          borderRadius: '14px',
          marginBottom: '1.5rem',
          border: '1px solid #334155',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {/* Live photo / avatar */}
            <div
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                background: '#f4a261',
                color: '#1e2d35',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                fontWeight: 700,
                border: '3px solid #ffffff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {dossier.livePhotoUrl ? (
                <img
                  src={dossier.livePhotoUrl}
                  alt={dossier.fullName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                dossier.firstName.charAt(0) + (dossier.lastName ? dossier.lastName.charAt(0) : '')
              )}
            </div>

            <div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
              >
                <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
                  {dossier.fullName}
                </h1>
                <span
                  style={{
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.65rem',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <CheckCircle2 size={13} /> Active Employee
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  marginTop: '0.4rem',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: '#f4a261', fontWeight: 600 }}>{roleDef.label}</span>
                <span>•</span>
                <span>
                  Code: <strong>{dossier.employeeCode}</strong>
                </span>
                <span>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Building2 size={14} /> {dossier.storeName || 'Development Store'}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '0.35rem',
              textAlign: 'right',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Official Staff Dossier
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: '#38bdf8',
                fontSize: '0.825rem',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={16} /> Verified Store Placement
            </div>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              Joined:{' '}
              {new Date(dossier.dateOfJoining).toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Success banner if bank updated */}
      {bankSuccessBanner && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: '8px',
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#065f46',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          <CheckCircle2 size={20} color="#059669" />
          <span>{bankSuccessBanner}</span>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* NAVIGATION TABS                                                       */}
      {/* --------------------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '2px solid #e2e8f0',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {[
          { id: 'basic', label: 'Basic Info', icon: User },
          { id: 'experience', label: 'Previous Experience', icon: Briefcase },
          { id: 'bank', label: 'Bank Details', icon: CreditCard, badge: 'Editable' },
          { id: 'salary', label: 'Salary Structure', icon: Calculator },
          { id: 'documents', label: 'Documents', icon: FileText, count: documentsList.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ProfileTab)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.15rem',
                border: 'none',
                background: isActive ? '#f4a261' : 'transparent',
                color: isActive ? '#1e2d35' : '#64748b',
                fontWeight: isActive ? 700 : 600,
                fontSize: '0.925rem',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                position: 'relative',
              }}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  style={{
                    background: isActive ? '#1e2d35' : '#e2e8f0',
                    color: isActive ? '#ffffff' : '#475569',
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  {tab.badge}
                </span>
              )}
              {tab.count !== undefined && (
                <span
                  style={{
                    background: isActive ? '#1e2d35' : '#e2e8f0',
                    color: isActive ? '#ffffff' : '#475569',
                    fontSize: '0.75rem',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '999px',
                    fontWeight: 700,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* TAB 1: BASIC INFO                                                     */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'basic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Personal Demographics */}
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem',
              }}
            >
              <User size={20} className="text-primary" />
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                Personal Information & Demographics
              </h2>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1.25rem',
              }}
            >
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                  First Name
                </span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, fontSize: '0.95rem' }}>
                  {dossier.firstName}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                  Middle Name
                </span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, fontSize: '0.95rem' }}>
                  {dossier.middleName || '—'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                  Last Name
                </span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, fontSize: '0.95rem' }}>
                  {dossier.lastName}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                  Date of Birth
                </span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, fontSize: '0.95rem' }}>
                  {dossier.dob}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                  Gender
                </span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, fontSize: '0.95rem' }}>
                  {dossier.gender}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                  Marital Status
                </span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, fontSize: '0.95rem' }}>
                  {dossier.maritalStatus}
                </p>
              </div>
            </div>
          </Card>

          {/* Contact Details & Emergency */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.5rem',
            }}
          >
            <Card>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1.25rem',
                }}
              >
                <Phone size={19} className="text-primary" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Contact Details</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Primary Mobile Number
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginTop: '0.2rem',
                    }}
                  >
                    <Phone size={15} color="#64748b" />
                    <strong>{dossier.phone}</strong>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Official / Login Email
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginTop: '0.2rem',
                    }}
                  >
                    <Mail size={15} color="#64748b" />
                    <strong>{dossier.email}</strong>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Work Location</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginTop: '0.2rem',
                    }}
                  >
                    <Building2 size={15} color="#64748b" />
                    <strong>{dossier.storeName || 'Development Store'}</strong>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1.25rem',
                }}
              >
                <HeartHandshake size={19} color="#e76f51" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  Emergency Contact
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Contact Person</span>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>
                    {dossier.emergencyContact.name}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Relationship</span>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>
                    {dossier.emergencyContact.relationship}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Emergency Phone</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginTop: '0.2rem',
                    }}
                  >
                    <Phone size={15} color="#e76f51" />
                    <strong style={{ color: '#b91c1c' }}>{dossier.emergencyContact.phone}</strong>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Store & Workplace Assignment */}
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem',
              }}
            >
              <Building2 size={20} className="text-primary" />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                Store & Designation Assignment
              </h3>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1.25rem',
              }}
            >
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Designation</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 700, color: '#0f766e' }}>
                  {roleDef.label}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Reporting Line</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{roleDef.reportingTo}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Date of Joining</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{dossier.dateOfJoining}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Shift Assignment</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>
                  General Shift · 09:00 – 18:00
                </p>
              </div>
            </div>

            <div
              style={{
                marginTop: '1.25rem',
                padding: '0.85rem 1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '0.35rem',
                }}
              >
                Operational Role Authorizations:
              </div>
              <ul
                style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#475569' }}
              >
                {roleDef.authorizations.map((auth, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>
                    {auth}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 2: PREVIOUS EXPERIENCE                                            */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'experience' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Briefcase size={20} className="text-primary" />
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  Previous Employment & Tenure History
                </h2>
              </div>
              <StatusBadge tone="positive">HR Verified</StatusBadge>
            </div>

            {dossier.previousEmployment?.companyName ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '1.25rem',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <span
                      style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}
                    >
                      Previous Employer / Company
                    </span>
                    <p
                      style={{
                        margin: '0.25rem 0 0',
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        color: '#1e293b',
                      }}
                    >
                      {dossier.previousEmployment.companyName}
                    </p>
                  </div>

                  <div>
                    <span
                      style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}
                    >
                      Last Held Designation
                    </span>
                    <p style={{ margin: '0.25rem 0 0', fontWeight: 600, fontSize: '1rem' }}>
                      {dossier.previousEmployment.designation || 'Operations Team'}
                    </p>
                  </div>

                  <div>
                    <span
                      style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}
                    >
                      Verification Status
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        marginTop: '0.25rem',
                        color: '#16a34a',
                        fontWeight: 600,
                      }}
                    >
                      <CheckCircle2 size={16} /> Background Check Cleared
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                    Uploaded Previous Employment Documents:
                  </h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    <div
                      style={{
                        padding: '1rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileCheck size={24} color="#16a34a" />
                        <div>
                          <strong>Last 3 Months Pay Slips</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            Month 1, 2 & 3 verified
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActiveTab('documents');
                          setDocCategory('payslips');
                        }}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      >
                        View Slips
                      </Button>
                    </div>

                    <div
                      style={{
                        padding: '1rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileCheck size={24} color="#16a34a" />
                        <div>
                          <strong>Previous Offer / Relieving Letter</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            Formal clearance letter
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActiveTab('documents');
                          setDocCategory('offer');
                        }}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      >
                        View Letter
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  color: '#64748b',
                }}
              >
                <p style={{ margin: 0, fontWeight: 600 }}>
                  Joined as Direct Entry / Store Associate.
                </p>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                  No prior supervisory employment documents were required for this position.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 3: BANK DETAILS (WITH THE EDIT OPTION AS REQUESTED)               */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'bank' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={22} className="text-primary" />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                    Official Salary & Bank Account Details
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#64748b' }}>
                    Direct deposit account for monthly payroll disbursements.
                  </p>
                </div>
              </div>

              {/* ONLY EDIT OPTION AS REQUESTED */}
              <Button
                variant="primary"
                onClick={handleOpenBankModal}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Edit3 size={16} /> Edit Bank Details
              </Button>
            </div>

            <div
              style={{
                background: 'linear-gradient(135deg, #fdfbf7 0%, #fff 100%)',
                border: '2px solid #fed7aa',
                borderRadius: '12px',
                padding: '1.5rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1.5rem',
                boxShadow: '0 2px 8px rgba(244, 162, 97, 0.1)',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '0.775rem',
                    color: '#9a3412',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Account Holder Name (As Per Passbook)
                </span>
                <p
                  style={{
                    margin: '0.25rem 0 0',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    color: '#1e293b',
                  }}
                >
                  {dossier.bankDetails.accountHolderName}
                </p>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '0.775rem',
                    color: '#9a3412',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Bank Name
                </span>
                <p
                  style={{
                    margin: '0.25rem 0 0',
                    fontWeight: 700,
                    fontSize: '1.05rem',
                    color: '#1e293b',
                  }}
                >
                  {dossier.bankDetails.bankName}
                </p>
                {dossier.bankDetails.branchName && (
                  <small style={{ color: '#64748b' }}>
                    Branch: {dossier.bankDetails.branchName}
                  </small>
                )}
              </div>

              <div>
                <span
                  style={{
                    fontSize: '0.775rem',
                    color: '#9a3412',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Account Number
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginTop: '0.25rem',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '1.15rem',
                      letterSpacing: '0.05em',
                      color: '#0f172a',
                    }}
                  >
                    {showAccountNumber
                      ? dossier.bankDetails.accountNumber
                      : '••••••••' + dossier.bankDetails.accountNumber.slice(-4)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAccountNumber(!showAccountNumber)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748b',
                      padding: '0.2rem',
                    }}
                    title={showAccountNumber ? 'Hide account number' : 'Show account number'}
                  >
                    {showAccountNumber ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '0.775rem',
                    color: '#9a3412',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  IFSC Code
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginTop: '0.25rem',
                  }}
                >
                  <span
                    style={{
                      background: '#ffedd5',
                      color: '#9a3412',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '1rem',
                    }}
                  >
                    {dossier.bankDetails.ifscCode}
                  </span>
                  <StatusBadge tone="positive">Valid IFSC</StatusBadge>
                </div>
              </div>
            </div>

            {/* Document proof row */}
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <FileCheck size={24} color="#16a34a" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Uploaded Bank Proof:{' '}
                    {dossier.bankDetails.passbookFileName || 'passbook_record.pdf'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Passbook / Cancelled Cheque verified by Store Accounts
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPreviewDoc({
                      title: 'Bank Passbook / Cancelled Cheque',
                      type: 'Banking Proof Document',
                      category: 'bank',
                      date: dossier.dateOfJoining,
                      filename: dossier.bankDetails.passbookFileName || 'passbook_record.pdf',
                      verified: true,
                    })
                  }
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  <Eye size={14} /> View Passbook
                </Button>
              </div>
            </div>

            <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              🔒 Bank information is encrypted and transmitted directly to the organization's
              automated payout gateway. Only bank details can be edited directly by the employee.
            </p>
          </Card>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 4: SALARY STRUCTURE                                               */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'salary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calculator size={20} className="text-primary" />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                    Assigned Salary Structure & Compensation
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#64748b' }}>
                    {dossier.salary.templateName}
                  </p>
                </div>
              </div>
              <StatusBadge tone="positive">Effective</StatusBadge>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '1.25rem',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                  Gross Monthly CTC
                </span>
                <p
                  style={{
                    margin: '0.25rem 0 0',
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: '#1e293b',
                  }}
                >
                  ₹{dossier.salary.grossSalary.toLocaleString('en-IN')}
                </p>
              </div>

              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #10b981',
                  borderRadius: '10px',
                  padding: '1.25rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: '#047857',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Estimated Net Take-Home
                </span>
                <p
                  style={{
                    margin: '0.25rem 0 0',
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: '#065f46',
                  }}
                >
                  ₹{dossier.salary.netTakeHome.toLocaleString('en-IN')}
                </p>
              </div>

              <div
                style={{
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  borderRadius: '10px',
                  padding: '1.25rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: '#c2410c',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Total Deductions (PF/ESI)
                </span>
                <p
                  style={{
                    margin: '0.25rem 0 0',
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: '#9a3412',
                  }}
                >
                  ₹
                  {(dossier.salary.pfDeduction + dossier.salary.esiDeduction).toLocaleString(
                    'en-IN',
                  )}
                </p>
              </div>
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.9rem',
              }}
            >
              <thead>
                <tr
                  style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}
                >
                  <th style={{ padding: '0.6rem 0' }}>Component</th>
                  <th style={{ padding: '0.6rem 0' }}>Classification</th>
                  <th style={{ padding: '0.6rem 0', textAlign: 'right' }}>Monthly Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>Basic Pay</td>
                  <td style={{ padding: '0.75rem 0', color: '#64748b' }}>Earnings</td>
                  <td style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: 600 }}>
                    ₹{dossier.salary.basic.toLocaleString('en-IN')}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>
                    House Rent Allowance (HRA)
                  </td>
                  <td style={{ padding: '0.75rem 0', color: '#64748b' }}>Earnings</td>
                  <td style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: 600 }}>
                    ₹{dossier.salary.hra.toLocaleString('en-IN')}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>Special Allowance</td>
                  <td style={{ padding: '0.75rem 0', color: '#64748b' }}>Earnings</td>
                  <td style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: 600 }}>
                    ₹{dossier.salary.specialAllowance.toLocaleString('en-IN')}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#b91c1c' }}>
                  <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>
                    Provident Fund (PF Employee)
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>Statutory Deduction</td>
                  <td style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: 600 }}>
                    - ₹{dossier.salary.pfDeduction.toLocaleString('en-IN')}
                  </td>
                </tr>
                {dossier.salary.esiDeduction > 0 && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#b91c1c' }}>
                    <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>
                      Employee State Insurance (ESI)
                    </td>
                    <td style={{ padding: '0.75rem 0' }}>Statutory Deduction</td>
                    <td style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: 600 }}>
                      - ₹{dossier.salary.esiDeduction.toLocaleString('en-IN')}
                    </td>
                  </tr>
                )}
                <tr style={{ borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                  <td style={{ padding: '0.85rem 0', fontSize: '1rem' }}>Net Take-Home Pay</td>
                  <td style={{ padding: '0.85rem 0', color: '#059669' }}>Disbursed to Bank</td>
                  <td
                    style={{
                      padding: '0.85rem 0',
                      textAlign: 'right',
                      fontSize: '1.1rem',
                      color: '#059669',
                    }}
                  >
                    ₹{dossier.salary.netTakeHome.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tbody>
            </table>

            <div
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 1rem',
                background: '#f8fafc',
                borderRadius: '6px',
                borderLeft: '4px solid #f4a261',
                fontSize: '0.8rem',
                color: '#64748b',
              }}
            >
              Draft — Official SNR NEST store salary template per SRS P-01/P-08 compliance. Only
              Store Admin and HR can reassign templates.
            </div>
          </Card>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 5: DOCUMENTS (PERSONAL DETAILS, OFFER LETTER, PAYSLIPS, JOINING)   */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={20} className="text-primary" />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                    Employee Document Repository & Dossier
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#64748b' }}>
                    Verified onboarding records, identity proofs, letters, and payslips.
                  </p>
                </div>
              </div>
              <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
                Total Documents: <strong>{documentsList.length}</strong>
              </span>
            </div>

            {/* Document Sub-Category Pills as requested */}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
              }}
            >
              {[
                { id: 'all', label: 'All Documents' },
                { id: 'kyc', label: 'Personal Details & KYC' },
                { id: 'offer', label: 'Offer Letter' },
                { id: 'joining', label: 'Joining Letter' },
                { id: 'payslips', label: 'Pay Slips' },
                { id: 'bank', label: 'Bank Proof' },
              ].map((cat) => {
                const isSelected = docCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setDocCategory(cat.id as DocumentCategory)}
                    style={{
                      background: isSelected ? '#1e293b' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : '#475569',
                      border: 'none',
                      borderRadius: '999px',
                      padding: '0.4rem 0.85rem',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Document Cards Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                gap: '1rem',
              }}
            >
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '1.15rem',
                    background: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div
                        style={{
                          background: '#fef3c7',
                          color: '#b45309',
                          padding: '0.35rem',
                          borderRadius: '8px',
                          display: 'inline-flex',
                        }}
                      >
                        <FileText size={20} />
                      </div>
                      <span
                        style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <Check size={12} /> Verified
                      </span>
                    </div>

                    <h4
                      style={{
                        margin: '0 0 0.25rem 0',
                        fontSize: '0.975rem',
                        fontWeight: 700,
                        color: '#1e293b',
                      }}
                    >
                      {doc.title}
                    </h4>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.35rem' }}>
                      {doc.type}
                    </div>
                    {doc.number && (
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.775rem',
                          background: '#f8fafc',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          display: 'inline-block',
                          color: '#334155',
                          marginBottom: '0.75rem',
                        }}
                      >
                        {doc.number}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{doc.filename}</span>

                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <Button
                        variant="secondary"
                        onClick={() => setPreviewDoc(doc)}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      >
                        <Eye size={13} /> View
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          alert(`Downloading verified copy of "${doc.filename}"`);
                        }}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      >
                        <Download size={13} /> Download
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* EDIT BANK DETAILS MODAL (ONLY EDIT OPTION AS REQUESTED)               */}
      {/* --------------------------------------------------------------------- */}
      {bankModalOpen && (
        <Modal onClose={() => setBankModalOpen(false)} title="Edit Bank Account Details">
          <p className="muted" style={{ margin: '0 0 1rem 0', fontSize: '0.85rem' }}>
            Direct deposit account for payroll disbursement. Updates are logged to audit records.
          </p>
          <form onSubmit={handleSaveBankDetails}>
            {bankSaveError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #f87171',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  color: '#b91c1c',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={16} />
                <span>{bankSaveError}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormField
                label="Account Holder Name (As per Bank Passbook)"
                type="text"
                value={editHolderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditHolderName(e.target.value)
                }
                required
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FormField
                  label="Bank Name"
                  type="text"
                  placeholder="e.g. HDFC Bank, SBI, ICICI"
                  value={editBankName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEditBankName(e.target.value)
                  }
                  required
                />
                <FormField
                  label="Branch Name"
                  type="text"
                  placeholder="e.g. Madhapur, Indiranagar"
                  value={editBranchName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEditBranchName(e.target.value)
                  }
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FormField
                  label="Account Number"
                  type="text"
                  value={editAccountNumber}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEditAccountNumber(e.target.value)
                  }
                  required
                />
                <FormField
                  label="Confirm Account Number"
                  type="text"
                  value={editConfirmAccountNumber}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEditConfirmAccountNumber(e.target.value)
                  }
                  required
                />
              </div>

              <FormField
                label="IFSC Code (11 alphanumeric characters)"
                type="text"
                placeholder="e.g. HDFC0001234"
                value={editIfscCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditIfscCode(e.target.value.toUpperCase())
                }
                required
              />

              <div
                style={{
                  border: '1px dashed #cbd5e1',
                  borderRadius: '8px',
                  padding: '1rem',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    Supporting Proof: {editPassbookFileName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Updated Passbook / Cancelled Cheque scan
                  </div>
                </div>
                <label
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <Upload size={14} /> Replace File
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setEditPassbookFileName(file.name);
                    }}
                  />
                </label>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1.5rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <Button variant="secondary" onClick={() => setBankModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Save & Update Bank Details
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* DOCUMENT PREVIEW MODAL                                                */}
      {/* --------------------------------------------------------------------- */}
      {previewDoc && (
        <Modal onClose={() => setPreviewDoc(null)} title={previewDoc.title}>
          <p className="muted" style={{ margin: '0 0 1rem 0', fontSize: '0.85rem' }}>
            {`Verified official document for ${dossier.fullName} (${dossier.employeeCode})`}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  padding: '1rem',
                  borderRadius: '50%',
                  background: '#fef3c7',
                  color: '#b45309',
                  marginBottom: '0.75rem',
                }}
              >
                <FileText size={40} />
              </div>
              <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 700 }}>
                {previewDoc.filename}
              </h3>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Classification: {previewDoc.type}
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  marginTop: '0.75rem',
                  background: '#dcfce7',
                  color: '#15803d',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                <ShieldCheck size={14} /> HR Verified & Encrypted
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  padding: '0.75rem',
                  borderRadius: '6px',
                }}
              >
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                  Upload / Issuance Date:
                </span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{previewDoc.date}</p>
              </div>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  padding: '0.75rem',
                  borderRadius: '6px',
                }}
              >
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Storage Security:</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>
                  Private S3 · Signed URL Access
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <Button variant="secondary" onClick={() => setPreviewDoc(null)}>
                Close Preview
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  alert(`Downloading ${previewDoc.filename}...`);
                }}
              >
                <Download size={14} /> Download File
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
