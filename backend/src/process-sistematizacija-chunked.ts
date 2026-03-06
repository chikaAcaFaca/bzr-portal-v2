/**
 * Chunked Processing - Obrada velikih dokumenata u delovima
 * DeepSeek ima limit od 8k tokena, pa obrađujemo dokument u chunk-ovima
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

interface Position {
  positionNumber: string;
  title: string;
  description: string;
  responsibilities: string[];
  hazards: string[];
  reportingTo: string;
  sector: string;
}

interface CompanyInfo {
  name: string;
  documentType: string;
  documentNumber: string;
  date: string;
}

interface KnowledgeBase {
  companyInfo: CompanyInfo;
  positions: Position[];
  totalProcessed: number;
  processingComplete: boolean;
}

// Estimacija tokena (grubo: 1 token ≈ 4 karaktera za srpski tekst)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3); // Konzervativna procena za ćirilicu
}

// Podeli tekst na chunk-ove bez prekidanja pozicija
function splitIntoChunks(text: string, maxTokens: number = 7000): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');

  let currentChunk = '';
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line);

    // Ako je linija sama prevelika, razbij je
    if (lineTokens > maxTokens) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
        currentTokens = 0;
      }
      // Razbij veliku liniju na manje delove
      const words = line.split(' ');
      let tempChunk = '';
      for (const word of words) {
        if (estimateTokens(tempChunk + ' ' + word) > maxTokens) {
          chunks.push(tempChunk);
          tempChunk = word;
        } else {
          tempChunk += (tempChunk ? ' ' : '') + word;
        }
      }
      if (tempChunk) {
        currentChunk = tempChunk;
        currentTokens = estimateTokens(tempChunk);
      }
      continue;
    }

    // Proveri da li linija počinje novu poziciju (broj + tačka ili veliki naslov)
    const isNewPosition = /^\d+\.\s+[А-ЯЁЊЉЏЂЖЧШЋа-яёњљџђжчшћ\s]+$/u.test(line.trim());

    if (currentTokens + lineTokens > maxTokens && isNewPosition) {
      // Započinje nova pozicija i chunk je pun -> sačuvaj chunk
      chunks.push(currentChunk);
      currentChunk = line;
      currentTokens = lineTokens;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
      currentTokens += lineTokens;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function extractTextFromPDF(pdfPath: string): Promise<string> {
  console.log('📄 Ekstrakcija teksta iz PDF-a pomoću Claude Vision API...\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY nije postavljen');
  }

  const anthropic = new Anthropic({ apiKey });
  const fileBuffer = readFileSync(pdfPath);
  const base64Data = fileBuffer.toString('base64');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: 'Екстрахуј КОМПЛЕТАН текст из овог документа, укључујући све ставке, без икаквог сумирања или скраћивања. Врати само чист текст без додатних коментара.',
          },
        ],
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('Nema tekstualnog odgovora od Claude-a');
  }

  console.log(`✅ Tekst ekstrahovan (${textContent.text.length} karaktera)\n`);
  return textContent.text;
}

async function processChunkWithDeepSeek(
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): Promise<Position[]> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 Obrada chunk-a ${chunkIndex + 1}/${totalChunks}`);
  console.log(`${'='.repeat(60)}\n`);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY nije postavljen');
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.deepseek.com',
  });

  const EXTRACTION_PROMPT = `Анализирај следећи део документа систематизације и екстрахуј СВЕ радне позиције из овог дела.

ДОКУМЕНТ (део ${chunkIndex + 1}/${totalChunks}):
${chunk}

За сваку радну позицију екстрахуј:
1. Број позиције (нпр. "1", "2", "3")
2. Назив радног места
3. Детаљан опис послова
4. Одговорности (ако су наведене)
5. Евентуалне опасности/ризике који се помињу у опису
6. Сектор/одељење коме припада

Врати JSON у следећем формату (САМО array позиција):

[
  {
    "positionNumber": "1",
    "title": "Назив радног места",
    "description": "Детаљан опис послова",
    "responsibilities": ["Одговорност 1", "Одговорност 2"],
    "hazards": ["Опасност 1", "Опасност 2"],
    "reportingTo": "Коме је одговоран",
    "sector": "РЈ/Сектор"
  }
]

ВАЖНО:
- Екстрахуј СВЕ радне позиције из овог дела документа
- За сваку позицију детаљно наведи опис послова
- Идентификуј потенцијалне опасности из описа (рад са возилима, машинама, висине, хемикалије, итд)
- Сачувај оригиналну ћирилицу
- Врати САМО JSON array без додатних објашњења
- Ако нема комплетних позиција у овом делу, врати празан array []`;

  const startTime = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Ти си експерт за обраду организационих докумената и екстракцију структурираних података из српских докумената. Одговараш искључиво валидним JSON-ом.',
        },
        {
          role: 'user',
          content: EXTRACTION_PROMPT,
        },
      ],
      temperature: 0.1,
      max_tokens: 8000,
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Одговор примљен за ${duration}ms (${(duration / 1000).toFixed(1)}s)`);

    const content = response.choices[0]?.message?.content || '';

    // Parse JSON
    let jsonText = content.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const positions = JSON.parse(jsonText);

    console.log(`📊 Ekstraktovano pozicija u ovom chunk-u: ${positions.length}`);

    const inputCost = (response.usage?.prompt_tokens || 0) * 0.00055 / 1000;
    const outputCost = (response.usage?.completion_tokens || 0) * 0.00219 / 1000;
    console.log(`💰 Trošak chunk-a: $${(inputCost + outputCost).toFixed(6)}`);

    return positions;

  } catch (error: any) {
    console.error(`❌ Greška pri obradi chunk-a ${chunkIndex + 1}:`, error.message);
    return [];
  }
}

async function processFullDocument(pdfPath: string) {
  console.log('🔍 Chunked Processing - Sistematizacija poslova\n');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Ekstrahuj tekst iz PDF-a pomoću Claude
  const fullText = await extractTextFromPDF(pdfPath);

  // Sačuvaj ekstraktovani tekst
  writeFileSync('sistematizacija-full-text.txt', fullText, 'utf-8');
  console.log('💾 Pun tekst sačuvan u: sistematizacija-full-text.txt\n');

  // 2. Podeli na chunk-ove
  console.log('📑 Deljenje dokumenta na chunk-ove...\n');
  const chunks = splitIntoChunks(fullText, 7000);
  console.log(`✅ Dokument podeljen na ${chunks.length} chunk-ova\n`);

  // Inicijalizuj bazu znanja
  const knowledgeBase: KnowledgeBase = {
    companyInfo: {
      name: 'ЈКП ЗЕЛЕНИЛО ПАНЧЕВО',
      documentType: 'ОПИС ПОСЛОВА',
      documentNumber: '92-308',
      date: '06.03.2025',
    },
    positions: [],
    totalProcessed: 0,
    processingComplete: false,
  };

  const totalCost = 0;

  // 3. Obradi svaki chunk sa DeepSeek-om
  for (let i = 0; i < chunks.length; i++) {
    const positions = await processChunkWithDeepSeek(chunks[i], i, chunks.length);

    // Dodaj nove pozicije u bazu znanja
    knowledgeBase.positions.push(...positions);
    knowledgeBase.totalProcessed = i + 1;

    // Sačuvaj progress posle svakog chunk-a
    writeFileSync(
      'sistematizacija-knowledge-base.json',
      JSON.stringify(knowledgeBase, null, 2),
      'utf-8'
    );

    console.log(`💾 Progress sačuvan: ${knowledgeBase.positions.length} ukupno pozicija\n`);

    // Mali delay između chunk-ova da se ne preoptereti API
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // 4. Finalizuj bazu znanja
  knowledgeBase.processingComplete = true;
  writeFileSync(
    'sistematizacija-knowledge-base.json',
    JSON.stringify(knowledgeBase, null, 2),
    'utf-8'
  );

  // 5. Prikaži statistiku
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ OBRADA ZAVRŠENA!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 UKUPNA STATISTIKA:\n');
  console.log(`   📦 Ukupno chunk-ova: ${chunks.length}`);
  console.log(`   👷 Ukupno pozicija: ${knowledgeBase.positions.length}`);

  // Group by sector
  const bySector: Record<string, number> = {};
  knowledgeBase.positions.forEach((pos) => {
    const sector = pos.sector || 'Ostalo';
    bySector[sector] = (bySector[sector] || 0) + 1;
  });

  console.log(`\n📋 PO SEKTORIMA:\n`);
  Object.keys(bySector)
    .sort((a, b) => bySector[b] - bySector[a])
    .forEach((sector) => {
      console.log(`   ${sector}: ${bySector[sector]} pozicija`);
    });

  // Count positions with hazards
  const positionsWithHazards = knowledgeBase.positions.filter(
    (p) => p.hazards && p.hazards.length > 0
  );
  console.log(`\n⚠️  OPASNOSTI:\n`);
  console.log(`   Pozicija sa opasnostima: ${positionsWithHazards.length}`);
  console.log(`   Pozicija bez opasnosti: ${knowledgeBase.positions.length - positionsWithHazards.length}`);

  const totalHazards = knowledgeBase.positions.reduce((sum, p) => {
    return sum + (p.hazards?.length || 0);
  }, 0);
  console.log(`   Ukupno identifikovanih opasnosti: ${totalHazards}`);

  console.log('\n💾 BAZA ZNANJA:\n');
  console.log('   📁 sistematizacija-knowledge-base.json');
  console.log('   📁 sistematizacija-full-text.txt\n');

  console.log('💡 SLEDEĆI KORACI:');
  console.log('   - Baza znanja je spremna za upotrebu');
  console.log('   - Može se koristiti za automatsko popunjavanje Akta o proceni rizika');
  console.log('   - AI agent može pristupiti ovim podacima po radnom mestu\n');
}

// Main
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('❌ Molimo navedite putanju do PDF dokumenta');
  console.log('\nKorišćenje:');
  console.log('  npx tsx src/process-sistematizacija-chunked.ts <putanja-do-pdf>');
  process.exit(1);
}

processFullDocument(pdfPath).catch((error) => {
  console.error('\n❌ GREŠKA:\n');
  console.error(error.message || error);
  process.exit(1);
});
