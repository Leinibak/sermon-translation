import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./pdfConfig";
import "./index.css"; // Tailwind 또는 CSS 파일

// React 18 이상: createRoot 사용
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
