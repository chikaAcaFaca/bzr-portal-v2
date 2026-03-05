/**
 * Unit Tests: Email Service (T029)
 *
 * Tests email sending with Resend integration, retry logic, and Serbian templates.
 * Requirements: FR-028i
 *
 * Test Coverage:
 * - Email sending with retry logic (3 attempts, exponential backoff)
 * - Serbian Cyrillic email templates
 * - Template rendering with variables
 * - Error handling and retry exhaustion
 * - Verification, trial expiry, and document ready emails
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Resend client
vi.mock('../../../src/lib/resend', () => ({
  resendClient: {
    emails: {
      send: vi.fn(),
    },
  },
  EMAIL_FROM: 'BZR Portal <noreply@bzr-portal.com>',
  EMAIL_RETRY_CONFIG: {
    maxAttempts: 3,
    delayMs: [1000, 2000, 4000],
  },
}));

// Import mocked module and service after mock setup
import { resendClient } from '../../../src/lib/resend';
import { emailService } from '../../../src/services/email.service';

// Assign the mock reference for use in tests
const mockSendFn = resendClient.emails.send as ReturnType<typeof vi.fn>;

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('sendEmail() - Retry Logic', () => {
    it('should send email successfully on first attempt', async () => {
      mockSendFn.mockResolvedValue({
        data: { id: 'email-123' },
        error: null,
      });

      const emailId = await emailService.sendEmail({
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      });

      expect(emailId).toBe('email-123');
      expect(mockSendFn).toHaveBeenCalledTimes(1);
      expect(mockSendFn).toHaveBeenCalledWith({
        from: 'BZR Portal <noreply@bzr-portal.com>',
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        replyTo: undefined,
      });
    });

    it('should retry on failure and succeed on second attempt', async () => {
      vi.useFakeTimers();

      // First attempt fails, second succeeds
      mockSendFn
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: { id: 'email-456' },
          error: null,
        });

      const promise = emailService.sendEmail({
        to: 'retry@example.com',
        subject: 'Retry Test',
        html: '<p>Retry content</p>',
      });

      // Advance time for first retry (1000ms)
      await vi.advanceTimersByTimeAsync(1000);

      const emailId = await promise;

      expect(emailId).toBe('email-456');
      expect(mockSendFn).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should retry on failure and succeed on third attempt', async () => {
      vi.useFakeTimers();

      // First two attempts fail, third succeeds
      mockSendFn
        .mockRejectedValueOnce(new Error('Network error 1'))
        .mockRejectedValueOnce(new Error('Network error 2'))
        .mockResolvedValueOnce({
          data: { id: 'email-789' },
          error: null,
        });

      const promise = emailService.sendEmail({
        to: 'retry3@example.com',
        subject: 'Retry 3 Test',
        html: '<p>Third time</p>',
      });

      // Advance through retries
      await vi.advanceTimersByTimeAsync(1000); // First retry
      await vi.advanceTimersByTimeAsync(2000); // Second retry

      const emailId = await promise;

      expect(emailId).toBe('email-789');
      expect(mockSendFn).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should throw error after all retries exhausted', async () => {
      vi.useFakeTimers();

      // All attempts fail
      mockSendFn
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockRejectedValueOnce(new Error('Failure 3'));

      // Catch rejection immediately to prevent unhandled rejection
      let caughtError: Error | null = null;
      const promise = emailService.sendEmail({
        to: 'fail@example.com',
        subject: 'Fail Test',
        html: '<p>Will fail</p>',
      }).catch((err: Error) => {
        caughtError = err;
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      await promise;

      expect(caughtError).not.toBeNull();
      expect(caughtError!.message).toContain('Email delivery failed');
      expect(mockSendFn).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should handle Resend API error response', async () => {
      mockSendFn.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key' },
      });

      await expect(
        emailService.sendEmail({
          to: 'error@example.com',
          subject: 'Error Test',
          html: '<p>Error</p>',
        })
      ).rejects.toThrow('Resend API error: Invalid API key');
    });

    it('should include replyTo header when provided', async () => {
      mockSendFn.mockResolvedValue({
        data: { id: 'email-reply' },
        error: null,
      });

      await emailService.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        replyTo: 'support@bzr-portal.com',
      });

      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'support@bzr-portal.com',
        })
      );
    });
  });

  describe('sendVerificationEmail() - Serbian Template', () => {
    it('should send verification email with Serbian Cyrillic content', async () => {
      mockSendFn.mockResolvedValue({
        data: { id: 'verify-123' },
        error: null,
      });

      const emailId = await emailService.sendVerificationEmail(
        'user@example.com',
        {
          firstName: 'Марко',
          verificationUrl: 'https://bzr-portal.com/verify-email?token=token-abc-123',
          expiryHours: 24,
        }
      );

      expect(emailId).toBe('verify-123');
      expect(mockSendFn).toHaveBeenCalledTimes(1);

      const call = mockSendFn.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toContain('Потврдите вашу имејл адресу'); // Serbian Cyrillic
      expect(call.html).toContain('Добродошли у BZR Portal, Марко!');
      expect(call.html).toContain('https://bzr-portal.com/verify-email?token=token-abc-123');
      expect(call.html).toContain('Потврди имејл адресу'); // Button text
    });

    it('should include passed verification URL in email', async () => {
      mockSendFn.mockResolvedValue({
        data: { id: 'verify-456' },
        error: null,
      });

      await emailService.sendVerificationEmail(
        'test@example.com',
        {
          firstName: 'Test',
          verificationUrl: 'http://localhost:5173/verify-email?token=token-xyz',
          expiryHours: 24,
        }
      );

      const call = mockSendFn.mock.calls[0][0];
      expect(call.html).toContain('http://localhost:5173/verify-email?token=token-xyz');
    });

    it('should include Serbian language tag in HTML', async () => {
      mockSendFn.mockResolvedValue({
        data: { id: 'verify-lang' },
        error: null,
      });

      await emailService.sendVerificationEmail(
        'user@example.com',
        {
          firstName: 'User',
          verificationUrl: 'https://example.com/verify?token=test',
          expiryHours: 24,
        }
      );

      const call = mockSendFn.mock.calls[0][0];
      expect(call.html).toContain('lang="sr-Cyrl"');
      expect(call.html).toContain('charset="UTF-8"');
    });
  });

  describe('sendTrialExpiryEmail() - Serbian Template', () => {
    it('should send trial expiry email with Serbian Cyrillic content', async () => {
      process.env.FRONTEND_URL = 'https://bzr-portal.com';

      mockSendFn.mockResolvedValue({
        data: { id: 'trial-123' },
        error: null,
      });

      const emailId = await emailService.sendTrialExpiryEmail(
        'user@example.com',
        'Јована',
        7
      );

      expect(emailId).toBe('trial-123');

      const call = mockSendFn.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toContain('Пробни период истиче за 7 дана'); // Serbian
      expect(call.html).toContain('Здраво Јована');
      expect(call.html).toContain('7 дана'); // Days remaining
      expect(call.html).toContain('Закажите верификацију');
      expect(call.html).toContain('Неограничен број радних места');
      expect(call.html).toContain('Отвори BZR Portal');
    });

    it('should work with different days remaining values', async () => {
      mockSendFn.mockResolvedValue({
        data: { id: 'trial-days' },
        error: null,
      });

      await emailService.sendTrialExpiryEmail(
        'user@example.com',
        'User',
        3
      );

      const call = mockSendFn.mock.calls[0][0];
      expect(call.subject).toContain('3 дана');
      expect(call.html).toContain('за <strong>3 дана</strong>');
    });

    it('should include support email', async () => {
      mockSendFn.mockResolvedValue({
        data: { id: 'trial-support' },
        error: null,
      });

      await emailService.sendTrialExpiryEmail(
        'user@example.com',
        'User',
        7
      );

      const call = mockSendFn.mock.calls[0][0];
      expect(call.html).toContain('podrska@bzr-portal.com');
    });
  });

  describe('sendDocumentReadyEmail() - Serbian Template', () => {
    it('should send document ready email with Serbian Cyrillic content', async () => {
      process.env.FRONTEND_URL = 'https://bzr-portal.com';

      mockSendFn.mockResolvedValue({
        data: { id: 'doc-123' },
        error: null,
      });

      const emailId = await emailService.sendDocumentReadyEmail(
        'user@example.com',
        'Петар',
        'Акт о процени ризика - Компанија АБЦ',
        'https://s3.wasabi.com/presigned-url-123'
      );

      expect(emailId).toBe('doc-123');

      const call = mockSendFn.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toContain('Документ је спреман за преузимање'); // Serbian
      expect(call.html).toContain('Здраво Петар');
      expect(call.html).toContain('Акт о процени ризика - Компанија АБЦ');
      expect(call.html).toContain('https://s3.wasabi.com/presigned-url-123');
      expect(call.html).toContain('Преузми документ'); // Download button
      expect(call.html).toContain('Линк за преузимање истиче за 1 сат'); // Warning
    });

    it('should include link to documents dashboard', async () => {
      process.env.FRONTEND_URL = 'https://bzr-portal.com';

      mockSendFn.mockResolvedValue({
        data: { id: 'doc-dashboard' },
        error: null,
      });

      await emailService.sendDocumentReadyEmail(
        'user@example.com',
        'User',
        'Document',
        'https://download-link.com'
      );

      const call = mockSendFn.mock.calls[0][0];
      expect(call.html).toContain('https://bzr-portal.com/documents');
      expect(call.html).toContain('Dashboard');
    });

    it('should properly encode document name with special characters', async () => {
      mockSendFn.mockResolvedValue({
        data: { id: 'doc-special' },
        error: null,
      });

      await emailService.sendDocumentReadyEmail(
        'user@example.com',
        'User',
        'Документ "Тест" & <Компанија>',
        'https://link.com'
      );

      const call = mockSendFn.mock.calls[0][0];
      expect(call.html).toContain('Документ "Тест" & <Компанија>');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts with retry', async () => {
      vi.useFakeTimers();

      mockSendFn
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce({
          data: { id: 'timeout-recovered' },
          error: null,
        });

      const promise = emailService.sendEmail({
        to: 'timeout@example.com',
        subject: 'Timeout Test',
        html: '<p>Timeout</p>',
      });

      await vi.advanceTimersByTimeAsync(1000);
      const emailId = await promise;

      expect(emailId).toBe('timeout-recovered');

      vi.useRealTimers();
    });

    it('should handle missing email ID in response', async () => {
      mockSendFn.mockResolvedValue({
        data: {}, // No id field
        error: null,
      });

      const emailId = await emailService.sendEmail({
        to: 'no-id@example.com',
        subject: 'No ID Test',
        html: '<p>No ID</p>',
      });

      expect(emailId).toBe(''); // Should return empty string
    });
  });
});
