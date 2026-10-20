import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// ฟอนต์ Sarabun (บันเดิลไว้ในโปรเจกต์ ไม่ต้องโหลดจากอินเทอร์เน็ตขณะใช้งาน)
import '@fontsource/sarabun/300.css';
import '@fontsource/sarabun/400.css';
import '@fontsource/sarabun/500.css';
import '@fontsource/sarabun/600.css';
import '@fontsource/sarabun/700.css';

import './styles/global.css';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('ไม่พบ element #root ในหน้าเว็บ');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
