import { SerialPort } from 'serialport';
import type { BluetoothPrinterSettings } from '../types.js';
import type { PrinterTransport } from './printer-transport.js';

export class BluetoothSerialError extends Error {
  constructor(message: string, public readonly operation: 'open' | 'write' | 'close', options?: ErrorOptions) { super(message, options); this.name = 'BluetoothSerialError'; }
}
export interface SerialPortLike {
  isOpen: boolean;
  open(callback: (error?: Error | null) => void): void;
  write(data: Uint8Array, callback: (error?: Error | null) => void): void;
  drain(callback: (error?: Error | null) => void): void;
  close(callback: (error?: Error | null) => void): void;
}
export type SerialPortFactory = (settings: BluetoothPrinterSettings) => SerialPortLike;
export interface BluetoothSerialTransportOptions extends BluetoothPrinterSettings { factory?: SerialPortFactory }
const invoke = (run: (callback: (error?: Error | null) => void) => void): Promise<void> => new Promise((resolve, reject) => run((error) => error ? reject(error) : resolve()));
const defaultFactory: SerialPortFactory = ({ port, baudRate }) => new SerialPort({ path: port, baudRate, autoOpen: false });

/** Bluetooth SPP adapter: Windows exposes paired compatible printers as serial COM ports. */
export class BluetoothSerialTransport implements PrinterTransport {
  private port: SerialPortLike | undefined;
  private readonly factory: SerialPortFactory;
  constructor(private readonly options: BluetoothSerialTransportOptions) {
    if (!options.port.trim()) throw new BluetoothSerialError('Bluetooth serial port is required', 'open');
    if (!Number.isFinite(options.baudRate) || options.baudRate <= 0) throw new BluetoothSerialError('Bluetooth baud rate must be positive', 'open');
    this.factory = options.factory ?? defaultFactory;
  }
  async open(): Promise<void> {
    if (this.port) throw new BluetoothSerialError('Bluetooth serial transport is already open', 'open');
    const port = this.factory({ port: this.options.port, baudRate: this.options.baudRate });
    try { await invoke((callback) => port.open(callback)); this.port = port; }
    catch (error) { throw new BluetoothSerialError(`Could not open Bluetooth serial port ${this.options.port}: ${error instanceof Error ? error.message : String(error)}`, 'open', { cause: error }); }
  }
  async write(data: Uint8Array): Promise<void> {
    if (!this.port?.isOpen) throw new BluetoothSerialError('Bluetooth serial transport must be open before write', 'write');
    try { await invoke((callback) => this.port?.write(data, callback)); await invoke((callback) => this.port?.drain(callback)); }
    catch (error) { throw new BluetoothSerialError(`Bluetooth serial write to ${this.options.port} failed: ${error instanceof Error ? error.message : String(error)}`, 'write', { cause: error }); }
  }
  async close(): Promise<void> {
    const port = this.port;
    if (!port) throw new BluetoothSerialError('Bluetooth serial transport is not open', 'close');
    this.port = undefined;
    if (!port.isOpen) return;
    try { await invoke((callback) => port.close(callback)); }
    catch (error) { throw new BluetoothSerialError(`Could not close Bluetooth serial port ${this.options.port}: ${error instanceof Error ? error.message : String(error)}`, 'close', { cause: error }); }
  }
}
