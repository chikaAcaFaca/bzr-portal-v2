/**
 * Thumbnail Service — Nano Banana Pro (Google Gemini Image Generation)
 *
 * Generates 4K YouTube thumbnails and social media cover images
 * using Google AI Studio's Gemini image generation models.
 *
 * Models:
 * - gemini-2.5-flash-image: Cheapest ($0.039/image), good for social
 * - gemini-3-pro-image-preview: Best quality ($0.134/image), for YouTube 4K
 *
 * Setup:
 * 1. Go to aistudio.google.com
 * 2. Create API key
 * 3. Set GOOGLE_AI_API_KEY in .env
 * 4. New accounts get $300 free credits
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Types
// =============================================================================

interface ThumbnailOptions {
  prompt: string;
  style?: 'youtube_thumbnail' | 'social_square' | 'social_story' | 'blog_cover';
  model?: 'fast' | 'quality';
  title?: string; // Text overlay for thumbnail
}

interface ThumbnailResult {
  success: boolean;
  filePath?: string;
  mimeType?: string;
  error?: string;
}

// =============================================================================
// Configuration
// =============================================================================

const MODELS = {
  fast: 'gemini-2.5-flash-image',         // ~$0.039/image (needs billing)
  quality: 'nano-banana-pro-preview',      // ~$0.134/image (best quality, needs billing)
};

const ASPECT_RATIOS = {
  youtube_thumbnail: '16:9',
  social_square: '1:1',
  social_story: '9:16',
  blog_cover: '16:9',
};

const THUMBNAIL_DIR = path.resolve(__dirname, '../../../../content-pipeline/thumbnails');

function ensureThumbnailDir() {
  if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
  }
}

// =============================================================================
// Core Generation
// =============================================================================

/**
 * Generate a thumbnail image using Google Gemini
 */
export async function generateThumbnail(options: ThumbnailOptions): Promise<ThumbnailResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GOOGLE_AI_API_KEY not set. Get one at aistudio.google.com' };
  }

  try {
    // Dynamic import to avoid issues if package not installed
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const model = options.model === 'quality' ? MODELS.quality : MODELS.fast;
    const aspectRatio = ASPECT_RATIOS[options.style || 'youtube_thumbnail'];

    // Build enhanced prompt for thumbnail
    const enhancedPrompt = buildThumbnailPrompt(options.prompt, options.style || 'youtube_thumbnail', options.title);

    console.log(`[Thumbnail] Generating with model: ${model}, aspect: ${aspectRatio}`);
    console.log(`[Thumbnail] Prompt: ${enhancedPrompt.substring(0, 150)}...`);

    const response = await ai.models.generateContent({
      model,
      contents: enhancedPrompt,
      config: {
        responseModalities: ['image', 'text'],
      },
    });

    // Extract image from response
    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          ensureThumbnailDir();
          const fileName = `thumb-${Date.now()}.png`;
          const filePath = path.join(THUMBNAIL_DIR, fileName);

          // Write image data
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(filePath, buffer);

          console.log(`[Thumbnail] Saved: ${filePath} (${(buffer.length / 1024).toFixed(0)} KB)`);

          return {
            success: true,
            filePath,
            mimeType: part.inlineData.mimeType || 'image/png',
          };
        }
      }
    }

    return { success: false, error: 'No image in response' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Thumbnail] Generation failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Generate thumbnail for a content piece by ID
 */
export async function generateThumbnailForContent(contentId: string): Promise<ThumbnailResult> {
  const draftsDir = path.resolve(__dirname, '../../../../content-pipeline/drafts');
  const contentPath = path.join(draftsDir, `${contentId}.json`);

  if (!fs.existsSync(contentPath)) {
    return { success: false, error: `Content ${contentId} not found` };
  }

  const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

  const result = await generateThumbnail({
    prompt: content.thumbnailPrompt,
    style: 'youtube_thumbnail',
    model: 'quality',
    title: content.title,
  });

  // Update content piece with thumbnail path
  if (result.success && result.filePath) {
    content.thumbnailPath = result.filePath;
    content.status = 'video_pending';
    fs.writeFileSync(contentPath, JSON.stringify(content, null, 2), 'utf-8');
  }

  return result;
}

// =============================================================================
// Prompt Engineering
// =============================================================================

/**
 * Build an optimized prompt for thumbnail generation
 */
function buildThumbnailPrompt(
  basePrompt: string,
  style: string,
  title?: string,
): string {
  const styleGuides: Record<string, string> = {
    youtube_thumbnail: `Create a professional YouTube thumbnail image. Style: bright, high-contrast, eye-catching.
Include dramatic lighting, clean composition.
${title ? `Include bold text overlay: "${title.substring(0, 40)}" in large white font with dark outline/shadow.` : ''}
Colors: vibrant, saturated. Background: gradient or contextual workplace scene.
Expression: professional person looking concerned or surprised (if person in scene).
NO watermarks, NO logos. Clean, modern design.`,

    social_square: `Create a professional square social media post image. Clean, modern, minimal.
${title ? `Include text: "${title.substring(0, 30)}" in modern font.` : ''}
Professional color scheme. Suitable for Instagram and Facebook.`,

    social_story: `Create a vertical story/reel cover image. Bold, attention-grabbing.
${title ? `Large text: "${title.substring(0, 25)}"` : ''}
Mobile-optimized, high contrast.`,

    blog_cover: `Create a professional blog header image. Wide format, clean, corporate style.
${title ? `Include title text: "${title.substring(0, 50)}"` : ''}
Subtle, professional colors. Suitable for website header.`,
  };

  return `${styleGuides[style] || styleGuides.youtube_thumbnail}\n\nSubject/Context: ${basePrompt}`;
}

// =============================================================================
// Batch Generation
// =============================================================================

/**
 * Generate thumbnails for all draft content pieces that don't have one
 */
export async function generatePendingThumbnails(): Promise<{
  generated: number;
  failed: number;
  errors: string[];
}> {
  const result = { generated: 0, failed: 0, errors: [] as string[] };

  const draftsDir = path.resolve(__dirname, '../../../../content-pipeline/drafts');
  if (!fs.existsSync(draftsDir)) return result;

  const files = fs.readdirSync(draftsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(draftsDir, file), 'utf-8'));

      // Skip if already has thumbnail
      if (content.thumbnailPath || content.status !== 'draft') continue;

      const contentId = file.replace('.json', '');
      console.log(`[Thumbnail] Generating for: ${content.title}`);

      const thumbResult = await generateThumbnail({
        prompt: content.thumbnailPrompt,
        style: 'youtube_thumbnail',
        model: 'quality',
        title: content.title,
      });

      if (thumbResult.success) {
        content.thumbnailPath = thumbResult.filePath;
        content.status = 'video_pending';
        fs.writeFileSync(path.join(draftsDir, file), JSON.stringify(content, null, 2), 'utf-8');
        result.generated++;
      } else {
        result.failed++;
        result.errors.push(`${contentId}: ${thumbResult.error}`);
      }

      // Rate limit: wait 2 seconds between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      result.failed++;
      result.errors.push(`${file}: ${err}`);
    }
  }

  return result;
}

// =============================================================================
// Export
// =============================================================================

export const thumbnailService = {
  generateThumbnail,
  generateThumbnailForContent,
  generatePendingThumbnails,
};
