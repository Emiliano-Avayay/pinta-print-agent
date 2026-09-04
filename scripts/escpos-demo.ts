import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EscPosEncoder } from '../src/escpos/encoder.js';
import { createPrinterProfile, DEVELOPMENT_PROFILE_80MM } from '../src/escpos/profile.js';
import { EscPosPrinter } from '../src/escpos-printer.js';
import { parsePrintJob } from '../src/model.js';
import { renderKitchenTicket } from '../src/renderer.js';
import { FakeTransport } from '../src/transport/fake-transport.js';

const demoJob = parsePrintJob({
  schema_version: 1,
  job_id: 'escpos-demo-job',
  claim_token: 'local-demo-only',
  lease_expires_at: '2099-01-01T00:00:00Z',
  order: {
    number: 146,
    time: '22:11',
    items: [
      {
        quantity: 1,
        name: 'Burger Pinta ñandú',
        variant: 'Doble',
        removed_ingredients: ['cebolla'],
        added_extras: ['medallón extra'],
        sauces: ['mayonesa', 'tártara'],
      },
    ],
    summary: {
      total_medallions: 4,
      cheese_counts: { cheddar: 1, mozzarella: 1, roquefort: 1, tybo: 1 },
      no_cheese_count: 0,
    },
  },
});

function hexDump(data: Uint8Array): string {
  const rows: string[] = [];
  for (let offset = 0; offset < data.length; offset += 16) {
    const slice = data.slice(offset, offset + 16);
    const hex = Array.from(slice, (byte) => byte.toString(16).padStart(2, '0')).join(' ').padEnd(47);
    const ascii = Array.from(slice, (byte) => byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.').join('');
    rows.push(`${offset.toString(16).padStart(6, '0')}  ${hex}  ${ascii}`);
  }
  return `${rows.join('\n')}\n`;
}

const profile = createPrinterProfile(DEVELOPMENT_PROFILE_80MM);
const ticket = renderKitchenTicket(demoJob, { columns: profile.columns });
const transport = new FakeTransport();
await new EscPosPrinter(new EscPosEncoder(profile), transport).print(ticket, demoJob.job_id);
const bytes = transport.writes[0];
if (!bytes) throw new Error('ESC/POS demo did not produce a transport write');

const outputDirectory = mkdtempSync(join(tmpdir(), 'pinta-escpos-demo-'));
writeFileSync(join(outputDirectory, 'ticket.txt'), ticket.text, 'utf8');
writeFileSync(join(outputDirectory, 'ticket.bin'), bytes);
writeFileSync(join(outputDirectory, 'ticket.hex.txt'), hexDump(bytes), 'ascii');

console.log(`ESC/POS dry run written to ${outputDirectory}`);
console.log(`Profile: ${profile.paperWidthMm} mm development preset, ${profile.columns} columns, encoding=${profile.characterEncoding}, cut=${profile.supportsCut}`);
console.log(`ticket.bin: ${bytes.byteLength} bytes in ${transport.writeCount} transport write`);
