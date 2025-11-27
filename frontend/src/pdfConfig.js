// frontend/src/pdfConfig.js
import { pdfjs } from "react-pdf";

// react-pdf와 동일한 버전의 worker를 CDN에서 자동으로 가져옴
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;