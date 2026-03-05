import { describe, it, expect } from 'vitest';
import {
  validatePIB,
  calculatePIBControlDigit,
  isValidPIBFormat,
  formatPIB,
  generateTestPIB,
} from '../../../src/validation/pib-validator';

/**
 * Unit Tests for PIB Validator
 *
 * Tests T057a: PIB modulo-11 checksum validation per FR-043b
 * Reference: Serbian Tax Authority PIB validation algorithm (iterative modulo-11)
 */

describe('PIB Validator - Format Validation', () => {
  it('should accept valid 9-digit PIB format', () => {
    expect(isValidPIBFormat('123456789')).toBe(true);
    expect(isValidPIBFormat('000000000')).toBe(true);
    expect(isValidPIBFormat('999999999')).toBe(true);
  });

  it('should reject PIB with less than 9 digits', () => {
    expect(isValidPIBFormat('12345678')).toBe(false);
    expect(isValidPIBFormat('1234567')).toBe(false);
    expect(isValidPIBFormat('')).toBe(false);
  });

  it('should reject PIB with more than 9 digits', () => {
    expect(isValidPIBFormat('1234567890')).toBe(false);
    expect(isValidPIBFormat('12345678901')).toBe(false);
  });

  it('should reject PIB with letters', () => {
    expect(isValidPIBFormat('12345678A')).toBe(false);
    expect(isValidPIBFormat('ABC123456')).toBe(false);
  });

  it('should reject PIB with special characters', () => {
    expect(isValidPIBFormat('123-456-789')).toBe(false);
    expect(isValidPIBFormat('123 456 789')).toBe(false);
    expect(isValidPIBFormat('123.456.789')).toBe(false);
  });
});

describe('PIB Validator - Control Digit Calculation', () => {
  it('should calculate correct control digit for known valid PIBs', () => {
    // PIB 100123145: control digit = 5
    expect(calculatePIBControlDigit('10012314')).toBe(5);

    // PIB 101590788: control digit = 8
    expect(calculatePIBControlDigit('10159078')).toBe(8);

    // PIB 100003574: control digit = 4
    expect(calculatePIBControlDigit('10000357')).toBe(4);
  });

  it('should handle control digit = 0', () => {
    // PIB 100000090: control digit = 0
    const pib = '10000009';
    const controlDigit = calculatePIBControlDigit(pib);
    expect(controlDigit).toBe(0);
  });

  it('should return -1 for invalid input (not 8 digits)', () => {
    expect(calculatePIBControlDigit('1234567')).toBe(-1);
    expect(calculatePIBControlDigit('123456789')).toBe(-1);
    expect(calculatePIBControlDigit('')).toBe(-1);
  });

  it('should calculate correctly with iterative modulo-11 algorithm', () => {
    // Test with all 1s: iterative algorithm gives control digit 7
    expect(calculatePIBControlDigit('11111111')).toBe(7);
  });

  it('should handle various PIB prefixes', () => {
    const testPib = '10101010';
    const controlDigit = calculatePIBControlDigit(testPib);
    expect(controlDigit).toBeGreaterThanOrEqual(0);
    expect(controlDigit).toBeLessThanOrEqual(9);
    expect(controlDigit).toBe(1);
  });
});

describe('PIB Validator - Full Validation', () => {
  it('should validate known correct PIBs', () => {
    // Real valid PIBs (publicly known companies)
    const result1 = validatePIB('100123145');
    expect(result1.isValid).toBe(true);
    expect(result1.error).toBeUndefined();

    const result2 = validatePIB('101590788'); // NIS
    expect(result2.isValid).toBe(true);
    expect(result2.error).toBeUndefined();

    const result3 = validatePIB('115190346'); // NKNet Consulting
    expect(result3.isValid).toBe(true);
    expect(result3.error).toBeUndefined();
  });

  it('should reject PIBs with incorrect checksum', () => {
    // Valid format, wrong checksum (should be 5, but using 4)
    const result = validatePIB('100123144');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('контролна цифра');
    expect(result.error).toContain('5'); // Expected
    expect(result.error).toContain('4'); // Provided
  });

  it('should reject PIBs with invalid format', () => {
    const result = validatePIB('12345'); // Too short
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('9 цифара');
  });

  it('should handle PIB with spaces (strip and validate)', () => {
    // Valid PIB with spaces should still validate
    const result = validatePIB('100 123 145');
    expect(result.isValid).toBe(true);
  });

  it('should handle PIB with dashes (strip and validate)', () => {
    const result = validatePIB('100-123-145');
    expect(result.isValid).toBe(true);
  });

  it('should validate mathematically correct PIBs (even if not real)', () => {
    // These PIBs are mathematically valid per iterative mod-11 algorithm
    expect(validatePIB('000000003').isValid).toBe(true); // All zeros with control digit 3
    expect(validatePIB('111111117').isValid).toBe(true); // All ones with correct control digit 7
    expect(validatePIB('999999995').isValid).toBe(true); // All nines with correct control digit 5
  });

  it('should provide Serbian error messages', () => {
    const result = validatePIB('12345');
    expect(result.error).toMatch(/ПИБ мора бити/);
    expect(result.error).toContain('цифара');
  });
});

describe('PIB Validator - Formatting', () => {
  it('should format PIB with spaces (XXX XXX XXX)', () => {
    expect(formatPIB('100123145')).toBe('100 123 145');
    expect(formatPIB('101590788')).toBe('101 590 788');
  });

  it('should handle already formatted PIB', () => {
    expect(formatPIB('100 123 145')).toBe('100 123 145');
  });

  it('should return original if invalid length', () => {
    expect(formatPIB('12345')).toBe('12345');
    expect(formatPIB('1234567890')).toBe('1234567890');
  });
});

describe('PIB Validator - Test PIB Generation', () => {
  it('should generate valid test PIB from 8 digits', () => {
    const testPib = generateTestPIB('10012314');
    expect(testPib).toBe('100123145');

    // Verify generated PIB is actually valid
    if (testPib) {
      const validation = validatePIB(testPib);
      expect(validation.isValid).toBe(true);
    }
  });

  it('should return null for invalid 8-digit input', () => {
    expect(generateTestPIB('1234567')).toBeNull(); // Too short
    expect(generateTestPIB('123456789')).toBeNull(); // Too long
    expect(generateTestPIB('1234567A')).toBeNull(); // Has letter
  });

  it('should generate different valid PIBs for different inputs', () => {
    const pib1 = generateTestPIB('10000000');
    const pib2 = generateTestPIB('20000000');

    expect(pib1).not.toBeNull();
    expect(pib2).not.toBeNull();
    expect(pib1).not.toBe(pib2);

    // Both should be valid
    if (pib1) expect(validatePIB(pib1).isValid).toBe(true);
    if (pib2) expect(validatePIB(pib2).isValid).toBe(true);
  });
});

describe('PIB Validator - Edge Cases', () => {
  it('should handle leading zeros', () => {
    const testPib = generateTestPIB('00000001');
    if (testPib) {
      expect(validatePIB(testPib).isValid).toBe(true);
      expect(testPib.startsWith('0')).toBe(true);
    }
  });

  it('should validate PIB with control digit 0', () => {
    const testPib = generateTestPIB('10000009'); // Should result in control digit 0
    expect(testPib).toBe('100000090');
    expect(validatePIB(testPib!).isValid).toBe(true);
  });

  it('should correctly calculate modulo-11 for boundary values', () => {
    // Test PIB where control digit is 0
    const pib = '10000009';
    const controlDigit = calculatePIBControlDigit(pib);
    expect(controlDigit).toBe(0);
  });
});

describe('PIB Validator - Real-world Examples', () => {
  it('should validate NKNet Consulting PIB (115190346)', () => {
    const result = validatePIB('115190346');
    expect(result.isValid).toBe(true);
  });

  it('should validate NIS (101590788)', () => {
    const result = validatePIB('101590788');
    expect(result.isValid).toBe(true);
  });

  it('should reject fake PIB with sequential digits', () => {
    const result = validatePIB('123456789');
    expect(result.isValid).toBe(false);
  });

  it('should reject fake PIB with all same digits', () => {
    expect(validatePIB('111111111').isValid).toBe(false);
    expect(validatePIB('222222222').isValid).toBe(false);
    expect(validatePIB('999999999').isValid).toBe(false);
  });
});
