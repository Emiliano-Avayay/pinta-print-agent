import type { RenderedTicket, RenderedTicketLine } from '../types.js';
import {
  createPrinterProfile,
  DEVELOPMENT_PROFILE_80MM,
  type PrinterProfile,
} from './profile.js';
import { AsciiSafeTextEncoder, type TextEncoderStrategy } from './text-encoding.js';

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

const immutableCommand = <T extends readonly number[]>(...bytes: T): Readonly<T> =>
  Object.freeze(bytes);

export const ESC_POS_COMMANDS = Object.freeze({
  initialize: immutableCommand(ESC, 0x40),
  align: Object.freeze({
    left: immutableCommand(ESC, 0x61, 0x00),
    center: immutableCommand(ESC, 0x61, 0x01),
    right: immutableCommand(ESC, 0x61, 0x02),
  }),
  bold: Object.freeze({
    off: immutableCommand(ESC, 0x45, 0x00),
    on: immutableCommand(ESC, 0x45, 0x01),
  }),
  size: Object.freeze({
    normal: immutableCommand(GS, 0x21, 0x00),
    double: immutableCommand(GS, 0x21, 0x11),
  }),
  feed: immutableCommand(ESC, 0x64),
  cut: immutableCommand(GS, 0x56, 0x00),
});

type EncoderState = Pick<RenderedTicketLine, 'align' | 'bold' | 'size'>;

const append = (target: number[], bytes: Iterable<number>): void => {
  for (const byte of bytes) target.push(byte);
};

const appendAlignment = (target: number[], alignment: RenderedTicketLine['align']): void => {
  append(target, ESC_POS_COMMANDS.align[alignment]);
};

const appendBold = (target: number[], bold: boolean): void => {
  append(target, bold ? ESC_POS_COMMANDS.bold.on : ESC_POS_COMMANDS.bold.off);
};

const appendSize = (target: number[], size: RenderedTicketLine['size']): void => {
  append(target, ESC_POS_COMMANDS.size[size]);
};

export class EscPosEncoder {
  private readonly profile: PrinterProfile;

  constructor(
    profile: Readonly<PrinterProfile> = DEVELOPMENT_PROFILE_80MM,
    private readonly textEncoder: TextEncoderStrategy = new AsciiSafeTextEncoder(),
  ) {
    this.profile = createPrinterProfile(profile);
    if (this.profile.characterEncoding !== this.textEncoder.name) {
      throw new RangeError(`profile encoding "${this.profile.characterEncoding}" requires a matching text encoder strategy`);
    }
  }

  encode(ticket: RenderedTicket): Uint8Array {
    const output: number[] = [];
    const state: EncoderState = { align: 'left', bold: false, size: 'normal' };

    append(output, ESC_POS_COMMANDS.initialize);

    for (const line of ticket.lines) {
      if (line.align !== state.align) {
        appendAlignment(output, line.align);
        state.align = line.align;
      }
      if (line.bold !== state.bold) {
        appendBold(output, line.bold);
        state.bold = line.bold;
      }
      if (line.size !== state.size) {
        appendSize(output, line.size);
        state.size = line.size;
      }

      append(output, this.textEncoder.encode(line.text));
      output.push(LF);
    }

    appendAlignment(output, 'left');
    appendBold(output, false);
    appendSize(output, 'normal');
    append(output, ESC_POS_COMMANDS.feed);
    output.push(this.profile.finalFeedLines);

    if (this.profile.supportsCut) append(output, ESC_POS_COMMANDS.cut);

    return Uint8Array.from(output);
  }
}
