import { createHash } from 'node:crypto';
import type { PrintJob } from './types.js';
export class JobValidationError extends Error { constructor(public readonly code: string, message: string) { super(message); } }
const object = (v: unknown, name: string): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new JobValidationError('INVALID_PAYLOAD', `${name} must be an object`); return v as Record<string, unknown>; };
const text = (v: unknown, name: string, empty = false): string => { if (typeof v !== 'string' || (!empty && !v.trim())) throw new JobValidationError('INVALID_PAYLOAD', `${name} must be text`); return v; };
const count = (v: unknown, name: string, minimum = 0): number => { if (!Number.isInteger(v) || (v as number) < minimum) throw new JobValidationError('INVALID_PAYLOAD', `${name} must be integer >= ${minimum}`); return v as number; };
const strings = (v: unknown, name: string): string[] => { if (!Array.isArray(v)) throw new JobValidationError('INVALID_PAYLOAD', `${name} must be an array`); return v.map((x) => text(x, name)); };

export function parsePrintJob(input: unknown): PrintJob {
  const root = object(input, 'job'); if (root.schema_version !== 1) throw new JobValidationError('UNSUPPORTED_SCHEMA_VERSION', 'Only schema_version 1 is supported');
  const orderRaw = object(root.order, 'order'); const summaryRaw = object(orderRaw.summary, 'order.summary'); const cheeseRaw = object(summaryRaw.cheese_counts, 'summary.cheese_counts');
  const cheese_counts: Record<string, number> = {}; for (const [name, value] of Object.entries(cheeseRaw)) cheese_counts[text(name, 'cheese name')] = count(value, `cheese_counts.${name}`);
  const summary = { total_medallions: count(summaryRaw.total_medallions, 'total_medallions'), cheese_counts, no_cheese_count: count(summaryRaw.no_cheese_count, 'no_cheese_count'), ...(['tybo_count', 'cheddar_count', 'roquefort_count'].reduce((r, k) => summaryRaw[k] === undefined ? r : { ...r, [k]: count(summaryRaw[k], k) }, {})) };
  const sum = Object.values(cheese_counts).reduce((a, b) => a + b, 0) + summary.no_cheese_count;
  if (summary.total_medallions !== sum) throw new JobValidationError('INVALID_MEDALLION_SUMMARY', 'total_medallions does not equal cheeses plus no_cheese_count');
  if (!Array.isArray(orderRaw.items) || !orderRaw.items.length) throw new JobValidationError('INVALID_PAYLOAD', 'order.items must be a non-empty array');
  const items = orderRaw.items.map((raw) => { const x = object(raw, 'item'); return { quantity: count(x.quantity, 'item.quantity', 1), name: text(x.name, 'item.name'), variant: x.variant == null ? null : text(x.variant, 'item.variant', true), removed_ingredients: strings(x.removed_ingredients, 'item.removed_ingredients'), added_extras: strings(x.added_extras, 'item.added_extras'), sauces: strings(x.sauces, 'item.sauces') }; });
  const lomitosRaw = summaryRaw.lomitos;
  const lomitos = lomitosRaw === undefined ? undefined : (() => { const x = object(lomitosRaw, 'summary.lomitos'); const cheeses = object(x.cheese_counts, 'summary.lomitos.cheese_counts'); const counts: Record<string, number> = {}; for (const [name, value] of Object.entries(cheeses)) counts[text(name, 'lomito cheese')] = count(value, `lomito cheese ${name}`); const result = { total: count(x.total, 'summary.lomitos.total'), cheese_counts: counts, no_cheese_count: count(x.no_cheese_count, 'summary.lomitos.no_cheese_count') }; if (result.total !== Object.values(counts).reduce((a, b) => a + b, 0) + result.no_cheese_count) throw new JobValidationError('INVALID_LOMITO_SUMMARY', 'lomitos total does not equal cheeses plus no_cheese_count'); return result; })();
  return { schema_version: 1, job_id: text(root.job_id, 'job_id'), claim_token: text(root.claim_token, 'claim_token'), lease_expires_at: text(root.lease_expires_at, 'lease_expires_at'), order: { number: count(orderRaw.number, 'order.number', 1), time: text(orderRaw.time, 'order.time'), ...(typeof orderRaw.accepted_at === 'string' ? { accepted_at: orderRaw.accepted_at } : {}), items, summary: { ...summary, ...(lomitos ? { lomitos } : {}) } } };
}
const canonicalize = (value: unknown): unknown => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])])) : value;
export const payloadHash = (job: PrintJob): string => createHash('sha256').update(JSON.stringify(canonicalize({ schema_version: job.schema_version, order: job.order }))).digest('hex');
