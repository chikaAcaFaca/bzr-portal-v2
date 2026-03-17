/**
 * Content & Outreach Agent (Faza 5)
 *
 * Autonomous content creation and distribution pipeline:
 *
 * INPUT SOURCES:
 * - Regulatory Monitor Agent → new laws, amendments, BZR news
 * - Knowledge Base → educational topics, hazard explanations
 * - Q&A from platform users → frequently asked questions
 * - Seasonal/calendar events → World Safety Day, deadlines, etc.
 *
 * CONTENT PIPELINE:
 * 1. Topic Selection → picks most relevant/engaging topic
 * 2. Script Generation → writes engaging script with clickbait title
 * 3. Thumbnail Creation → Nano Banana Pro API for 4K thumbnails
 * 4. Video Production → HeyGen MCP for avatar video (max 30min)
 * 5. Distribution → YouTube, TikTok, Instagram, Facebook, LinkedIn
 * 6. Blog Post → auto-generates text version for website SEO
 *
 * STYLE:
 * - Professional but ENGAGING — clickbait titles that deliver real value
 * - Storytelling + NLP techniques for retention
 * - Serbian language (latinica for broader reach)
 * - Avatar: energetic, uses pauses + tone changes for attention
 *
 * TOOLS:
 * - Nano Banana Pro → thumbnail/cover image generation (4K, chat-based)
 * - HeyGen MCP → AI avatar video creation (direct from Claude, no API keys)
 * - Platform blog → auto-publish educational content
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../db';
import { getAnthropic, MODELS } from '../lib/ai/providers';

// =============================================================================
// Types
// =============================================================================

interface ContentPiece {
  id: string;
  topic: string;
  type: 'video_script' | 'blog_post' | 'social_post' | 'qa_response';
  title: string;           // Clickbait but accurate title
  titleOptions: string[];  // 3-5 alternative titles for A/B testing
  script: string;          // Full script/content
  thumbnailPrompt: string; // Prompt for Nano Banana Pro
  socialCaptions: {
    youtube: string;
    tiktok: string;
    instagram: string;
    facebook: string;
    linkedin: string;
  };
  tags: string[];
  seoKeywords: string[];
  estimatedDuration: string; // "5min", "15min", etc.
  source: 'regulatory_monitor' | 'knowledge_base' | 'user_qa' | 'calendar';
  sourceRef?: string;
  createdAt: string;
  status: 'draft' | 'thumbnail_pending' | 'video_pending' | 'published';
}

interface ContentPipelineResult {
  topicsGenerated: number;
  scriptsWritten: number;
  thumbnailPrompts: number;
  blogPostsCreated: number;
  errors: string[];
  duration: number;
}

// =============================================================================
// Topic Sources
// =============================================================================

/**
 * Get topics from Regulatory Monitor (new laws, changes)
 */
async function getTopicsFromRegulatoryChanges(): Promise<Array<{
  topic: string;
  context: string;
  urgency: 'high' | 'medium' | 'low';
  source: string;
}>> {
  const topics: Array<{ topic: string; context: string; urgency: 'high' | 'medium' | 'low'; source: string }> = [];

  try {
    const changelogPath = path.resolve(__dirname, '../../../../knowledge-base/propisi/CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      const changelog = fs.readFileSync(changelogPath, 'utf-8');
      const entries = changelog.split('\n## ').slice(1, 5); // Last 5 changes

      for (const entry of entries) {
        const lines = entry.trim().split('\n');
        const date = lines[0];
        const title = lines[1]?.replace(/^-\s*\*\*\w+\*\*:\s*/, '') || '';

        if (title) {
          topics.push({
            topic: title,
            context: `Regulatorna promena od ${date}: ${title}`,
            urgency: title.toLowerCase().includes('zakon') ? 'high' : 'medium',
            source: 'regulatory_monitor',
          });
        }
      }
    }
  } catch { /* no changelog */ }

  return topics;
}

/**
 * Get evergreen topics from knowledge base
 */
function getEvergreenTopics(): Array<{
  topic: string;
  context: string;
  urgency: 'low';
  source: string;
}> {
  return [
    { topic: 'Šta je Akt o proceni rizika i zašto vam treba?', context: 'Zakon o BZR, Član 15-20. Svaka firma mora imati.', urgency: 'low', source: 'knowledge_base' },
    { topic: 'Kinney metod - kako se računa rizik na radnom mestu', context: 'I × E × V × U formula za procenu rizika. Pravilnik 72/2006.', urgency: 'low', source: 'knowledge_base' },
    { topic: '5 najčešćih kazni inspekcije rada (i kako ih izbeci)', context: 'Zakon o BZR kaznene odredbe. Tipicne greske malih firmi.', urgency: 'low', source: 'knowledge_base' },
    { topic: 'Lekarski pregledi zaposlenih - ko, kada, koliko košta', context: 'Pravilnik o lekarskim pregledima. Rokovi i vrste pregleda.', urgency: 'low', source: 'knowledge_base' },
    { topic: 'Obuka za bezbedan rad - šta zakon zahteva od poslodavca', context: 'Zakon o BZR, Član 27-30. Program obuke, periodika.', urgency: 'low', source: 'knowledge_base' },
    { topic: 'Zaštitna oprema (LZS) - vodič za poslodavce u Srbiji', context: 'Pravilnik o LZS. Kategorizacija, standardi, obaveze.', urgency: 'low', source: 'knowledge_base' },
    { topic: 'Rad na visini - šta morate znati pre nego što radnik popne se na merdevine', context: 'Pravilnik o radu na visini. Česte povrede, mere zaštite.', urgency: 'low', source: 'knowledge_base' },
    { topic: 'Ergonomija u kancelariji - monitor, stolica, pauze', context: 'Pravilnik o radu sa ekranima. ERG opasnosti. Čest problem.', urgency: 'low', source: 'knowledge_base' },
    { topic: 'Povreda na radu - šta uraditi u prvih 24 sata', context: 'Obrazac za izvestaj o povredi. Obaveze poslodavca. Rokovi.', urgency: 'low', source: 'knowledge_base' },
    { topic: 'Koliko košta BZR? Uporedite: agencija vs. platforma vs. sam', context: 'Realne cene BZR usluga u Srbiji. ROI analiza.', urgency: 'low', source: 'knowledge_base' },
  ];
}

/**
 * Get calendar-based topics
 */
function getCalendarTopics(): Array<{
  topic: string;
  context: string;
  urgency: 'medium';
  source: string;
}> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const topics: Array<{ topic: string; context: string; urgency: 'medium'; source: string }> = [];

  if (month === 4) {
    topics.push({
      topic: '28. april - Svetski dan bezbednosti na radu',
      context: 'Svetski dan BZR. MOR konvencija. Tema za ovu godinu.',
      urgency: 'medium',
      source: 'calendar',
    });
  }

  if (month === 1 || month === 9) {
    topics.push({
      topic: 'Početak godine/sezone - proverite da li vam je BZR dokumentacija ažurna',
      context: 'Sezonski podsetnik. Akti, pregledi, obuke - sve što treba obnoviti.',
      urgency: 'medium',
      source: 'calendar',
    });
  }

  return topics;
}

// =============================================================================
// Content Generation (AI-Powered)
// =============================================================================

/**
 * Generate a full content piece from a topic
 */
async function generateContentPiece(
  topic: string,
  context: string,
  source: string,
): Promise<ContentPiece | null> {
  try {
    const anthropic = getAnthropic();

    const response = await anthropic.messages.create({
      model: MODELS.claude,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Ti si content creator za BZR Savetnik - platformu za bezbednost i zdravlje na radu u Srbiji.

TEMA: ${topic}
KONTEKST: ${context}

Napravi KOMPLETNI content paket za ovu temu. Piši na SRPSKOM LATINICI.

ZAHTEVI:
1. NASLOV - mora biti CLICKBAIT ali TAČAN. Koristi:
   - Brojeve ("5 stvari...", "3 razloga...")
   - Urgentnost ("...pre nego što bude kasno", "...koje morate znati ODMAH")
   - Pitanja ("Da li znate šta inspekcija gleda PRVO?")
   - Kontrast ("Većina firmi ovo radi POGREŠNO")
   Daj 5 varijanti naslova za A/B testiranje.

2. VIDEO SKRIPTA (max 10 minuta, ~1500 reči):
   - Hook (prvih 10 sekundi): šokantan podatak ili pitanje
   - Problem: zašto je ovo bitno, šta se dešava ako ignorišete
   - Rešenje: korak-po-korak objašnjenje
   - Call to action: "Registrujte se na bzr-savetnik.com"
   - Stil: energičan, pauze za naglašavanje, promena tempa
   - Storytelling: bar 1 realan primer/priča

3. THUMBNAIL PROMPT za Nano Banana Pro:
   - Opis slike za AI generisanje (na engleskom)
   - Stil: YouTube thumbnail, bold tekst, kontrastne boje
   - Uključi: lice sa izrazom iznenađenja ili šoka, bold tekst naslova

4. SOCIAL MEDIA CAPTION za svaku mrežu:
   - YouTube: opis + tagovi
   - TikTok: kratak, sa hashtagovima
   - Instagram: engaging sa emoji
   - Facebook: profesionalan sa pitanjem
   - LinkedIn: stručan, B2B ton

5. SEO KEYWORDS (10 ključnih reči za srpsko tržište)

6. BLOG POST verzija (500-800 reči, SEO optimizovano)

ODGOVORI U JSON FORMATU:
{
  "title": "glavni naslov",
  "titleOptions": ["naslov1", "naslov2", "naslov3", "naslov4", "naslov5"],
  "script": "kompletan video script sa [PAUZA], [NAGLASAK], [TIŠE], [GLASNIJE] oznakama",
  "thumbnailPrompt": "english prompt for Nano Banana Pro",
  "socialCaptions": {
    "youtube": "...",
    "tiktok": "...",
    "instagram": "...",
    "facebook": "...",
    "linkedin": "..."
  },
  "tags": ["tag1", "tag2"],
  "seoKeywords": ["keyword1", "keyword2"],
  "blogPost": "full blog post text",
  "estimatedDuration": "Xmin"
}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      id: `content-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      topic,
      type: 'video_script',
      title: parsed.title,
      titleOptions: parsed.titleOptions || [parsed.title],
      script: parsed.script,
      thumbnailPrompt: parsed.thumbnailPrompt,
      socialCaptions: parsed.socialCaptions,
      tags: parsed.tags || [],
      seoKeywords: parsed.seoKeywords || [],
      estimatedDuration: parsed.estimatedDuration || '10min',
      source: source as any,
      createdAt: new Date().toISOString(),
      status: 'draft',
    };
  } catch (err) {
    console.error('[ContentAgent] Failed to generate content:', err);
    return null;
  }
}

// =============================================================================
// Content Storage
// =============================================================================

const CONTENT_DIR = path.resolve(__dirname, '../../../../content-pipeline');

function ensureContentDir() {
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  for (const sub of ['drafts', 'scripts', 'thumbnails', 'published']) {
    const dir = path.join(CONTENT_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function saveContentPiece(piece: ContentPiece) {
  ensureContentDir();
  const filePath = path.join(CONTENT_DIR, 'drafts', `${piece.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(piece, null, 2), 'utf-8');
  return filePath;
}

function loadContentQueue(): ContentPiece[] {
  ensureContentDir();
  const draftsDir = path.join(CONTENT_DIR, 'drafts');
  const files = fs.readdirSync(draftsDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(draftsDir, f), 'utf-8')); }
    catch { /* parse error */ return null; }
  }).filter(Boolean);
}

// =============================================================================
// Main Agent Function
// =============================================================================

/**
 * Run daily content pipeline
 * Generates 1 content piece per day from best available topic
 */
export async function runContentPipeline(): Promise<ContentPipelineResult> {
  const startTime = Date.now();
  const result: ContentPipelineResult = {
    topicsGenerated: 0,
    scriptsWritten: 0,
    thumbnailPrompts: 0,
    blogPostsCreated: 0,
    errors: [],
    duration: 0,
  };

  console.log('[ContentAgent] Starting daily content pipeline...');

  try {
    // 1. Gather topics from all sources
    const regulatoryTopics = await getTopicsFromRegulatoryChanges();
    const evergreenTopics = getEvergreenTopics();
    const calendarTopics = getCalendarTopics();

    const allTopics = [
      ...regulatoryTopics.map(t => ({ ...t, priority: t.urgency === 'high' ? 3 : 2 })),
      ...calendarTopics.map(t => ({ ...t, priority: 2 })),
      ...evergreenTopics.map(t => ({ ...t, priority: 1 })),
    ];

    // Sort by priority (highest first), then randomize within same priority
    allTopics.sort((a, b) => b.priority - a.priority || Math.random() - 0.5);
    result.topicsGenerated = allTopics.length;

    // 2. Check which topics we've already covered
    const existingContent = loadContentQueue();
    const coveredTopics = new Set(existingContent.map(c => c.topic));

    // 3. Pick first uncovered topic
    const selectedTopic = allTopics.find(t => !coveredTopics.has(t.topic));
    if (!selectedTopic) {
      console.log('[ContentAgent] All topics already covered. Skipping.');
      result.duration = Date.now() - startTime;
      return result;
    }

    console.log(`[ContentAgent] Selected topic: "${selectedTopic.topic}" (source: ${selectedTopic.source})`);

    // 4. Generate content piece
    const piece = await generateContentPiece(
      selectedTopic.topic,
      selectedTopic.context,
      selectedTopic.source,
    );

    if (piece) {
      saveContentPiece(piece);
      result.scriptsWritten = 1;
      result.thumbnailPrompts = 1;
      result.blogPostsCreated = 1;
      console.log(`[ContentAgent] Content generated: "${piece.title}"`);
      console.log(`[ContentAgent] Thumbnail prompt: ${piece.thumbnailPrompt.substring(0, 100)}...`);
      console.log(`[ContentAgent] Duration: ${piece.estimatedDuration}`);

      // 5. Auto-generate thumbnail if Google AI API key is configured
      if (process.env.GOOGLE_AI_API_KEY) {
        try {
          const { generateThumbnailForContent } = await import('./thumbnail.service');
          console.log(`[ContentAgent] Generating thumbnail for: ${piece.id}`);
          const thumbResult = await generateThumbnailForContent(piece.id);
          if (thumbResult.success) {
            console.log(`[ContentAgent] Thumbnail generated: ${thumbResult.filePath}`);
            result.thumbnailPrompts = 1; // Confirmed generated
          } else {
            console.warn(`[ContentAgent] Thumbnail failed: ${thumbResult.error}`);
          }
        } catch (err) {
          console.warn('[ContentAgent] Thumbnail generation skipped:', err);
        }
      } else {
        console.log('[ContentAgent] GOOGLE_AI_API_KEY not set - thumbnail prompt saved for manual generation');
      }
    } else {
      result.errors.push('Failed to generate content piece');
    }
  } catch (err) {
    result.errors.push(`Pipeline error: ${err}`);
  }

  result.duration = Date.now() - startTime;
  console.log(`[ContentAgent] Done in ${result.duration}ms`);

  return result;
}

/**
 * Get content queue for admin review
 */
export function getContentQueue(): {
  drafts: ContentPiece[];
  totalCount: number;
} {
  const drafts = loadContentQueue();
  return { drafts, totalCount: drafts.length };
}

/**
 * Get Nano Banana Pro thumbnail prompt for a content piece
 */
export function getThumbnailPrompt(contentId: string): string | null {
  const drafts = loadContentQueue();
  const piece = drafts.find(d => d.id === contentId);
  return piece?.thumbnailPrompt || null;
}

/**
 * Mark content as published (move from drafts to published)
 */
export function markPublished(contentId: string): boolean {
  ensureContentDir();
  const draftPath = path.join(CONTENT_DIR, 'drafts', `${contentId}.json`);
  const pubPath = path.join(CONTENT_DIR, 'published', `${contentId}.json`);

  if (!fs.existsSync(draftPath)) return false;

  const piece = JSON.parse(fs.readFileSync(draftPath, 'utf-8'));
  piece.status = 'published';
  piece.publishedAt = new Date().toISOString();

  fs.writeFileSync(pubPath, JSON.stringify(piece, null, 2), 'utf-8');
  fs.unlinkSync(draftPath);
  return true;
}

// =============================================================================
// Export
// =============================================================================

export const contentOutreachAgent = {
  runContentPipeline,
  getContentQueue,
  getThumbnailPrompt,
  markPublished,
};
