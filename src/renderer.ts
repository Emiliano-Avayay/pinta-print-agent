import type { PrintJob, RenderedTicket, RenderedTicketLine, TicketAlignment, TicketTextSize } from './types.js';

export interface KitchenTicketRenderOptions { columns?: number }

const DEFAULT_COLUMNS = 32;

function textWidth(value: string): number { return Array.from(value).length; }

function assertColumns(columns: number): void {
  if (!Number.isInteger(columns) || columns < 16) throw new RangeError('ticket columns must be an integer >= 16');
}

function wrapPrefixed(prefix: string, content: string, columns: number): string[] {
  const continuationWidth = Math.min(textWidth(prefix), columns - 1);
  let remaining = `${prefix}${content}`;
  const output: string[] = [];
  let continuation = false;

  while (textWidth(remaining) > (continuation ? columns - continuationWidth : columns)) {
    const indent = continuation ? ' '.repeat(continuationWidth) : '';
    const capacity = columns - textWidth(indent);
    const characters = Array.from(remaining);
    let splitAt = capacity;
    for (let index = capacity; index > 0; index--) {
      if (/\s/u.test(characters[index - 1] ?? '')) { splitAt = index - 1; break; }
    }
    if (splitAt === 0) splitAt = capacity;
    const part = characters.slice(0, splitAt).join('').trimEnd();
    output.push(`${indent}${part}`);
    remaining = characters.slice(splitAt).join('').trimStart();
    continuation = true;
  }

  output.push(`${continuation ? ' '.repeat(continuationWidth) : ''}${remaining}`.trimEnd());
  return output;
}

function alignForText(line: RenderedTicketLine, columns: number): string {
  const padding = Math.max(0, columns - textWidth(line.text));
  if (line.align === 'center') return `${' '.repeat(Math.floor(padding / 2))}${line.text}`;
  if (line.align === 'right') return `${' '.repeat(padding)}${line.text}`;
  return line.text;
}

export function renderKitchenTicket(job: PrintJob, options: KitchenTicketRenderOptions = {}): RenderedTicket {
  const columns = options.columns ?? DEFAULT_COLUMNS;
  assertColumns(columns);
  const { order } = job;
  const lines: RenderedTicketLine[] = [];
  const push = (text: string, align: TicketAlignment = 'left', bold = false, size: TicketTextSize = 'normal'): void => { lines.push({ text, align, bold, size }); };
  const pushWrapped = (prefix: string, content: string, bold = false): void => { for (const line of wrapPrefixed(prefix, content, columns)) push(line, 'left', bold); };

  push('='.repeat(columns));
  push(`PEDIDO #${order.number}`, 'center', true, 'double');
  push(order.time, 'center');
  push('='.repeat(columns));
  push('');

  for (const item of order.items) {
    pushWrapped(`${item.quantity}x `, item.name.toUpperCase(), true);
    if (item.variant) pushWrapped('   ', item.variant.toUpperCase());
    for (const removed of item.removed_ingredients) pushWrapped('   - SIN ', removed.toUpperCase());
    for (const extra of item.added_extras) pushWrapped('   + ', extra.toUpperCase());
    if (item.sauces.length) pushWrapped('   ADEREZOS: ', item.sauces.map((sauce) => sauce.toUpperCase()).join(' / '));
    push('');
  }

  push('-'.repeat(columns));
  pushWrapped('', `MEDALLONES: ${order.summary.total_medallions}`, true);
  push('');
  for (const [cheese, amount] of Object.entries(order.summary.cheese_counts)) {
    if (amount > 0) pushWrapped('', `${cheese.toUpperCase()}: ${amount}`);
  }
  if (order.summary.no_cheese_count > 0) pushWrapped('', `SIN QUESO: ${order.summary.no_cheese_count}`);
  if (order.summary.lomitos && order.summary.lomitos.total > 0) {
    push('');
    pushWrapped('', `LOMITOS: ${order.summary.lomitos.total}`, true);
    for (const [cheese, amount] of Object.entries(order.summary.lomitos.cheese_counts)) if (amount > 0) pushWrapped('', `${cheese.toUpperCase()}: ${amount}`);
    if (order.summary.lomitos.no_cheese_count > 0) pushWrapped('', `LOMITOS SIN QUESO: ${order.summary.lomitos.no_cheese_count}`);
  }
  push('-'.repeat(columns));
  push('');

  return { text: lines.map((line) => alignForText(line, columns)).join('\n'), orderNumber: order.number, lines };
}
