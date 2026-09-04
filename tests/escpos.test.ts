import assert from 'node:assert/strict';
import test from 'node:test';
import { EscPosPrinter } from '../src/escpos-printer.js';
import { ESC_POS_COMMANDS, EscPosEncoder, LF } from '../src/escpos/encoder.js';
import {
  createPrinterProfile,
  DEVELOPMENT_PROFILE_58MM,
  DEVELOPMENT_PROFILE_80MM,
} from '../src/escpos/profile.js';
import { AsciiSafeTextEncoder } from '../src/escpos/text-encoding.js';
import { parsePrintJob } from '../src/model.js';
import { renderKitchenTicket } from '../src/renderer.js';
import { FakeTransport } from '../src/transport/fake-transport.js';
import type { RenderedTicket } from '../src/types.js';

const adminSentinels = Object.freeze([
  'ADMIN_CLIENTE_QZX_41001',
  'ADMIN_TELEFONO_QZX_41002',
  'ADMIN_DIRECCION_QZX_41003',
  'ADMIN_PRECIOS_QZX_41004',
  'ADMIN_PAGO_QZX_41005',
  'ADMIN_EFECTIVO_QZX_41006',
  'ADMIN_VUELTO_QZX_41007',
  'ADMIN_TRANSFERENCIA_QZX_41008',
]);

function fixtureJob() {
  return parsePrintJob({
    schema_version: 1,
    job_id: 'escpos-test-job',
    claim_token: 'test-claim',
    lease_expires_at: '2030-01-01T00:00:00Z',
    order: {
      number: 146,
      time: '22:11',
      items: [{
        quantity: 2,
        name: 'Burger ñandú',
        variant: 'Doble clásica',
        removed_ingredients: ['cebolla', 'ají'],
        added_extras: ['medallón extra', 'provolone'],
        sauces: ['mayonesa', 'kétchup'],
      }],
      summary: {
        total_medallions: 10,
        cheese_counts: {
          cheddar: 2,
          mozzarella: 1,
          roquefort: 1,
          provolone: 1,
          tybo: 1,
          'queso de cabra': 2,
          'queso con conteo cero': 0,
        },
        no_cheese_count: 2,
      },
      customer_name: adminSentinels[0],
      customer_phone: adminSentinels[1],
      address: adminSentinels[2],
      prices: adminSentinels[3],
      payment: adminSentinels[4],
      cash: adminSentinels[5],
      change: adminSentinels[6],
      transfer: adminSentinels[7],
    },
  });
}

function renderFixture(columns = DEVELOPMENT_PROFILE_80MM.columns): RenderedTicket {
  return renderKitchenTicket(fixtureJob(), { columns });
}

function concatenate(...parts: ReadonlyArray<Iterable<number>>): Uint8Array {
  const result: number[] = [];
  for (const part of parts) result.push(...part);
  return Uint8Array.from(result);
}

function indexOfSequence(haystack: Uint8Array, sequence: Iterable<number>): number {
  const needle = Array.from(sequence);
  if (needle.length === 0) return 0;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((byte, offset) => haystack[start + offset] === byte)) return start;
  }
  return -1;
}

function includesSequence(haystack: Uint8Array, sequence: Iterable<number>): boolean {
  return indexOfSequence(haystack, sequence) >= 0;
}

function lineWidth(text: string): number {
  return Array.from(text).length;
}

test('development profiles render bounded 58 mm and 80 mm tickets without mutating presets', () => {
  assert.deepEqual(
    {
      paperWidthMm: DEVELOPMENT_PROFILE_58MM.paperWidthMm,
      columns: DEVELOPMENT_PROFILE_58MM.columns,
    },
    { paperWidthMm: 58, columns: 32 },
  );
  assert.deepEqual(
    {
      paperWidthMm: DEVELOPMENT_PROFILE_80MM.paperWidthMm,
      columns: DEVELOPMENT_PROFILE_80MM.columns,
    },
    { paperWidthMm: 80, columns: 48 },
  );

  const cutProfile = createPrinterProfile(DEVELOPMENT_PROFILE_58MM, { supportsCut: true });
  assert.equal(cutProfile.supportsCut, true);
  assert.equal(DEVELOPMENT_PROFILE_58MM.supportsCut, false);

  for (const profile of [DEVELOPMENT_PROFILE_58MM, DEVELOPMENT_PROFILE_80MM]) {
    const ticket = renderFixture(profile.columns);
    assert.ok(ticket.lines.every((line) => lineWidth(line.text) <= profile.columns));
    assert.ok(ticket.text.split('\n').every((line) => lineWidth(line) <= profile.columns));
    assert.ok(ticket.lines.some((line) => line.text === '='.repeat(profile.columns)));
    assert.ok(ticket.lines.some((line) => line.text === '-'.repeat(profile.columns)));
  }
});

test('kitchen ticket preserves pedido, item changes, dynamic cheeses, and no-cheese semantics', () => {
  const ticket = renderFixture();
  const lines = ticket.lines.map((line) => line.text);
  const pedido = ticket.lines.find((line) => line.text === 'PEDIDO #146');

  assert.equal(ticket.orderNumber, 146);
  assert.deepEqual(pedido, {
    text: 'PEDIDO #146',
    align: 'center',
    bold: true,
    size: 'double',
  });
  assert.ok(ticket.lines.some((line) => line.text === '22:11' && line.align === 'center'));
  for (const expected of [
    '2x BURGER ÑANDÚ',
    '   DOBLE CLÁSICA',
    '   - SIN CEBOLLA',
    '   - SIN AJÍ',
    '   + MEDALLÓN EXTRA',
    '   + PROVOLONE',
    '   ADEREZOS: MAYONESA / KÉTCHUP',
    'MEDALLONES: 10',
    'CHEDDAR: 2',
    'MOZZARELLA: 1',
    'ROQUEFORT: 1',
    'PROVOLONE: 1',
    'TYBO: 1',
    'QUESO DE CABRA: 2',
    'SIN QUESO: 2',
  ]) {
    assert.ok(lines.includes(expected), `missing ticket line: ${expected}`);
  }
  assert.equal(lines.some((line) => line.includes('QUESO CON CONTEO CERO')), false);

  const jobWithoutNoCheese = fixtureJob();
  const ticketWithoutNoCheese = renderKitchenTicket({
    ...jobWithoutNoCheese,
    order: {
      ...jobWithoutNoCheese.order,
      summary: {
        ...jobWithoutNoCheese.order.summary,
        total_medallions: 8,
        no_cheese_count: 0,
      },
    },
  }, { columns: DEVELOPMENT_PROFILE_80MM.columns });
  assert.equal(
    ticketWithoutNoCheese.lines.some((line) => line.text.startsWith('SIN QUESO:')),
    false,
  );
});

test('parse -> render -> encode excludes every administrative sentinel', () => {
  const ticket = renderFixture();
  const encoded = new EscPosEncoder(DEVELOPMENT_PROFILE_80MM).encode(ticket);
  const printableBytes = Buffer.from(encoded).toString('ascii');

  for (const sentinel of adminSentinels) {
    assert.equal(ticket.text.includes(sentinel), false, `renderer leaked ${sentinel}`);
    assert.equal(printableBytes.includes(sentinel), false, `encoder leaked ${sentinel}`);
  }
});

test('ESC/POS encoding initializes, emphasizes and centers pedido, resets styles, separates, and feeds', () => {
  const ticket = renderFixture();
  const profile = createPrinterProfile(DEVELOPMENT_PROFILE_80MM, {
    supportsCut: false,
    finalFeedLines: 4,
  });
  const textEncoder = new AsciiSafeTextEncoder();
  const encoded = new EscPosEncoder(profile, textEncoder).encode(ticket);

  assert.deepEqual(
    encoded.slice(0, ESC_POS_COMMANDS.initialize.length),
    Uint8Array.from(ESC_POS_COMMANDS.initialize),
  );

  const emphasizedPedido = concatenate(
    ESC_POS_COMMANDS.align.center,
    ESC_POS_COMMANDS.bold.on,
    ESC_POS_COMMANDS.size.double,
    textEncoder.encode('PEDIDO #146'),
    [LF],
  );
  assert.ok(includesSequence(encoded, emphasizedPedido));

  for (const separator of ['='.repeat(profile.columns), '-'.repeat(profile.columns)]) {
    assert.ok(includesSequence(encoded, concatenate(textEncoder.encode(separator), [LF])));
  }
  assert.equal(Array.from(encoded).filter((byte) => byte === LF).length, ticket.lines.length);

  const resetAndFeed = concatenate(
    ESC_POS_COMMANDS.align.left,
    ESC_POS_COMMANDS.bold.off,
    ESC_POS_COMMANDS.size.normal,
    ESC_POS_COMMANDS.feed,
    [profile.finalFeedLines],
  );
  assert.deepEqual(encoded.slice(-resetAndFeed.length), resetAndFeed);
  assert.equal(includesSequence(encoded, ESC_POS_COMMANDS.cut), false);
});

test('cut is emitted only when the selected profile enables it', () => {
  const ticket = renderFixture();
  const disabled = new EscPosEncoder(
    createPrinterProfile(DEVELOPMENT_PROFILE_80MM, { supportsCut: false }),
  ).encode(ticket);
  const enabled = new EscPosEncoder(
    createPrinterProfile(DEVELOPMENT_PROFILE_80MM, { supportsCut: true }),
  ).encode(ticket);

  assert.equal(includesSequence(disabled, ESC_POS_COMMANDS.cut), false);
  assert.deepEqual(
    enabled.slice(-ESC_POS_COMMANDS.cut.length),
    Uint8Array.from(ESC_POS_COMMANDS.cut),
  );
});

test('ASCII-safe strategy explicitly transliterates Spanish text and output is deterministic', () => {
  const textEncoder = new AsciiSafeTextEncoder();
  const spanish = 'áéíóú ñ ÁÉÍÓÚ Ñ; pingüino; ¿qué? ¡sí!';
  const transliterated = textEncoder.encode(spanish);
  assert.equal(Buffer.from(transliterated).toString('ascii'), 'aeiou n AEIOU N; pinguino; ?que? !si!');
  assert.ok(Array.from(transliterated).every((byte) => byte >= 0x20 && byte <= 0x7e));

  const ticket = renderFixture();
  const first = new EscPosEncoder(DEVELOPMENT_PROFILE_80MM, textEncoder).encode(ticket);
  const second = new EscPosEncoder(DEVELOPMENT_PROFILE_80MM, textEncoder).encode(ticket);
  assert.deepEqual(first, second);
  assert.ok(Array.from(first).every((byte) => byte <= 0x7f));
  assert.ok(Buffer.from(first).toString('ascii').includes('2x BURGER NANDU'));
});

test('text encoding strategy is replaceable and profile-selected, including right alignment', () => {
  const customEncoder = {
    name: 'test-code-page',
    encode: (text: string): Uint8Array => Uint8Array.from({ length: Array.from(text).length }, () => 0x58),
  };
  const profile = createPrinterProfile(DEVELOPMENT_PROFILE_58MM, { characterEncoding: customEncoder.name });
  const ticket: RenderedTicket = {
    orderNumber: 1,
    text: 'derecha',
    lines: [{ text: 'derecha', align: 'right', bold: false, size: 'normal' }],
  };
  const encoded = new EscPosEncoder(profile, customEncoder).encode(ticket);
  assert.ok(includesSequence(encoded, concatenate(ESC_POS_COMMANDS.align.right, customEncoder.encode('derecha'), [LF])));
  assert.ok(includesSequence(encoded, ESC_POS_COMMANDS.align.left));
  assert.throws(() => new EscPosEncoder(profile), /matching text encoder strategy/);
});

test('FakeTransport captures defensive copies', async () => {
  const transport = new FakeTransport();
  const source = Uint8Array.of(1, 2, 3);
  await transport.open();
  await transport.write(source);
  source[0] = 99;

  const exposed = transport.writes[0];
  assert.ok(exposed);
  assert.deepEqual(exposed, Uint8Array.of(1, 2, 3));
  exposed[1] = 88;
  assert.deepEqual(transport.writes[0], Uint8Array.of(1, 2, 3));
  await transport.close();
});

test('EscPosPrinter performs exactly one delayed write and closes the transport', async () => {
  const delays: number[] = [];
  const transport = new FakeTransport({
    delayMs: 37,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });
  const encoder = new EscPosEncoder(DEVELOPMENT_PROFILE_58MM);
  const ticket = renderFixture(DEVELOPMENT_PROFILE_58MM.columns);
  const expected = encoder.encode(ticket);

  await new EscPosPrinter(encoder, transport).print(ticket, 'job-single-write');

  assert.equal(transport.openCount, 1);
  assert.equal(transport.writeCount, 1);
  assert.equal(transport.closeCount, 1);
  assert.equal(transport.isOpen, false);
  assert.deepEqual(delays, [37]);
  assert.deepEqual(transport.writes, [expected]);
});

test('FakeTransport failure is deterministic and EscPosPrinter still closes it', async () => {
  const failure = new Error('configured transport failure sentinel');
  const transport = new FakeTransport({ failure });
  const printer = new EscPosPrinter(new EscPosEncoder(DEVELOPMENT_PROFILE_80MM), transport);

  await assert.rejects(
    () => printer.print(renderFixture(), 'job-failure'),
    /configured transport failure sentinel/,
  );
  assert.equal(transport.openCount, 1);
  assert.equal(transport.writeCount, 1);
  assert.equal(transport.writes.length, 1);
  assert.equal(transport.closeCount, 1);
  assert.equal(transport.isOpen, false);
});
