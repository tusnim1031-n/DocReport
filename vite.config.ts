import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ระบบรายงานทะเบียนหนังสือ
// ประมวลผลไฟล์ทั้งหมดในเบราว์เซอร์ (Client-side) ไม่มีการส่งข้อมูลไปเซิร์ฟเวอร์ภายนอก
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
  },
  preview: {
    host: 'localhost',
    port: 4173,
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
