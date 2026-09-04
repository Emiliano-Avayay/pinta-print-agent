export type JobStatus = 'RECEIVED' | 'PRINTING' | 'PRINTED' | 'ACKED' | 'FAILED' | 'AMBIGUOUS';

export interface PrintItem { quantity: number; name: string; variant?: string | null; removed_ingredients: string[]; added_extras: string[]; sauces: string[] }
export interface PrintSummary { total_medallions: number; cheese_counts: Record<string, number>; no_cheese_count: number; tybo_count?: number; cheddar_count?: number; roquefort_count?: number }
export interface PrintOrder { number: number; time: string; accepted_at?: string; items: PrintItem[]; summary: PrintSummary }
export interface PrintJob { schema_version: 1; job_id: string; claim_token: string; lease_expires_at: string; order: PrintOrder }
export type TicketAlignment = 'left' | 'center' | 'right';
export type TicketTextSize = 'normal' | 'double';
export interface RenderedTicketLine { text: string; align: TicketAlignment; bold: boolean; size: TicketTextSize }
export interface RenderedTicket { text: string; orderNumber: number; lines: readonly RenderedTicketLine[] }
export interface Printer { print(ticket: RenderedTicket, jobId: string): Promise<void> }
export type PrinterConfig = { driver: 'mock' } | { driver: 'escpos-fake'; profile: '58mm' | '80mm'; supportsCut: boolean };
export interface AgentConfig { serverUrl: string; agentToken: string; locationId: string; dataDir: string; longPollWaitSeconds: number; requestTimeoutMs: number; printer: PrinterConfig }
