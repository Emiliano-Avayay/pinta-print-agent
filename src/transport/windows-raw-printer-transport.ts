import { spawn } from 'node:child_process';
import type { PrinterTransport } from './printer-transport.js';

export class WindowsRawPrinterError extends Error {
  constructor(message: string, public readonly operation: 'open' | 'write' | 'close', options?: ErrorOptions) {
    super(message, options);
    this.name = 'WindowsRawPrinterError';
  }
}

export interface RawPrinterSpooler {
  writeRaw(printerName: string, data: Uint8Array): Promise<void>;
}

export interface WindowsRawPrinterTransportOptions { printerName: string; spooler?: RawPrinterSpooler; platform?: string }

const powershellScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PintaWinSpool {
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int level, ref DOCINFO doc);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] bytes, int count, out int written);
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
}
'@
$handle = [IntPtr]::Zero; $documentStarted = $false; $pageStarted = $false
try {
 if (-not [PintaWinSpool]::OpenPrinter($env:PINTA_RAW_PRINTER_NAME, [ref]$handle, [IntPtr]::Zero)) { throw "OpenPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
 $doc = New-Object PintaWinSpool+DOCINFO; $doc.pDocName = 'Pinta Print Agent'; $doc.pDataType = 'RAW'
 if ([PintaWinSpool]::StartDocPrinter($handle, 1, [ref]$doc) -eq 0) { throw "StartDocPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }; $documentStarted = $true
 if (-not [PintaWinSpool]::StartPagePrinter($handle)) { throw "StartPagePrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }; $pageStarted = $true
 $bytes = [Convert]::FromBase64String($env:PINTA_RAW_PRINTER_BYTES); $written = 0
 if (-not [PintaWinSpool]::WritePrinter($handle, $bytes, $bytes.Length, [ref]$written) -or $written -ne $bytes.Length) { throw "WritePrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
} finally {
 if ($pageStarted) { [void][PintaWinSpool]::EndPagePrinter($handle) }
 if ($documentStarted) { [void][PintaWinSpool]::EndDocPrinter($handle) }
 if ($handle -ne [IntPtr]::Zero) { [void][PintaWinSpool]::ClosePrinter($handle) }
}
`;

/** Windows-only adapter. Each write is one RAW spooler document, atomically opened and closed by Win32. */
export class PowerShellRawPrinterSpooler implements RawPrinterSpooler {
  async writeRaw(printerName: string, data: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', powershellScript], {
        windowsHide: true,
        env: { ...process.env, PINTA_RAW_PRINTER_NAME: printerName, PINTA_RAW_PRINTER_BYTES: Buffer.from(data).toString('base64') },
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.once('error', (error) => reject(new WindowsRawPrinterError(`Could not start Windows RAW spooler: ${error.message}`, 'write', { cause: error })));
      child.once('close', (code) => code === 0 ? resolve() : reject(new WindowsRawPrinterError(`Windows RAW spooler write failed${stderr ? `: ${stderr.trim()}` : ` (exit ${code})`}`, 'write')));
    });
  }
}

export class WindowsRawPrinterTransport implements PrinterTransport {
  private opened = false;
  private readonly spooler: RawPrinterSpooler;
  constructor(private readonly options: WindowsRawPrinterTransportOptions) {
    if (!options.printerName.trim()) throw new WindowsRawPrinterError('Windows printer name is required', 'open');
    this.spooler = options.spooler ?? new PowerShellRawPrinterSpooler();
  }
  async open(): Promise<void> {
    if (this.opened) throw new WindowsRawPrinterError('Windows RAW printer transport is already open', 'open');
    if ((this.options.platform ?? process.platform) !== 'win32') throw new WindowsRawPrinterError('Windows RAW printing requires Windows', 'open');
    this.opened = true;
  }
  async write(data: Uint8Array): Promise<void> {
    if (!this.opened) throw new WindowsRawPrinterError('Windows RAW printer transport must be open before write', 'write');
    try { await this.spooler.writeRaw(this.options.printerName, data); }
    catch (error) { throw error instanceof WindowsRawPrinterError ? error : new WindowsRawPrinterError(`Windows RAW printer write failed: ${error instanceof Error ? error.message : String(error)}`, 'write', { cause: error }); }
  }
  async close(): Promise<void> {
    if (!this.opened) throw new WindowsRawPrinterError('Windows RAW printer transport is not open', 'close');
    this.opened = false;
  }
}
