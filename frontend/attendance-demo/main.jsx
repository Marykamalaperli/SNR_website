import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import '../src/styles/live-attendance.css';
import '../src/styles/utilities.css';
import AttendanceDemo from './AttendanceDemo';
import './demo.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AttendanceDemo />
  </React.StrictMode>,
);
