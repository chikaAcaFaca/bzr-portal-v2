import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc/builder';
import { db } from '../../db';
import { messageThreads, messages } from '../../db/schema/messages';
import { agencies } from '../../db/schema/agencies';
import { companies } from '../../db/schema/companies';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import { sendMessageNotificationEmail } from '../../services/email.service';

/**
 * Messaging Router
 *
 * In-app messaging between agencies and companies.
 * One thread per agency-company pair. Email notifications via Resend.
 */
export const messagingRouter = router({
  /**
   * List message threads for the current user
   */
  listThreads: protectedProcedure
    .input(
      z.object({
        includeArchived: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      const companyOwnerId = (ctx as any).companyOwnerId as number | null;
      const userType = (ctx as any).userType as string | null;

      if (!agencyId && !companyOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate pristup porukama' });
      }

      const conditions = [];

      if (userType === 'agency' && agencyId) {
        conditions.push(eq(messageThreads.agencyId, agencyId));
        if (!input?.includeArchived) {
          conditions.push(eq(messageThreads.isArchivedByAgency, false));
        }
      } else if (companyOwnerId) {
        conditions.push(eq(messageThreads.companyId, companyOwnerId));
        if (!input?.includeArchived) {
          conditions.push(eq(messageThreads.isArchivedByCompany, false));
        }
      }

      const threads = await db
        .select({
          id: messageThreads.id,
          subject: messageThreads.subject,
          lastMessageAt: messageThreads.lastMessageAt,
          lastMessagePreview: messageThreads.lastMessagePreview,
          unreadByAgency: messageThreads.unreadByAgency,
          unreadByCompany: messageThreads.unreadByCompany,
          agencyId: messageThreads.agencyId,
          companyId: messageThreads.companyId,
          agencyName: agencies.name,
          companyName: companies.name,
          createdAt: messageThreads.createdAt,
        })
        .from(messageThreads)
        .leftJoin(agencies, eq(messageThreads.agencyId, agencies.id))
        .leftJoin(companies, eq(messageThreads.companyId, companies.id))
        .where(and(...conditions))
        .orderBy(desc(messageThreads.lastMessageAt));

      return threads.map((t) => ({
        ...t,
        unreadCount: userType === 'agency' ? t.unreadByAgency : t.unreadByCompany,
      }));
    }),

  /**
   * Get messages in a thread (marks as read)
   */
  getThread: protectedProcedure
    .input(z.object({ threadId: z.number() }))
    .query(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      const companyOwnerId = (ctx as any).companyOwnerId as number | null;
      const userType = (ctx as any).userType as string | null;

      // Verify access to thread
      const [thread] = await db
        .select()
        .from(messageThreads)
        .where(eq(messageThreads.id, input.threadId))
        .limit(1);

      if (!thread) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Konverzacija nije pronadjena' });
      }

      const hasAccess =
        (userType === 'agency' && agencyId === thread.agencyId) ||
        (userType === 'company' && companyOwnerId === thread.companyId);

      if (!hasAccess) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate pristup ovoj konverzaciji' });
      }

      // Fetch messages
      const threadMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.threadId, input.threadId))
        .orderBy(messages.createdAt);

      // Mark unread messages as read
      if (userType === 'agency') {
        await db
          .update(messages)
          .set({ isRead: true, readAt: new Date() })
          .where(
            and(
              eq(messages.threadId, input.threadId),
              eq(messages.senderType, 'company'),
              eq(messages.isRead, false)
            )
          );
        await db
          .update(messageThreads)
          .set({ unreadByAgency: 0, updatedAt: new Date() })
          .where(eq(messageThreads.id, input.threadId));
      } else {
        await db
          .update(messages)
          .set({ isRead: true, readAt: new Date() })
          .where(
            and(
              eq(messages.threadId, input.threadId),
              eq(messages.senderType, 'agency'),
              eq(messages.isRead, false)
            )
          );
        await db
          .update(messageThreads)
          .set({ unreadByCompany: 0, updatedAt: new Date() })
          .where(eq(messageThreads.id, input.threadId));
      }

      // Get participant names
      const [agency] = await db
        .select({ name: agencies.name })
        .from(agencies)
        .where(eq(agencies.id, thread.agencyId))
        .limit(1);

      const [company] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, thread.companyId))
        .limit(1);

      return {
        thread: {
          ...thread,
          agencyName: agency?.name ?? 'Nepoznata agencija',
          companyName: company?.name ?? 'Nepoznata firma',
        },
        messages: threadMessages,
      };
    }),

  /**
   * Send a message (creates thread if first message between pair)
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        // For new thread
        recipientAgencyId: z.number().optional(),
        recipientCompanyId: z.number().optional(),
        subject: z.string().min(1).max(500).optional(),
        // For existing thread
        threadId: z.number().optional(),
        // Message content
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      const companyOwnerId = (ctx as any).companyOwnerId as number | null;
      const userType = (ctx as any).userType as string | null;
      const fullName = (ctx as any).fullName as string | null;

      if (!agencyId && !companyOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate pristup porukama' });
      }

      let threadId = input.threadId;
      let thread;

      if (threadId) {
        // Existing thread - verify access
        [thread] = await db
          .select()
          .from(messageThreads)
          .where(eq(messageThreads.id, threadId))
          .limit(1);

        if (!thread) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Konverzacija nije pronadjena' });
        }

        const hasAccess =
          (userType === 'agency' && agencyId === thread.agencyId) ||
          (userType === 'company' && companyOwnerId === thread.companyId);

        if (!hasAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate pristup ovoj konverzaciji' });
        }
      } else {
        // New thread
        if (!input.subject) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Naslov je obavezan za novu konverzaciju' });
        }

        let threadAgencyId: number;
        let threadCompanyId: number;

        if (userType === 'agency' && agencyId) {
          if (!input.recipientCompanyId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'ID firme je obavezan' });
          }
          threadAgencyId = agencyId;
          threadCompanyId = input.recipientCompanyId;
        } else if (companyOwnerId) {
          if (!input.recipientAgencyId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'ID agencije je obavezan' });
          }
          threadAgencyId = input.recipientAgencyId;
          threadCompanyId = companyOwnerId;
        } else {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate pristup' });
        }

        // Check if thread already exists between this pair
        const [existingThread] = await db
          .select()
          .from(messageThreads)
          .where(
            and(
              eq(messageThreads.agencyId, threadAgencyId),
              eq(messageThreads.companyId, threadCompanyId)
            )
          )
          .limit(1);

        if (existingThread) {
          thread = existingThread;
          threadId = existingThread.id;
        } else {
          [thread] = await db
            .insert(messageThreads)
            .values({
              agencyId: threadAgencyId,
              companyId: threadCompanyId,
              subject: input.subject,
            })
            .returning();
          threadId = thread.id;
        }
      }

      // Determine sender info
      const senderType = userType === 'agency' ? 'agency' : 'company';
      let senderName = fullName || 'Korisnik';

      if (userType === 'company' && companyOwnerId) {
        const [company] = await db
          .select({ name: companies.name, ownerFullName: companies.ownerFullName })
          .from(companies)
          .where(eq(companies.id, companyOwnerId))
          .limit(1);
        if (company) {
          senderName = company.ownerFullName || company.name;
        }
      }

      // Insert message
      const preview = input.content.substring(0, 200);
      const [message] = await db
        .insert(messages)
        .values({
          threadId: threadId!,
          senderType: senderType as 'agency' | 'company',
          senderAgencyId: userType === 'agency' ? agencyId : null,
          senderCompanyId: userType === 'company' ? companyOwnerId : null,
          senderName,
          content: input.content,
        })
        .returning();

      // Update thread metadata
      const unreadUpdate = userType === 'agency'
        ? { unreadByCompany: sql`${messageThreads.unreadByCompany} + 1` }
        : { unreadByAgency: sql`${messageThreads.unreadByAgency} + 1` };

      await db
        .update(messageThreads)
        .set({
          lastMessageAt: new Date(),
          lastMessagePreview: preview,
          ...unreadUpdate,
          updatedAt: new Date(),
        })
        .where(eq(messageThreads.id, threadId!));

      // Send email notification (async, don't block)
      sendEmailNotification(thread!, senderName, input.content, userType!).catch((err) => {
        console.error('Email notification failed:', err);
      });

      return { message, threadId: threadId! };
    }),

  /**
   * Get unread message count for sidebar badge
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const agencyId = (ctx as any).agencyId as number | null;
    const companyOwnerId = (ctx as any).companyOwnerId as number | null;
    const userType = (ctx as any).userType as string | null;

    if (userType === 'agency' && agencyId) {
      const [result] = await db
        .select({ count: sql<number>`coalesce(sum(${messageThreads.unreadByAgency}), 0)::int` })
        .from(messageThreads)
        .where(eq(messageThreads.agencyId, agencyId));
      return result?.count ?? 0;
    }

    if (companyOwnerId) {
      const [result] = await db
        .select({ count: sql<number>`coalesce(sum(${messageThreads.unreadByCompany}), 0)::int` })
        .from(messageThreads)
        .where(eq(messageThreads.companyId, companyOwnerId));
      return result?.count ?? 0;
    }

    return 0;
  }),

  /**
   * Mark thread as read
   */
  markRead: protectedProcedure
    .input(z.object({ threadId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      const companyOwnerId = (ctx as any).companyOwnerId as number | null;
      const userType = (ctx as any).userType as string | null;

      const [thread] = await db
        .select()
        .from(messageThreads)
        .where(eq(messageThreads.id, input.threadId))
        .limit(1);

      if (!thread) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Konverzacija nije pronadjena' });
      }

      if (userType === 'agency' && agencyId === thread.agencyId) {
        await db
          .update(messages)
          .set({ isRead: true, readAt: new Date() })
          .where(
            and(
              eq(messages.threadId, input.threadId),
              eq(messages.senderType, 'company'),
              eq(messages.isRead, false)
            )
          );
        await db
          .update(messageThreads)
          .set({ unreadByAgency: 0, updatedAt: new Date() })
          .where(eq(messageThreads.id, input.threadId));
      } else if (companyOwnerId === thread.companyId) {
        await db
          .update(messages)
          .set({ isRead: true, readAt: new Date() })
          .where(
            and(
              eq(messages.threadId, input.threadId),
              eq(messages.senderType, 'agency'),
              eq(messages.isRead, false)
            )
          );
        await db
          .update(messageThreads)
          .set({ unreadByCompany: 0, updatedAt: new Date() })
          .where(eq(messageThreads.id, input.threadId));
      }

      return { success: true };
    }),

  /**
   * Archive a thread
   */
  archiveThread: protectedProcedure
    .input(z.object({ threadId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      const companyOwnerId = (ctx as any).companyOwnerId as number | null;
      const userType = (ctx as any).userType as string | null;

      const [thread] = await db
        .select()
        .from(messageThreads)
        .where(eq(messageThreads.id, input.threadId))
        .limit(1);

      if (!thread) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Konverzacija nije pronadjena' });
      }

      if (userType === 'agency' && agencyId === thread.agencyId) {
        await db
          .update(messageThreads)
          .set({ isArchivedByAgency: true, updatedAt: new Date() })
          .where(eq(messageThreads.id, input.threadId));
      } else if (companyOwnerId === thread.companyId) {
        await db
          .update(messageThreads)
          .set({ isArchivedByCompany: true, updatedAt: new Date() })
          .where(eq(messageThreads.id, input.threadId));
      } else {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate pristup' });
      }

      return { success: true };
    }),
});

/**
 * Send email notification to the recipient of a new message
 */
async function sendEmailNotification(
  thread: typeof messageThreads.$inferSelect,
  senderName: string,
  content: string,
  senderUserType: string
): Promise<void> {
  try {
    let recipientEmail: string | null = null;
    let recipientName: string = 'Korisnik';

    if (senderUserType === 'agency') {
      // Notify company
      const [company] = await db
        .select({ email: companies.ownerEmail, name: companies.name })
        .from(companies)
        .where(eq(companies.id, thread.companyId))
        .limit(1);
      recipientEmail = company?.email ?? null;
      recipientName = company?.name ?? 'Korisnik';
    } else {
      // Notify agency
      const [agency] = await db
        .select({ email: agencies.email, name: agencies.name })
        .from(agencies)
        .where(eq(agencies.id, thread.agencyId))
        .limit(1);
      recipientEmail = agency?.email ?? null;
      recipientName = agency?.name ?? 'Korisnik';
    }

    if (recipientEmail) {
      await sendMessageNotificationEmail(recipientEmail, {
        recipientName,
        senderName,
        subject: thread.subject,
        messagePreview: content.substring(0, 300),
        threadUrl: `${process.env.FRONTEND_URL || 'https://bzr-savetnik.com'}/app/poruke?thread=${thread.id}`,
      });
    }
  } catch (error) {
    console.error('Failed to send message notification email:', error);
  }
}
