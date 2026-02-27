/**
 * IPS QR Code Generator (Backend)
 *
 * Generates IPS (Instant Payment System) QR code strings
 * according to NBS (National Bank of Serbia) specification.
 *
 * Used for generating QR codes in PDF invoices.
 */

export interface IpsQrParams {
  /** Recipient bank account number (tekuci racun) */
  racunPrimaoca: string;
  /** Recipient name */
  nazivPrimaoca: string;
  /** Amount in RSD (e.g., 1990 for 1.990 RSD) */
  iznos: number;
  /** Payment reference number (poziv na broj) */
  pozivNaBroj: string;
  /** Payment purpose */
  svrhaPlacanja?: string;
  /** Payment code (sifra placanja) - default 289 */
  sifraPlacanja?: string;
}

/**
 * NKNet Consulting DOO - hardcoded payment info
 */
export const NKNET_PAYMENT_INFO = {
  racunPrimaoca: '265-6510310002605-07',
  nazivPrimaoca: 'NKNet Consulting DOO, Karadjordeva 18a, 26101 Pancevo',
  sifraPlacanja: '289',
  pib: '115190346',
  mb: '22125338',
  adresa: 'Karadjordeva 18a, 26101 Pancevo',
  fullName: 'NKNet Consulting DOO',
  banka: 'Raiffeisen banka',
};

/**
 * Generate IPS QR payload string per NBS specification
 *
 * Format: K:PR|V:01|C:1|R:{account}|N:{name}|I:RSD{amount}|P:{purpose}|SF:{code}|S:{reference}
 */
export function generateIpsQrString(params: IpsQrParams): string {
  const {
    racunPrimaoca,
    nazivPrimaoca,
    iznos,
    pozivNaBroj,
    svrhaPlacanja = 'BZR Savetnik pretplata',
    sifraPlacanja = '289',
  } = params;

  // Format amount: NBS uses comma as decimal separator, 2 decimal places
  const formattedAmount = iznos.toFixed(2).replace('.', ',');

  const parts = [
    'K:PR',
    'V:01',
    'C:1',
    `R:${racunPrimaoca}`,
    `N:${nazivPrimaoca}`,
    `I:RSD${formattedAmount}`,
    `P:${svrhaPlacanja}`,
    `SF:${sifraPlacanja}`,
    `S:${pozivNaBroj}`,
  ];

  return parts.join('|');
}
