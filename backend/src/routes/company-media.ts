/**
 * Company Media Upload Routes - Hono HTTP Endpoints
 *
 * Handles image uploads for company free presentations (blog, offers, gallery).
 * Uses Wasabi S3 for storage.
 *
 * Route: POST /api/company-media/upload
 */

import { Hono } from 'hono';
import { db } from '../db';
import { companies } from '../db/schema/companies';
import { companyDirectory } from '../db/schema/company-directory';
import { eq } from 'drizzle-orm';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, WASABI_BUCKET_NAME } from '../lib/s3';
import { verifyFirebaseToken } from '../lib/firebase-admin';

const app = new Hono();

app.post('/upload', async (c) => {
  try {
    // 1. Verify Firebase authentication
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const token = authHeader.substring(7);
    let firebaseUid: string;

    try {
      const decoded = await verifyFirebaseToken(token);
      firebaseUid = decoded.uid;
    } catch {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }

    // 2. Find company owner
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.firebaseUid, firebaseUid))
      .limit(1);

    if (!company) {
      return c.json({ success: false, error: 'Firma nije pronadjena' }, 403);
    }

    // 3. Find claimed directory entry
    const [dirEntry] = await db
      .select({ id: companyDirectory.id })
      .from(companyDirectory)
      .where(eq(companyDirectory.claimedByCompanyId, company.id))
      .limit(1);

    if (!dirEntry) {
      return c.json({ success: false, error: 'Nemate preuzetu stranicu firme' }, 403);
    }

    // 4. Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ success: false, error: 'Fajl nije pronadjen' }, 400);
    }

    // 5. Validate file
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({
        success: false,
        error: 'Nepodrzani format. Dozvoljeni: PNG, JPG, WebP, GIF',
      }, 400);
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return c.json({ success: false, error: 'Fajl je prevelik (maksimum 5MB)' }, 400);
    }

    // 6. Upload to Wasabi S3
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const ext = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const storageKey = `company-media/${dirEntry.id}/${timestamp}_${Math.random().toString(36).substring(7)}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: WASABI_BUCKET_NAME,
      Key: storageKey,
      Body: fileBuffer,
      ContentType: file.type,
    });

    await s3Client.send(command);

    // Generate a public URL (Wasabi supports direct public access via bucket policy)
    const url = `https://${WASABI_BUCKET_NAME}.s3.eu-central-1.wasabisys.com/${storageKey}`;

    return c.json({
      success: true,
      url,
      storageKey,
    });
  } catch (error) {
    console.error('Company media upload failed:', error);
    return c.json({ success: false, error: 'Greska pri otpremanju fajla' }, 500);
  }
});

export default app;
