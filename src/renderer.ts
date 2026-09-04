import type { PrintJob, RenderedTicket } from './types.js';
const divider = '-'.repeat(32);
export function renderKitchenTicket(job: PrintJob): RenderedTicket {
  const { order } = job; const lines = ['='.repeat(32), `          PEDIDO #${order.number}`, `             ${order.time}`, '='.repeat(32), ''];
  for (const item of order.items) { lines.push(`${item.quantity}x ${item.name.toUpperCase()}`); if (item.variant) lines.push(`   ${item.variant.toUpperCase()}`); for (const x of item.removed_ingredients) lines.push(`   - SIN ${x.toUpperCase()}`); for (const x of item.added_extras) lines.push(`   + ${x.toUpperCase()}`); if (item.sauces.length) lines.push(`   ADEREZOS: ${item.sauces.map((x) => x.toUpperCase()).join(' / ')}`); lines.push(''); }
  lines.push(divider, `MEDALLONES: ${order.summary.total_medallions}`, '');
  for (const [cheese, amount] of Object.entries(order.summary.cheese_counts)) if (amount > 0) lines.push(`${cheese.toUpperCase()}: ${amount}`);
  if (order.summary.no_cheese_count > 0) lines.push(`SIN QUESO: ${order.summary.no_cheese_count}`); lines.push(divider, '');
  return { text: lines.join('\n'), orderNumber: order.number };
}
