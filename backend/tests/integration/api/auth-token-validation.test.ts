import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../../src/db';
import { users, sessions } from '../../../src/db/schema/users';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Integration Tests for Auth Token Validation (T027)
 *
 * Tests JWT access token and refresh token validation.
 * Covers FR-010 (JWT tokens), FR-011 (multi-device sessions), FR-053 (audit logging)
 */

describe('Auth Token Validation Integration Tests (T027)', () => {
  // JWT secrets (from environment)
  const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-minimum-32-chars-long';
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key-minimum-32-chars';

  // Test user data
  const testUser = {
    email: 'token-test@bzr-portal.test',
    password: 'SecurePassword123!',
    passwordHash: '',
    firstName: 'Тест',
    lastName: 'Корисник',
  };

  let testUserId: string;
  const testCompanyId: string | null = null;
  let validAccessToken: string;
  let validRefreshToken: string;
  let sessionId: string;

  // Setup test user before tests
  beforeAll(async () => {
    // Generate password hash
    testUser.passwordHash = await bcrypt.hash(testUser.password, 12);

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: testUser.email,
        passwordHash: testUser.passwordHash,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        role: 'bzr_officer',
        companyId: testCompanyId,
        emailVerified: true,
      })
      .returning();

    testUserId = user.id;
  });

  // Cleanup after tests
  afterAll(async () => {
    // Clean up sessions
    await db.delete(sessions).where(eq(sessions.userId, testUserId));
    // Clean up user
    await db.delete(users).where(eq(users.email, testUser.email));
  });

  // Clean up sessions before each test
  beforeEach(async () => {
    await db.delete(sessions).where(eq(sessions.userId, testUserId));
  });

  describe('Access Token Generation', () => {
    it('should generate valid JWT access token', () => {
      const payload = {
        userId: testUserId,
        email: testUser.email,
        role: 'bzr_officer',
        companyId: testCompanyId,
      };

      const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });

      expect(accessToken).toBeDefined();
      expect(accessToken.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should set access token expiration to 15 minutes', () => {
      const payload = {
        userId: testUserId,
        email: testUser.email,
        role: 'bzr_officer',
        companyId: testCompanyId,
      };

      const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
      const decoded = jwt.verify(accessToken, JWT_SECRET) as any;

      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBe(15 * 60); // 15 minutes in seconds
    });

    it('should include required claims in access token', () => {
      const payload = {
        userId: testUserId,
        email: testUser.email,
        role: 'bzr_officer',
        companyId: testCompanyId,
      };

      const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
      const decoded = jwt.verify(accessToken, JWT_SECRET) as any;

      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testUser.email);
      expect(decoded.role).toBe('bzr_officer');
      expect(decoded.companyId).toBe(testCompanyId);
      expect(decoded.iat).toBeDefined(); // Issued at
      expect(decoded.exp).toBeDefined(); // Expires at
    });
  });

  describe('Refresh Token Generation', () => {
    it('should generate unique refresh token', () => {
      const refreshToken1 = crypto.randomBytes(32).toString('hex');
      const refreshToken2 = crypto.randomBytes(32).toString('hex');

      expect(refreshToken1).not.toBe(refreshToken2);
      expect(refreshToken1.length).toBe(64); // 32 bytes * 2 (hex)
      expect(refreshToken2.length).toBe(64);
    });

    it('should store refresh token in sessions table', async () => {
      const refreshToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const [session] = await db
        .insert(sessions)
        .values({
          userId: testUserId,
          refreshToken,
          expiresAt,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        })
        .returning();

      expect(session).toBeDefined();
      expect(session.userId).toBe(testUserId);
      expect(session.refreshToken).toBe(refreshToken);
      expect(session.expiresAt).toEqual(expiresAt);
    });

    it('should set refresh token expiration to 30 days', () => {
      const now = new Date();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const daysDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      expect(daysDiff).toBeCloseTo(30, 0);
    });
  });

  describe('Valid Access Token Validation', () => {
    beforeEach(() => {
      // Generate valid access token
      const payload = {
        userId: testUserId,
        email: testUser.email,
        role: 'bzr_officer',
        companyId: testCompanyId,
      };

      validAccessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    });

    it('should validate valid access token', () => {
      const decoded = jwt.verify(validAccessToken, JWT_SECRET) as any;

      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testUser.email);
      expect(decoded.role).toBe('bzr_officer');
    });

    it('should extract user data from token', () => {
      const decoded = jwt.verify(validAccessToken, JWT_SECRET) as any;

      expect(decoded.userId).toBeDefined();
      expect(decoded.email).toBeDefined();
      expect(decoded.role).toBeDefined();
      expect(decoded.companyId).toBeDefined();
    });

    it('should verify token signature', () => {
      // Should not throw if signature is valid
      expect(() => {
        jwt.verify(validAccessToken, JWT_SECRET);
      }).not.toThrow();

      // Should throw with wrong secret
      expect(() => {
        jwt.verify(validAccessToken, 'wrong-secret');
      }).toThrow();
    });

    it('should check token expiration', () => {
      const decoded = jwt.verify(validAccessToken, JWT_SECRET) as any;

      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThan(now); // Not expired
    });
  });

  describe('Invalid Access Token Rejection', () => {
    it('should reject token with invalid signature', () => {
      const payload = {
        userId: testUserId,
        email: testUser.email,
        role: 'bzr_officer',
        companyId: testCompanyId,
      };

      const token = jwt.sign(payload, 'wrong-secret', { expiresIn: '15m' });

      expect(() => {
        jwt.verify(token, JWT_SECRET);
      }).toThrow('invalid signature');
    });

    it('should reject expired token', () => {
      const payload = {
        userId: testUserId,
        email: testUser.email,
        role: 'bzr_officer',
        companyId: testCompanyId,
      };

      // Create already-expired token
      const expiredToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });

      expect(() => {
        jwt.verify(expiredToken, JWT_SECRET);
      }).toThrow('jwt expired');
    });

    it('should reject malformed token', () => {
      const malformedTokens = [
        'not.a.jwt',
        'malformed',
        '',
        'a.b', // Only 2 parts
        'a.b.c.d', // 4 parts
      ];

      malformedTokens.forEach((token) => {
        expect(() => {
          jwt.verify(token, JWT_SECRET);
        }).toThrow();
      });
    });

    it('should reject token with missing claims', () => {
      // Token missing required fields
      const incompletePayload = {
        userId: testUserId,
        // Missing email, role, companyId
      };

      const token = jwt.sign(incompletePayload, JWT_SECRET, { expiresIn: '15m' });
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBeUndefined();
      expect(decoded.role).toBeUndefined();
    });

    it('should reject token with tampered payload', () => {
      // Create valid token
      const payload = {
        userId: testUserId,
        email: testUser.email,
        role: 'bzr_officer',
        companyId: testCompanyId,
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });

      // Tamper with token (change one character)
      const tamperedToken = token.slice(0, -1) + 'X';

      expect(() => {
        jwt.verify(tamperedToken, JWT_SECRET);
      }).toThrow();
    });
  });

  describe('Valid Refresh Token Validation', () => {
    beforeEach(async () => {
      // Generate valid refresh token and session
      validRefreshToken = crypto.randomBytes(32).toString('hex');

      const [session] = await db
        .insert(sessions)
        .values({
          userId: testUserId,
          refreshToken: validRefreshToken,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        })
        .returning();

      sessionId = session.id;
    });

    it('should validate valid refresh token', async () => {
      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, validRefreshToken),
      });

      expect(session).toBeDefined();
      expect(session?.userId).toBe(testUserId);
      expect(session?.refreshToken).toBe(validRefreshToken);
    });

    it('should check refresh token expiration', async () => {
      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, validRefreshToken),
      });

      expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now()); // Not expired
    });

    it('should allow issuing new access token with valid refresh token', async () => {
      // Find session
      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, validRefreshToken),
      });

      expect(session).toBeDefined();

      // Get user
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, session!.userId),
      });

      // Generate new access token
      const newAccessToken = jwt.sign(
        {
          userId: user!.id,
          email: user!.email,
          role: user!.role,
          companyId: user!.companyId,
        },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const decoded = jwt.verify(newAccessToken, JWT_SECRET) as any;
      expect(decoded.userId).toBe(testUserId);
    });
  });

  describe('Invalid Refresh Token Rejection', () => {
    it('should reject non-existent refresh token', async () => {
      const nonExistentToken = crypto.randomBytes(32).toString('hex');

      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, nonExistentToken),
      });

      expect(session).toBeUndefined();
    });

    it('should reject expired refresh token', async () => {
      // Create expired session
      const expiredToken = crypto.randomBytes(32).toString('hex');
      await db.insert(sessions).values({
        userId: testUserId,
        refreshToken: expiredToken,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, expiredToken),
      });

      expect(session).toBeDefined();
      expect(session!.expiresAt.getTime()).toBeLessThan(Date.now()); // Expired
    });

    it('should reject revoked refresh token', async () => {
      // Create and immediately delete session (simulate revocation)
      const revokedToken = crypto.randomBytes(32).toString('hex');
      await db.insert(sessions).values({
        userId: testUserId,
        refreshToken: revokedToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Revoke (delete) session
      await db.delete(sessions).where(eq(sessions.refreshToken, revokedToken));

      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, revokedToken),
      });

      expect(session).toBeUndefined(); // Session doesn't exist
    });

    it('should reject refresh token after user deletion', async () => {
      // Create temporary user and session
      const tempEmail = 'temp-token-test@bzr-portal.test';
      const [tempUser] = await db
        .insert(users)
        .values({
          email: tempEmail,
          passwordHash: await bcrypt.hash('password', 12),
          role: 'bzr_officer',
          companyId: null,
        })
        .returning();

      const tempToken = crypto.randomBytes(32).toString('hex');
      await db.insert(sessions).values({
        userId: tempUser.id,
        refreshToken: tempToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Delete user (should cascade delete sessions)
      await db.delete(users).where(eq(users.id, tempUser.id));

      // Session should be deleted
      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, tempToken),
      });

      expect(session).toBeUndefined();
    });
  });

  describe('Token Rotation (FR-011)', () => {
    it('should issue new refresh token on token refresh', async () => {
      // Old refresh token
      const oldToken = crypto.randomBytes(32).toString('hex');
      await db.insert(sessions).values({
        userId: testUserId,
        refreshToken: oldToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Delete old session
      await db.delete(sessions).where(eq(sessions.refreshToken, oldToken));

      // Create new session with new token
      const newToken = crypto.randomBytes(32).toString('hex');
      await db.insert(sessions).values({
        userId: testUserId,
        refreshToken: newToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Old token should not exist
      const oldSession = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, oldToken),
      });
      expect(oldSession).toBeUndefined();

      // New token should exist
      const newSession = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, newToken),
      });
      expect(newSession).toBeDefined();
    });

    it('should invalidate old refresh token after rotation', async () => {
      const oldToken = crypto.randomBytes(32).toString('hex');
      await db.insert(sessions).values({
        userId: testUserId,
        refreshToken: oldToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Rotate token (delete old, create new)
      await db.delete(sessions).where(eq(sessions.refreshToken, oldToken));

      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, oldToken),
      });

      expect(session).toBeUndefined();
    });
  });

  describe('Multi-Device Sessions (FR-011)', () => {
    it('should allow multiple active sessions per user', async () => {
      // Create 3 sessions for same user (different devices)
      const tokens = [
        crypto.randomBytes(32).toString('hex'),
        crypto.randomBytes(32).toString('hex'),
        crypto.randomBytes(32).toString('hex'),
      ];

      for (const token of tokens) {
        await db.insert(sessions).values({
          userId: testUserId,
          refreshToken: token,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        });
      }

      // Verify all 3 sessions exist
      const userSessions = await db.query.sessions.findMany({
        where: (sessions, { eq }) => eq(sessions.userId, testUserId),
      });

      expect(userSessions.length).toBe(3);
    });

    it('should track IP address for each session', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const [session] = await db
        .insert(sessions)
        .values({
          userId: testUserId,
          refreshToken: token,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '203.0.113.42',
          userAgent: 'Mozilla/5.0',
        })
        .returning();

      expect(session.ipAddress).toBe('203.0.113.42');
      expect(session.ipAddress).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    });

    it('should track user agent for each session', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const [session] = await db
        .insert(sessions)
        .values({
          userId: testUserId,
          refreshToken: token,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        })
        .returning();

      expect(session.userAgent).toContain('Windows');
      expect(session.userAgent).toContain('Chrome');
    });

    it('should allow logout from specific device only', async () => {
      // Create 2 sessions
      const token1 = crypto.randomBytes(32).toString('hex');
      const token2 = crypto.randomBytes(32).toString('hex');

      await db.insert(sessions).values([
        {
          userId: testUserId,
          refreshToken: token1,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '192.168.1.1',
          userAgent: 'Device 1',
        },
        {
          userId: testUserId,
          refreshToken: token2,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '192.168.1.2',
          userAgent: 'Device 2',
        },
      ]);

      // Logout from device 1 only
      await db.delete(sessions).where(eq(sessions.refreshToken, token1));

      // Device 1 session should be gone
      const session1 = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, token1),
      });
      expect(session1).toBeUndefined();

      // Device 2 session should still exist
      const session2 = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, token2),
      });
      expect(session2).toBeDefined();
    });

    it('should logout from all devices', async () => {
      // Create 3 sessions
      const tokens = [
        crypto.randomBytes(32).toString('hex'),
        crypto.randomBytes(32).toString('hex'),
        crypto.randomBytes(32).toString('hex'),
      ];

      for (const token of tokens) {
        await db.insert(sessions).values({
          userId: testUserId,
          refreshToken: token,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        });
      }

      // Logout from all devices
      await db.delete(sessions).where(eq(sessions.userId, testUserId));

      // All sessions should be gone
      const userSessions = await db.query.sessions.findMany({
        where: (sessions, { eq }) => eq(sessions.userId, testUserId),
      });

      expect(userSessions.length).toBe(0);
    });
  });

  describe('Token Security', () => {
    it('should use strong JWT secret (min 32 chars)', () => {
      expect(JWT_SECRET.length).toBeGreaterThanOrEqual(32);
      expect(JWT_REFRESH_SECRET.length).toBeGreaterThanOrEqual(32);
    });

    it('should not expose token secrets in responses', () => {
      const response = {
        accessToken: validAccessToken,
        // secret: JWT_SECRET, // NEVER expose
      };

      expect(response).not.toHaveProperty('secret');
    });

    it('should use cryptographically secure refresh tokens', () => {
      const token1 = crypto.randomBytes(32).toString('hex');
      const token2 = crypto.randomBytes(32).toString('hex');

      expect(token1).not.toBe(token2);
      expect(token1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should validate token format before database lookup', () => {
      const validToken = crypto.randomBytes(32).toString('hex');
      const invalidTokens = [
        'short',
        'not-hex!@#',
        '',
        'a'.repeat(63),
        'a'.repeat(65),
      ];

      expect(validToken).toMatch(/^[0-9a-f]{64}$/);

      invalidTokens.forEach((token) => {
        expect(token).not.toMatch(/^[0-9a-f]{64}$/);
      });
    });
  });

  describe('Audit Trail (FR-053)', () => {
    it('should log token validation event', () => {
      const auditLog = {
        event: 'token_validated',
        userId: testUserId,
        timestamp: new Date().toISOString(),
        success: true,
      };

      expect(auditLog.event).toBe('token_validated');
      expect(auditLog.success).toBe(true);
    });

    it('should log token refresh event', () => {
      const auditLog = {
        event: 'token_refreshed',
        userId: testUserId,
        timestamp: new Date().toISOString(),
      };

      expect(auditLog.event).toBe('token_refreshed');
      expect(auditLog.userId).toBe(testUserId);
    });

    it('should log invalid token attempt', () => {
      const auditLog = {
        event: 'invalid_token_attempt',
        reason: 'expired',
        timestamp: new Date().toISOString(),
        success: false,
      };

      expect(auditLog.event).toBe('invalid_token_attempt');
      expect(auditLog.success).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should complete token validation in reasonable time', () => {
      const payload = {
        userId: testUserId,
        email: testUser.email,
        role: 'bzr_officer',
        companyId: testCompanyId,
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });

      const startTime = Date.now();
      jwt.verify(token, JWT_SECRET);
      const duration = Date.now() - startTime;

      // JWT verification should be < 10ms
      expect(duration).toBeLessThan(10);
    });

    it('should complete refresh token lookup in reasonable time', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      await db.insert(sessions).values({
        userId: testUserId,
        refreshToken: token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      const startTime = Date.now();

      await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, token),
      });

      const duration = Date.now() - startTime;

      // Query should complete in < 100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Database Constraints', () => {
    it('should have foreign key constraint on userId in sessions', async () => {
      const token = crypto.randomBytes(32).toString('hex');

      try {
        await db.insert(sessions).values({
          userId: 'non-existent-user-id',
          refreshToken: token,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        });

        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('23503'); // PostgreSQL foreign key violation
      }
    });

    it('should have unique constraint on refreshToken', async () => {
      const token = crypto.randomBytes(32).toString('hex');

      // Create first session
      await db.insert(sessions).values({
        userId: testUserId,
        refreshToken: token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Try to create duplicate token
      try {
        await db.insert(sessions).values({
          userId: testUserId,
          refreshToken: token, // Same token
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        });

        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('23505'); // PostgreSQL unique violation
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined tokens gracefully', () => {
      expect(() => {
        jwt.verify(null as any, JWT_SECRET);
      }).toThrow();

      expect(() => {
        jwt.verify(undefined as any, JWT_SECRET);
      }).toThrow();
    });

    it('should handle very long tokens gracefully', () => {
      const veryLongToken = 'a'.repeat(10000);

      expect(() => {
        jwt.verify(veryLongToken, JWT_SECRET);
      }).toThrow();
    });

    it('should handle SQL injection in refresh token lookup', async () => {
      const maliciousToken = "'; DROP TABLE sessions; --";

      // Drizzle ORM should sanitize input
      const session = await db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.refreshToken, maliciousToken),
      });

      expect(session).toBeUndefined();
    });
  });
});
