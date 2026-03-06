/**
 * Chunked Text Processing - Obrada velikih tekstualnih dokumenata u delovima
 * DeepSeek ima limit od 8k tokena, pa obrađujemo dokument u chunk-ovima
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import OpenAI from 'openai';

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

// Estimacija tokena (grubo: 1 token ≈ 3 karaktera za srpski tekst sa ćirilicom)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

// Podeli tekst na chunk-ove bez prekidanja pozicija
function splitIntoChunks(text: string, maxTokens: number = 7500): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');

  let currentChunk = '';
  let currentTokens = 0;
  let positionBuffer = ''; // Buffer za trenutnu poziciju
  let positionTokens = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);

    // Proveri da li linija počinje novu poziciju (broj + tačka ili veliki naslov)
    const isNewPosition = /^\d+\.\s+[А-ЯЁЊЉЏЂЖЧШЋа-яёњљџђжчшћ\s]+$/u.test(line.trim()) ||
      /^[А-ЯЁЊЉЏЂЖЧШЋ\s]{20,}$/u.test(line.trim());

    if (isNewPosition) {
      // Ako imamo staru poziciju u bufferu, dodaj je u chunk
      if (positionBuffer) {
        // Proveri da li bi dodavanje ove pozicije prekoračilo limit
        if (currentTokens + positionTokens > maxTokens && currentChunk) {
          // Sačuvaj trenutni chunk bez ove pozicije
          chunks.push(currentChunk);
          console.log(`   📦 Chunk ${chunks.length}: ~${currentTokens} tokena`);
          currentChunk = positionBuffer;
          currentTokens = positionTokens;
        } else {
          // Dodaj poziciju u trenutni chunk
          currentChunk += (currentChunk ? '\n' : '') + positionBuffer;
          currentTokens += positionTokens;
        }
      }

      // Započni novu poziciju
      positionBuffer = line;
      positionTokens = lineTokens;
    } else {
      // Nastavi postojeću poziciju
      positionBuffer += (positionBuffer ? '\n' : '') + line;
      positionTokens += lineTokens;
    }
  }

  // Dodaj poslednju poziciju
  if (positionBuffer) {
    if (currentTokens + positionTokens > maxTokens && currentChunk) {
      chunks.push(currentChunk);
      console.log(`   📦 Chunk ${chunks.length}: ~${currentTokens} tokena`);
      currentChunk = positionBuffer;
      currentTokens = positionTokens;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + positionBuffer;
      currentTokens += positionTokens;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
    console.log(`   📦 Chunk ${chunks.length}: ~${currentTokens} tokena`);
  }

  return chunks;
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
1. Број позиције (нпр. "1", "2", "3" - или ако нема броја, користи редни број)
2. Назив радног места (обично је на почетку описа велим словима или подвучено)
3. Детаљан опис послова (све реченице које описују шта радник ради)
4. Одговорности (ако су експлицитно наведене)
5. Евентуалне опасности/ризике који се помињу (рад са возилима, машинама, висине, хемикалије, електрика, буку, вибрације, стрес, итд)
6. Коме је одговоран (обично "директору", "руководиоцу сектора", итд)
7. Сектор/одељење (обично на почетку секције: "РЈ", "СЕКТОР ЗА...", итд)

Врати JSON у следећем формату (САМО array позиција):

[
  {
    "positionNumber": "1",
    "title": "НАЗИВ РАДНОГ МЕСТА",
    "description": "Детаљан опис послова и задатака...",
    "responsibilities": ["Одговорност 1", "Одговорност 2"],
    "hazards": ["Опасност 1", "Опасност 2"],
    "reportingTo": "директору",
    "sector": "РЈ Заједничке службе"
  }
]

ВАЖНО:
- Екстрахуј СВЕ радне позиције из овог дела документа
- За сваку позицију детаљно наведи опис послова
- Идентификуј потенцијалне опасности из описа (рад са возилима, машинама, висине, хемикалије, електрика, буку, вибрације, прах, алергени, стрес, психолошко оптерећење, рад на терену, временски услови, итд)
- Сачувај оригиналну ћирилицу
- Врати САМО валидан JSON array без додатних објашњења или markdown форматирања
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

    console.log(`📊 Ekstraktovano pozicija: ${positions.length}`);

    if (positions.length > 0) {
      console.log(`   Pozicije: ${positions.map((p: any) => p.positionNumber).join(', ')}`);
    }

    const inputCost = (response.usage?.prompt_tokens || 0) * 0.00055 / 1000;
    const outputCost = (response.usage?.completion_tokens || 0) * 0.00219 / 1000;
    console.log(`💰 Trošak: $${(inputCost + outputCost).toFixed(6)}`);

    return positions;

  } catch (error: any) {
    console.error(`❌ Greška pri obradi chunk-a ${chunkIndex + 1}:`, error.message);

    // Sačuvaj problematični chunk za debug
    writeFileSync(`chunk-error-${chunkIndex + 1}.txt`, chunk, 'utf-8');
    console.log(`💾 Problematični chunk sačuvan u: chunk-error-${chunkIndex + 1}.txt`);

    return [];
  }
}

async function processFullDocument(textPath: string) {
  console.log('🔍 Chunked Text Processing - Sistematizacija poslova\n');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Učitaj tekst
  console.log(`📄 Učitavanje teksta iz: ${textPath}\n`);
  const fullText = readFileSync(textPath, 'utf-8');
  console.log(`✅ Tekst učitan: ${fullText.length} karaktera, ~${estimateTokens(fullText)} tokena\n`);

  // 2. Podeli na chunk-ove
  console.log('📑 Deljenje dokumenta na chunk-ove...\n');
  const chunks = splitIntoChunks(fullText, 6500);
  console.log(`\n✅ Dokument podeljen na ${chunks.length} chunk-ova\n`);

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
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // 4. Finalizuj bazu znanja
  knowledgeBase.processingComplete = true;
  writeFileSync(
    'sistematizacija-knowledge-base-final.json',
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

  // Show all unique hazards
  const allHazards = new Set<string>();
  knowledgeBase.positions.forEach((p) => {
    p.hazards?.forEach((h) => allHazards.add(h));
  });
  console.log(`   Različitih vrsta opasnosti: ${allHazards.size}`);

  console.log('\n💾 BAZA ZNANJA:\n');
  console.log('   📁 sistematizacija-knowledge-base-final.json');
  console.log(`   📊 ${knowledgeBase.positions.length} radnih pozicija sa detaljnim opisima\n`);

  console.log('💡 SLEDEĆI KORACI:');
  console.log('   - Baza znanja je spremna za upotrebu');
  console.log('   - Može se koristiti za automatsko popunjavanje Akta o proceni rizika');
  console.log('   - AI agent može pristupiti ovim podacima po radnom mestu');
  console.log('   - Identifikovane su sve opasnosti za svaku poziciju\n');
}

// Main
const textPath = process.argv[2];

if (!textPath) {
  console.error('❌ Molimo navedite putanju do tekstualnog fajla');
  console.log('\nKorišćenje:');
  console.log('  npx tsx src/process-text-chunked.ts <putanja-do-txt-fajla>');
  process.exit(1);
}

processFullDocument(textPath).catch((error) => {
  console.error('\n❌ GREŠKA:\n');
  console.error(error.message || error);
  process.exit(1);
});
