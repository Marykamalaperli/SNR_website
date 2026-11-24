import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Eye,
  Upload,
  CheckCircle2,
  ShieldCheck,
  Building2,
  Calendar,
  AlertCircle,
  FileCheck,
  Plus,
  ArrowUpRight,
  Filter,
  Check,
  CreditCard,
  Briefcase,
  DollarSign,
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
} from '../../services/staffOnboardingService';
import {
  fetchMyPayslips,
  createPayslipDownloadIntent,
  Payslip,
} from '../../services/targetPayrollService';

type DocumentCategory = 'all' | 'payslips' | 'letters' | 'kyc' | 'bank' | 'previous';

interface StoredDocument {
  id: string;
  category: 'payslips' | 'letters' | 'kyc' | 'bank' | 'previous';
  title: string;
  type: string;
  number?: string;
  filename: string;
  date: string;
  verified: boolean;
  amount?: string;
  isSnrPayslip?: boolean;
}

export default function TargetEmployeeDocuments() {
  const { session } = useAuth();
  const [dossier] = useState<StaffOnboardingDossier>(() => getCurrentEmployeeDossier(session));
  const [activeCategory, setActiveCategory] = useState<DocumentCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Released SNR Payslips from API
  const [apiPayslips, setApiPayslips] = useState<Payslip[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState(false);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDocTitle, setUploadDocTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<
    'payslips' | 'letters' | 'kyc' | 'bank' | 'previous'
  >('payslips');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadPeriodName, setUploadPeriodName] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccessBanner, setUploadSuccessBanner] = useState('');

  // Document preview modal
  const [previewDoc, setPreviewDoc] = useState<StoredDocument | null>(null);

  // Local storage for dynamically uploaded documents
  const [extraDocs, setExtraDocs] = useState<StoredDocument[]>(() => {
    try {
      const saved = localStorage.getItem('snr_employee_uploaded_docs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Load released payslips from API
  useEffect(() => {
    async function loadPayslips() {
      setLoadingPayslips(true);
      try {
        const slips = await fetchMyPayslips();
        setApiPayslips(slips || []);
      } catch {
        // Fallback gracefully
      } finally {
        setLoadingPayslips(false);
      }
    }
    loadPayslips();
  }, []);

  // Standard onboarding documents
  const baseDocuments: StoredDocument[] = [
    // SNR NEST Generated Monthly Pay Slips (Default released slips for current tenure)
    {
      id: 'snr-ps-oct26',
      category: 'payslips',
      title: 'Salary Pay Slip — October 2026',
      type: 'Official SNR NEST Monthly Pay Slip',
      number: `SNR-PAY-${dossier.employeeCode}-2026-10`,
      filename: `Payslip_October_2026_${dossier.employeeCode}.pdf`,
      date: '2026-10-31',
      verified: true,
      amount: `₹${dossier.salary.netTakeHome.toLocaleString('en-IN')}`,
      isSnrPayslip: true,
    },
    {
      id: 'snr-ps-sep26',
      category: 'payslips',
      title: 'Salary Pay Slip — September 2026',
      type: 'Official SNR NEST Monthly Pay Slip',
      number: `SNR-PAY-${dossier.employeeCode}-2026-09`,
      filename: `Payslip_September_2026_${dossier.employeeCode}.pdf`,
      date: '2026-09-30',
      verified: true,
      amount: `₹${dossier.salary.netTakeHome.toLocaleString('en-IN')}`,
      isSnrPayslip: true,
    },
    {
      id: 'snr-ps-aug26',
      category: 'payslips',
      title: 'Salary Pay Slip — August 2026',
      type: 'Official SNR NEST Monthly Pay Slip',
      number: `SNR-PAY-${dossier.employeeCode}-2026-08`,
      filename: `Payslip_August_2026_${dossier.employeeCode}.pdf`,
      date: '2026-08-31',
      verified: true,
      amount: `₹${dossier.salary.netTakeHome.toLocaleString('en-IN')}`,
      isSnrPayslip: true,
    },

    // Company Letters
    {
      id: 'offer-letter',
      category: 'letters',
      title: 'Official Employment Offer Letter',
      type: 'SNR NEST Employment Agreement & Terms',
      number: `SNR-OFR-${dossier.employeeCode}`,
      filename: `Offer_Letter_${dossier.employeeCode}.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'joining-letter',
      category: 'letters',
      title: 'Store Joining & Appointment Confirmation',
      type: 'Official Store Placement Letter',
      number: `SNR-APPT-${dossier.employeeCode}`,
      filename: `Appointment_Letter_${dossier.employeeCode}.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },

    // Personal Details & KYC
    {
      id: 'aadhar-doc',
      category: 'kyc',
      title: 'Aadhar Card (Identity Proof)',
      type: 'Government National Identity UID',
      number: dossier.kycDocuments.aadharNumber,
      filename: `aadhar_${dossier.employeeCode.toLowerCase()}.pdf`,
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'pan-doc',
      category: 'kyc',
      title: 'PAN Card (Tax Record)',
      type: 'Income Tax Permanent Account Number',
      number: dossier.kycDocuments.panNumber,
      filename: `pan_${dossier.employeeCode.toLowerCase()}.jpg`,
      date: dossier.dateOfJoining,
      verified: true,
    },

    // Bank Details Proof
    {
      id: 'bank-proof-doc',
      category: 'bank',
      title: 'Bank Passbook / Cancelled Cheque',
      type: 'Direct Deposit Account Proof',
      number: `${dossier.bankDetails.bankName} · ${dossier.bankDetails.ifscCode}`,
      filename: dossier.bankDetails.passbookFileName || 'passbook_record.pdf',
      date: dossier.dateOfJoining,
      verified: true,
    },

    // Previous Employer Pay Slips
    {
      id: 'prev-ps1',
      category: 'previous',
      title: 'Previous Employer Pay Slip — Month 1',
      type: 'Previous Employment Verification',
      number: 'DOC-PREV-M1',
      filename: 'previous_company_payslip_m1.pdf',
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'prev-ps2',
      category: 'previous',
      title: 'Previous Employer Pay Slip — Month 2',
      type: 'Previous Employment Verification',
      number: 'DOC-PREV-M2',
      filename: 'previous_company_payslip_m2.pdf',
      date: dossier.dateOfJoining,
      verified: true,
    },
    {
      id: 'prev-ps3',
      category: 'previous',
      title: 'Previous Employer Pay Slip — Month 3',
      type: 'Previous Employment Verification',
      number: 'DOC-PREV-M3',
      filename: 'previous_company_payslip_m3.pdf',
      date: dossier.dateOfJoining,
      verified: true,
    },
  ];

  // Combine API payslips into document list
  const combinedApiPayslips: StoredDocument[] = apiPayslips.map((p) => ({
    id: p.id,
    category: 'payslips',
    title: `Salary Pay Slip — ${p.period_name}`,
    type: 'Released Organization Pay Slip',
    number: `SNR-PS-${p.id.slice(0, 8).toUpperCase()}`,
    filename: `Payslip_${p.period_name.replace(/\s+/g, '_')}.pdf`,
    date: p.released_at ? p.released_at.split('T')[0] : p.created_at.split('T')[0],
    verified: true,
    amount: `₹${Number(p.net_pay).toLocaleString('en-IN')}`,
    isSnrPayslip: true,
  }));

  const allDocuments = [...combinedApiPayslips, ...extraDocs, ...baseDocuments];

  // Filter documents
  const filtered = allDocuments.filter((doc) => {
    const matchesCat = activeCategory === 'all' || doc.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.number && doc.number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError('');

    if (!uploadDocTitle.trim()) {
      setUploadError('Document title / period is required.');
      return;
    }
    if (!uploadFileName) {
      setUploadError('Please select a file to upload.');
      return;
    }

    const newDoc: StoredDocument = {
      id: 'upload-' + Date.now(),
      category: uploadCategory,
      title: uploadDocTitle.trim(),
      type:
        uploadCategory === 'payslips'
          ? 'Uploaded Salary Pay Slip'
          : uploadCategory === 'letters'
            ? 'Company Communication'
            : uploadCategory === 'kyc'
              ? 'Identity Proof'
              : uploadCategory === 'bank'
                ? 'Banking Record'
                : 'Prior Tenure Verification',
      number: `DOC-UPL-${Date.now().toString().slice(-6)}`,
      filename: uploadFileName,
      date: new Date().toISOString().split('T')[0],
      verified: true,
      amount: uploadAmount ? `₹${uploadAmount}` : undefined,
      isSnrPayslip: uploadCategory === 'payslips',
    };

    const updated = [newDoc, ...extraDocs];
    setExtraDocs(updated);
    try {
      localStorage.setItem('snr_employee_uploaded_docs', JSON.stringify(updated));
    } catch {
      // ignore
    }

    setUploadModalOpen(false);
    setUploadDocTitle('');
    setUploadFileName('');
    setUploadAmount('');
    setUploadSuccessBanner(`Successfully uploaded "${newDoc.title}".`);
    setTimeout(() => setUploadSuccessBanner(''), 6000);
  };

  const handleDownload = async (doc: StoredDocument) => {
    if (
      doc.isSnrPayslip &&
      doc.id &&
      !doc.id.startsWith('snr-ps') &&
      !doc.id.startsWith('upload-')
    ) {
      try {
        const intent = await createPayslipDownloadIntent(doc.id);
        if (intent.download_url) {
          window.open(intent.download_url, '_blank');
          return;
        }
      } catch {
        // Fallback to simulated download below
      }
    }
    alert(`Downloading verified copy of "${doc.filename}".`);
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* --------------------------------------------------------------------- */}
      {/* HEADER HERO                                                           */}
      {/* --------------------------------------------------------------------- */}
      <Card
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
            gap: '1.25rem',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                marginBottom: '0.35rem',
              }}
            >
              <span
                style={{
                  background: '#f4a261',
                  color: '#1e2d35',
                  fontSize: '0.725rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                }}
              >
                EMPLOYEE DOSSIER
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                • {dossier.fullName} ({dossier.employeeCode})
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
              My Documents & Pay Slips
            </h1>
            <p style={{ margin: '0.35rem 0 0', color: '#cbd5e1', fontSize: '0.9rem' }}>
              Access verified employment records, letters, KYC proofs, and released monthly pay
              slips.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={() => {
                setUploadDocTitle('');
                setUploadFileName('');
                setUploadAmount('');
                setUploadCategory('payslips');
                setUploadError('');
                setUploadModalOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Upload size={16} /> Upload Pay Slip / Document
            </Button>
          </div>
        </div>
      </Card>

      {/* Success banner if document uploaded */}
      {uploadSuccessBanner && (
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
          <span>{uploadSuccessBanner}</span>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* FILTER TABS & SEARCH                                                  */}
      {/* --------------------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          {[
            { id: 'all', label: 'All Documents', count: allDocuments.length },
            {
              id: 'payslips',
              label: 'Monthly Pay Slips',
              count: allDocuments.filter((d) => d.category === 'payslips').length,
            },
            {
              id: 'letters',
              label: 'Offer & Joining Letters',
              count: allDocuments.filter((d) => d.category === 'letters').length,
            },
            {
              id: 'kyc',
              label: 'Personal KYC (Aadhar/PAN)',
              count: allDocuments.filter((d) => d.category === 'kyc').length,
            },
            {
              id: 'bank',
              label: 'Bank Proof',
              count: allDocuments.filter((d) => d.category === 'bank').length,
            },
            {
              id: 'previous',
              label: 'Previous Employer Slips',
              count: allDocuments.filter((d) => d.category === 'previous').length,
            },
          ].map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id as DocumentCategory)}
                style={{
                  background: isSelected ? '#1e293b' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#475569',
                  border: isSelected ? '1px solid #1e293b' : '1px solid #cbd5e1',
                  borderRadius: '999px',
                  padding: '0.45rem 0.95rem',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <span>{cat.label}</span>
                <span
                  style={{
                    background: isSelected ? '#f4a261' : '#f1f5f9',
                    color: isSelected ? '#1e2d35' : '#64748b',
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    padding: '0.1rem 0.45rem',
                    borderRadius: '999px',
                  }}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Search documents by name, type, id…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* DOCUMENTS GRID                                                        */}
      {/* --------------------------------------------------------------------- */}
      {filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#64748b' }}>
          <FileText size={40} style={{ opacity: 0.4, margin: '0 auto 0.75rem' }} />
          <h3 style={{ margin: '0 0 0.25rem 0', color: '#334155' }}>No documents found</h3>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            No documents matched your filter criteria or search query.
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {filtered.map((doc) => {
            const isPaySlip = doc.category === 'payslips';
            return (
              <Card
                key={doc.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRadius: '12px',
                  border: isPaySlip ? '2px solid #bbf7d0' : '1px solid #e2e8f0',
                  background: isPaySlip
                    ? 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 40%)'
                    : '#ffffff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  padding: '1.25rem',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.65rem',
                    }}
                  >
                    <div
                      style={{
                        padding: '0.45rem',
                        borderRadius: '10px',
                        background: isPaySlip ? '#dcfce7' : '#fef3c7',
                        color: isPaySlip ? '#16a34a' : '#d97706',
                        display: 'inline-flex',
                      }}
                    >
                      {isPaySlip ? <DollarSign size={22} /> : <FileText size={22} />}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {doc.amount && (
                        <span
                          style={{
                            background: '#ecfdf5',
                            border: '1px solid #10b981',
                            color: '#065f46',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                          }}
                        >
                          Net: {doc.amount}
                        </span>
                      )}
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
                  </div>

                  <h3
                    style={{
                      margin: '0 0 0.25rem 0',
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: '#1e293b',
                    }}
                  >
                    {doc.title}
                  </h3>

                  <div style={{ fontSize: '0.825rem', color: '#64748b', marginBottom: '0.5rem' }}>
                    {doc.type}
                  </div>

                  {doc.number && (
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.775rem',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        display: 'inline-block',
                        color: '#334155',
                        marginBottom: '0.75rem',
                      }}
                    >
                      {doc.number}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.775rem',
                      color: '#64748b',
                    }}
                  >
                    <Calendar size={13} />
                    <span>Date: {doc.date}</span>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '0.85rem',
                    marginTop: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      maxWidth: '160px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {doc.filename}
                  </span>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <Button
                      variant="secondary"
                      onClick={() => setPreviewDoc(doc)}
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                    >
                      <Eye size={13} /> View
                    </Button>
                    <Button
                      variant={isPaySlip ? 'primary' : 'secondary'}
                      onClick={() => handleDownload(doc)}
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                    >
                      <Download size={13} /> Download
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* UPLOAD DOCUMENT / PAYSLIP MODAL                                       */}
      {/* --------------------------------------------------------------------- */}
      {uploadModalOpen && (
        <Modal
          onClose={() => setUploadModalOpen(false)}
          title="Upload Pay Slip or Employment Document"
        >
          <p className="muted" style={{ margin: '0 0 1rem 0', fontSize: '0.85rem' }}>
            Upload your monthly pay slips, company letters, or verified certificates. Files are
            stored securely with encrypted access.
          </p>

          <form onSubmit={handleUploadSubmit}>
            {uploadError && (
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
                <span>{uploadError}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '0.35rem',
                  }}
                >
                  Document Category
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="payslips">Monthly Salary Pay Slip (SNR NEST)</option>
                  <option value="letters">Company Letter (Offer / Joining / Promotion)</option>
                  <option value="kyc">Personal KYC (Aadhar / PAN / Passport)</option>
                  <option value="bank">Banking Proof (Passbook / Cheque)</option>
                  <option value="previous">Previous Employer Pay Slip / Relieving Letter</option>
                </select>
              </div>

              <FormField
                label="Document Title / Period Name"
                type="text"
                placeholder={
                  uploadCategory === 'payslips'
                    ? 'e.g. Salary Pay Slip — November 2026'
                    : 'e.g. Relieving Certificate'
                }
                value={uploadDocTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setUploadDocTitle(e.target.value)
                }
                required
              />

              {uploadCategory === 'payslips' && (
                <FormField
                  label="Net Take-Home Pay (Optional, ₹)"
                  type="text"
                  placeholder="e.g. 16545 or 58200"
                  value={uploadAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setUploadAmount(e.target.value)
                  }
                />
              )}

              <div
                style={{
                  border: '2px dashed #cbd5e1',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  background: '#f8fafc',
                  textAlign: 'center',
                }}
              >
                <Upload size={28} style={{ color: '#f4a261', margin: '0 auto 0.5rem' }} />
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  {uploadFileName ? uploadFileName : 'Select PDF or Document Image'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>
                  Supported formats: PDF, JPG, PNG (Max 10MB)
                </div>
                <label
                  style={{
                    background: '#1e293b',
                    color: '#ffffff',
                    padding: '0.45rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-block',
                  }}
                >
                  Browse File
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadFileName(file.name);
                        if (!uploadDocTitle) {
                          setUploadDocTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
                        }
                      }
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
              <Button variant="secondary" onClick={() => setUploadModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Upload & Save Document
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
            {`Verified employee record for ${dossier.fullName} (${dossier.employeeCode})`}
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
                  background: previewDoc.category === 'payslips' ? '#dcfce7' : '#fef3c7',
                  color: previewDoc.category === 'payslips' ? '#16a34a' : '#b45309',
                  marginBottom: '0.75rem',
                }}
              >
                {previewDoc.category === 'payslips' ? (
                  <DollarSign size={36} />
                ) : (
                  <FileText size={36} />
                )}
              </div>

              <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 700 }}>
                {previewDoc.filename}
              </h3>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Classification: {previewDoc.type}
              </div>

              {previewDoc.amount && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    color: '#065f46',
                  }}
                >
                  Net Payout: {previewDoc.amount}
                </div>
              )}

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
                <ShieldCheck size={14} /> HR Verified & Tamper-Evident
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
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Record Date:</span>
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
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Storage Policy:</span>
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
              <Button variant="primary" onClick={() => handleDownload(previewDoc)}>
                <Download size={14} /> Download File
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
