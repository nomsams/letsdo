import QRCode from 'qrcode';
import { invitationFromLink } from './experience.ts';

/** Generate locally: the private invitation never goes to a QR service. */
export async function invitationQrSvg(invite: string): Promise<string> {
  if (!/^https?:\/\//i.test(invite) || !invitationFromLink(invite, invite)) throw new Error('A complete Near invitation is required');
  return QRCode.toString(invite, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 320,
    color: { dark: '#172554', light: '#ffffff' },
  });
}
