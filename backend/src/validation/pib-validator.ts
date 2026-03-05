/**
 * PIB (Poreski Identifikacioni Broj) Validator
 *
 * Implements iterative modulo-11 checksum validation per Serbian tax authority.
 * Algorithm per FR-043b and Poreska uprava RS.
 *
 * PIB format: 9 digits (XXXXXXXXX)
 * - First 8 digits: identification number
 * - 9th digit: control digit (checksum)
 *
 * Checksum algorithm (iterative modulo-11):
 * 1. Initialize sum = 10
 * 2. For each of first 8 digits:
 *    - sum = (sum + digit) mod 10
 *    - sum = (sum === 0 ? 10 : sum) * 2 mod 11
 * 3. Control digit = (11 - sum) mod 10
 *
 * Examples:
 * - Valid PIB: 100001011, 106006802, 115190346
 * - Invalid PIB: 123456789 (wrong checksum)
 *
 * References:
 * - FR-043b: PIB validation requirement
 * - https://mladsoft.com/2019/06/04/validacija-pib-mb-i-dr/
 */

export interface PIBValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate PIB format (9 digits, no letters or special characters)
 *
 * @param pib - PIB string to validate
 * @returns True if format is correct (9 digits)
 */
export function isValidPIBFormat(pib: string): boolean {
  // Must be exactly 9 digits
  return /^\d{9}$/.test(pib);
}

/**
 * Calculate PIB control digit using iterative modulo-11 algorithm
 *
 * Correct Serbian PIB algorithm per Poreska uprava RS:
 * 1. Initialize sum = 10
 * 2. For each of 8 digits: sum = (sum + digit) % 10; sum = (sum === 0 ? 10 : sum) * 2 % 11
 * 3. Control digit = (11 - sum) % 10
 *
 * @param pib - First 8 digits of PIB
 * @returns Control digit (0-9), or -1 if input invalid
 */
export function calculatePIBControlDigit(pib: string): number {
  if (pib.length !== 8 || !/^\d{8}$/.test(pib)) {
    return -1;
  }

  let suma = 10;
  for (let i = 0; i < 8; i++) {
    suma = (suma + parseInt(pib.charAt(i), 10)) % 10;
    suma = (suma === 0 ? 10 : suma) * 2 % 11;
  }

  return (11 - suma) % 10;
}

/**
 * Validate complete PIB (9 digits with checksum)
 *
 * @param pib - Full 9-digit PIB
 * @returns Validation result with error message if invalid
 */
export function validatePIB(pib: string): PIBValidationResult {
  // Remove spaces and dashes for flexibility
  const cleanPIB = pib.replace(/[\s-]/g, '');

  // Check format
  if (!isValidPIBFormat(cleanPIB)) {
    return {
      isValid: false,
      error: 'ПИБ мора бити тачно 9 цифара (формат: XXXXXXXXX)',
    };
  }

  // Extract first 8 digits and control digit
  const first8Digits = cleanPIB.substring(0, 8);
  const providedControlDigit = parseInt(cleanPIB[8] || '0', 10);

  // Calculate expected control digit
  const expectedControlDigit = calculatePIBControlDigit(first8Digits);

  // Check for invalid control digit (result was -1)
  if (expectedControlDigit === -1) {
    return {
      isValid: false,
      error: 'Неисправан ПИБ - контролна цифра не може бити израчуната',
    };
  }

  // Verify control digit matches
  if (providedControlDigit !== expectedControlDigit) {
    return {
      isValid: false,
      error: `Неисправан ПИБ - контролна цифра треба бити ${expectedControlDigit}, а унета је ${providedControlDigit}`,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Format PIB for display (add spaces for readability)
 *
 * @param pib - PIB string
 * @returns Formatted PIB (XXX XXX XXX)
 */
export function formatPIB(pib: string): string {
  const cleanPIB = pib.replace(/[\s-]/g, '');

  if (cleanPIB.length !== 9) {
    return pib; // Return as-is if invalid length
  }

  return `${cleanPIB.substring(0, 3)} ${cleanPIB.substring(3, 6)} ${cleanPIB.substring(6, 9)}`;
}

/**
 * Generate test PIB with valid checksum (for testing only!)
 *
 * @param first8Digits - First 8 digits (as string)
 * @returns Complete 9-digit PIB with valid checksum
 */
export function generateTestPIB(first8Digits: string): string | null {
  if (first8Digits.length !== 8 || !/^\d{8}$/.test(first8Digits)) {
    return null;
  }

  const controlDigit = calculatePIBControlDigit(first8Digits);

  if (controlDigit === -1) {
    return null; // Cannot generate valid PIB
  }

  return first8Digits + controlDigit.toString();
}
