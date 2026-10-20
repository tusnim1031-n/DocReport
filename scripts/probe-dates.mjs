/**
 * สคริปต์ตรวจสอบการแปลงวันที่ (ใช้ชั่วคราวระหว่างพัฒนา)
 * รัน: node scripts/probe-dates.mjs
 */
import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

mkdirSync(resolve(root, 'node_modules/.probe'), { recursive: true });
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/lib/dates.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'node_modules/.probe/dates.mjs',
  platform: 'node',
});
const d = await import(pathToFileURL(resolve(root, 'node_modules/.probe/dates.mjs')).href);

const cases = [
  '8 มกราคม 2567',
  '8/1/2567',
  '01/08/2567',
  '8 ม.ค. 2567',
  'วันจันทร์ที่ 8 มกราคม 2567',
  '8 มกราคม 2567 ',
  ' 8 มกราคม 2567',
  '8 มกราคม 2567  ',
  '8 มกราคม 2567\n',
  '8 มกราคม 2567\r\n',
  '08/01/2024',
  '8 มกราคม 2567 (รับ)',
  '1 มีนาคม 2567',
  'มกราคม 2567',
  '45299',
  '8 มกราคม 2567\u00a0',
  '8 มกราคม 2567 08:30',
  '2567-01-08 00:00:00',
  '2024-01-08T00:00:00.000Z',
  '8 มกราคม 2567 เวลา 08.30 น.',
];

for (const c of cases) {
  const r = d.parseDateValue(c);
  console.log(
    JSON.stringify(c),
    '=>',
    r
      ? JSON.stringify({
          iso: r.iso,
          display: r.display,
          precision: r.precision,
          note: r.note ?? null,
        })
      : 'null',
  );
}
