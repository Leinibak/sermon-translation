import { pdfjs } from 'react-pdf';

// ⭐⭐⭐ PDF.js Worker 설정 (최신 버전)
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// 또는 CDN 고정 버전 사용
// pdfjs.GlobalWorkerOptions.workerSrc = '//unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

export default pdfjs;