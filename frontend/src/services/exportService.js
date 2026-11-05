function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function attendanceCsv(people) {
  const rows = [
    ['SYNTHETIC DESIGN PREVIEW — NOT OPERATIONAL DATA'],
    ['Employee ID', 'Name', 'Department', 'Site', 'Attendance', 'Sample clock in'],
    ...people.map((p) => [p.id, p.name, p.department, p.site, p.status, p.punch]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadSampleReport(people) {
  const url = URL.createObjectURL(
    new Blob([attendanceCsv(people)], { type: 'text/csv;charset=utf-8;' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'snr-nest-SAMPLE-attendance.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
