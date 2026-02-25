/**
 * Email Service - Resend Integration
 *
 * Handles transactional emails with retry logic and Serbian Cyrillic templates.
 *
 * Per spec.md:
 * - FR-028i: All email templates in Serbian Cyrillic
 * - Phase 2 (T028): Retry logic with exponential backoff (1s, 2s, 4s)
 * - Phase 2 (T027): Serbian email templates (verification, trial expiry, document ready)
 */

import { resendClient, EMAIL_FROM, EMAIL_RETRY_CONFIG } from '../lib/resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Send email with retry logic (3 attempts with exponential backoff)
 *
 * @param options Email configuration
 * @returns Email ID from Resend
 *
 * @example
 * ```ts
 * await emailService.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Добродошли у BZR Portal',
 *   html: '<p>Ваш налог је креиран.</p>',
 * });
 * ```
 */
export async function sendEmail(options: SendEmailOptions): Promise<string> {
  const { to, subject, html, replyTo } = options;

  let lastError: Error | null = null;

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt < EMAIL_RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      const result = await resendClient.emails.send({
        from: EMAIL_FROM,
        to,
        subject,
        html,
        replyTo,
      });

      if (result.error) {
        throw new Error(`Resend API error: ${result.error.message}`);
      }

      console.log(`✅ Email sent successfully: ${result.data?.id} (attempt ${attempt + 1}/${EMAIL_RETRY_CONFIG.maxAttempts})`);
      return result.data?.id || '';
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`⚠️  Email send failed (attempt ${attempt + 1}/${EMAIL_RETRY_CONFIG.maxAttempts}):`, lastError.message);

      // Wait before retry (exponential backoff)
      if (attempt < EMAIL_RETRY_CONFIG.maxAttempts - 1) {
        const delayMs = EMAIL_RETRY_CONFIG.delayMs[attempt];
        console.log(`⏳ Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries failed
  console.error(`❌ Email send failed after ${EMAIL_RETRY_CONFIG.maxAttempts} attempts:`, lastError);
  throw new Error(`Email delivery failed: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Send email verification email (Serbian Cyrillic) - T023
 *
 * @param to User email address
 * @param data Verification data (firstName, verificationUrl, expiryHours)
 */
export async function sendVerificationEmail(
  to: string,
  data: {
    firstName: string;
    verificationUrl: string;
    expiryHours: number;
  }
): Promise<string> {
  const subject = 'Потврдите вашу имејл адресу - BZR Portal';

  const html = `
    <!DOCTYPE html>
    <html lang="sr-Cyrl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Потврда имејл адресе</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #107C10;">Добродошли у BZR Portal, ${data.firstName}!</h1>

      <p>Хвала вам што сте се регистровали. Потврдите вашу имејл адресу кликом на дугме испод:</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.verificationUrl}"
           style="background-color: #107C10; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Потврди имејл адресу
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        Или копирајте ову адресу у ваш претраживач:<br>
        <a href="${data.verificationUrl}" style="color: #107C10;">${data.verificationUrl}</a>
      </p>

      <p style="color: #CA5010; font-size: 14px;">
        ⚠️ Линк важи ${data.expiryHours} сати.
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

      <p style="color: #999; font-size: 12px;">
        Ако нисте креирали налог на BZR Portal, молимо вас игноришите овај имејл.
      </p>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
}

/**
 * Send password reset email (Serbian Cyrillic) - T026
 *
 * @param to User email address
 * @param data Reset data (firstName, resetUrl, expiryMinutes)
 */
export async function sendPasswordResetEmail(
  to: string,
  data: {
    firstName: string;
    resetUrl: string;
    expiryMinutes: number;
  }
): Promise<string> {
  const subject = 'Ресетовање лозинке - BZR Portal';

  const html = `
    <!DOCTYPE html>
    <html lang="sr-Cyrl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ресетовање лозинке</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #107C10;">Ресетовање лозинке</h1>

      <p>Здраво ${data.firstName},</p>

      <p>Затражили сте ресетовање лозинке за ваш BZR Portal налог. Кликните на дугме испод да креирате нову лозинку:</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.resetUrl}"
           style="background-color: #107C10; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Ресетуј лозинку
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        Или копирајте ову адресу у ваш претраживач:<br>
        <a href="${data.resetUrl}" style="color: #107C10;">${data.resetUrl}</a>
      </p>

      <p style="color: #D13438; font-size: 14px;">
        ⚠️ Линк важи ${data.expiryMinutes} минута из безбедносних разлога.
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

      <p style="color: #999; font-size: 12px;">
        Ако нисте затражили ресетовање лозинке, молимо вас игноришите овај имејл. Ваша лозинка неће бити промењена.
      </p>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
}

/**
 * Send trial expiry warning email (Serbian Cyrillic)
 *
 * @param to User email address
 * @param userName User's first name
 * @param daysRemaining Days remaining in trial
 */
export async function sendTrialExpiryEmail(to: string, userName: string, daysRemaining: number): Promise<string> {
  const subject = `Пробни период истиче за ${daysRemaining} дана - BZR Portal`;

  const html = `
    <!DOCTYPE html>
    <html lang="sr-Cyrl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Пробни период истиче</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #CA5010;">Пробни период истиче</h1>

      <p>Здраво ${userName},</p>

      <p>Ваш пробни период на BZR Portal истиче за <strong>${daysRemaining} дана</strong>.</p>

      <p>Закажите верификацију вашег налога да бисте наставили да користите све функције платформе:</p>

      <ul style="line-height: 2;">
        <li>Неограничен број радних места</li>
        <li>Неограничено генерисање докумената</li>
        <li>AI препоруке за ризике</li>
        <li>Увоз из Excel датотека</li>
      </ul>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard"
           style="background-color: #107C10; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Отвори BZR Portal
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        За питања, контактирајте нас на <a href="mailto:podrska@bzr-portal.com">podrska@bzr-portal.com</a>
      </p>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
}

/**
 * Send document ready notification email (Serbian Cyrillic)
 *
 * @param to User email address
 * @param userName User's first name
 * @param documentName Document name
 * @param downloadUrl Pre-signed download URL (valid for 1 hour)
 */
export async function sendDocumentReadyEmail(
  to: string,
  userName: string,
  documentName: string,
  downloadUrl: string
): Promise<string> {
  const subject = `Документ је спреман за преузимање - BZR Portal`;

  const html = `
    <!DOCTYPE html>
    <html lang="sr-Cyrl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Документ је спреман</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #107C10;">Документ је спреман!</h1>

      <p>Здраво ${userName},</p>

      <p>Ваш документ <strong>${documentName}</strong> је успешно генерисан и спреман је за преузимање.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${downloadUrl}"
           style="background-color: #107C10; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Преузми документ
        </a>
      </div>

      <p style="color: #D13438; font-size: 14px;">
        ⚠️ Линк за преузимање истиче за 1 сат из безбедносних разлога.
      </p>

      <p style="color: #666; font-size: 14px;">
        Можете такође преузети документ из вашег <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/documents" style="color: #107C10;">Dashboard-а</a>.
      </p>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
}

/**
 * Send contact form notification email (Serbian Cyrillic)
 *
 * @param to Support email address
 * @param data Contact form submission data
 */
export async function sendContactFormEmail(
  to: string,
  data: {
    name: string;
    email: string;
    companyName?: string;
    message: string;
    submittedAt: Date;
    submissionId: string;
  }
): Promise<string> {
  const subject = `Нова порука са контакт форме - ${data.name}`;

  const html = `
    <!DOCTYPE html>
    <html lang="sr-Cyrl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Нова порука са контакт форме</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f4f4f4; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: #2563eb; margin-top: 0;">Нова порука са контакт форме БЗР Портала</h2>
      </div>

      <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
        <p style="margin-top: 0;"><strong>Име:</strong> ${data.name}</p>
        <p><strong>Email:</strong> <a href="mailto:${data.email}" style="color: #2563eb;">${data.email}</a></p>
        ${data.companyName ? `<p><strong>Компанија:</strong> ${data.companyName}</p>` : ''}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

        <p><strong>Порука:</strong></p>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 4px; white-space: pre-wrap;">
${data.message}
        </div>
      </div>

      <div style="margin-top: 20px; padding: 15px; background-color: #f4f4f4; border-radius: 4px; font-size: 0.875rem; color: #6b7280;">
        <p style="margin: 0;"><strong>Послато:</strong> ${data.submittedAt.toLocaleString('sr-RS', { timeZone: 'Europe/Belgrade' })}</p>
        <p style="margin: 5px 0 0;"><strong>ID:</strong> ${data.submissionId}</p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html, replyTo: data.email });
}

/**
 * Send message notification email (Serbian Cyrillic)
 *
 * Notifies a user when they receive a new in-app message.
 */
export async function sendMessageNotificationEmail(
  to: string,
  data: {
    recipientName: string;
    senderName: string;
    subject: string;
    messagePreview: string;
    threadUrl: string;
  }
): Promise<string> {
  const subject = `Нова порука од ${data.senderName} - BZR Savetnik`;

  const html = `
    <!DOCTYPE html>
    <html lang="sr-Cyrl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Нова порука</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #107C10;">Нова порука</h1>

      <p>Здраво ${data.recipientName},</p>

      <p><strong>${data.senderName}</strong> вам је послао/ла нову поруку:</p>

      <div style="background-color: #f4f4f4; border-left: 4px solid #107C10; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0 0 5px 0; font-weight: bold;">${data.subject}</p>
        <p style="margin: 0; color: #555;">${data.messagePreview}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.threadUrl}"
           style="background-color: #107C10; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Погледај поруку
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

      <p style="color: #999; font-size: 12px;">
        Ову поруку сте примили јер имате налог на BZR Savetnik платформи.
        Можете управљати подешавањима обавештења у свом налогу.
      </p>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
}

export const emailService = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTrialExpiryEmail,
  sendDocumentReadyEmail,
  sendContactFormEmail,
  sendMessageNotificationEmail,
};
