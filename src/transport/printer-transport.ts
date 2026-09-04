export interface PrinterTransport {
  open(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
