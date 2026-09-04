export type JobStatus = 'RECEIVED' | 'PRINTING' | 'PRINTED' | 'ACKED' | 'FAILED' | 'AMBIGUOUS';

export interface PrintItem { quantity: number; name: string; variant?: string | null; removed_ingredients: string[]; added_extras: string[]; sauces: string[] }
export interface PrintSummary { total_medallions: number; cheese_counts: Record<string, number>; no_cheese_count: number; tybo_count?: number; cheddar_count?: number; roquefort_count?: number }
export interface PrintOrder { number: number; time: string; accepted_at?: string; items: PrintItem[]; summary: PrintSummary }
export interface PrintJob { schema_version: 1; job_id: string; claim_token: string; lease_expires_at: string; order: PrintOrder }
export interface RenderedTicket { text: string; orderNumber: number }
export interface Printer { print(ticket: RenderedTicket, jobId: string): Promise<void> }
export interface AgentConfig { serverUrl: string; agentToken: string; locationId: string; dataDir: string; longPollWaitSeconds: number; requestTimeoutMs: number; printer: { driver: 'mock' } }
