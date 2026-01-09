// frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { pdfjs } from 'react-pdf';

// ✅ Use Cloudflare CDN instead of unpkg// 
// ✅ PDF.js Worker 설정 - package.json의 pdfjs-dist 버전과 일치
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.394/build/pdf.worker.min.mjs`;


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);