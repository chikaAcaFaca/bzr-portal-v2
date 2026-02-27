/**
 * Universal Document Processor
 * Handles PDF, DOCX, TXT formats for BZR Portal
 * Converts all to text, then uses AI extraction
 */

import { readFileSync } from 'fs';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

export type DocumentType = 'job_descriptions' | 'employee_list' | 'risk_assessment';
export type FileFormat = 'pdf' | 'docx' | 'txt';

interface ProcessingResult {
  format: FileFormat;
  textContent: string;
  pageCount?: number;
  processingTime: number;
  success: boolean;
  error?: string;
}

export class DocumentProcessor {
  /**
   * Детектује формат документа на основу екстензије и magic bytes
   */
  static detectFormat(filePath: string, buffer: Buffer): FileFormat {
    const ext = filePath.toLowerCase().split('.').pop();

    // Check magic bytes for verification
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'pdf';
    }

    if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
      return 'docx'; // ZIP-based (DOCX is ZIP)
    }

    return ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : 'txt';
  }

  /**
   * Екстрахује текст из PDF документа
   */
  static async extractFromPDF(buffer: Buffer): Promise<string> {
    const startTime = Date.now();

    try {
      const data = await (pdfParse as any)(buffer);

      console.log(`📄 PDF обрађен за ${Date.now() - startTime}ms`);
      console.log(`   Број страница: ${data.numpages}`);
      console.log(`   Број карактера: ${data.text.length}`);

      return data.text;
    } catch (error: any) {
      throw new Error(`PDF екстракција неуспешна: ${error.message}`);
    }
  }

  /**
   * Екстрахује текст из DOCX документа
   */
  static async extractFromDOCX(buffer: Buffer): Promise<string> {
    const startTime = Date.now();

    try {
      const result = await mammoth.extractRawText({ buffer });

      console.log(`📝 DOCX обрађен за ${Date.now() - startTime}ms`);
      console.log(`   Број карактера: ${result.value.length}`);

      if (result.messages.length > 0) {
        console.warn('⚠️  DOCX упозорења:', result.messages);
      }

      return result.value;
    } catch (error: any) {
      throw new Error(`DOCX екстракција неуспешна: ${error.message}`);
    }
  }

  /**
   * Учитава TXT документ
   */
  static async extractFromTXT(buffer: Buffer): Promise<string> {
    const startTime = Date.now();

    try {
      // Покушај детектовати encoding (UTF-8, UTF-16, Windows-1251 за ћирилицу)
      let text = buffer.toString('utf-8');

      // Провери да ли је валидан UTF-8
      if (text.includes('�')) {
        // Покушај Windows-1251 (Cyrillic)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const iconv = require('iconv-lite');
        text = iconv.decode(buffer, 'win1251');
      }

      console.log(`📃 TXT обрађен за ${Date.now() - startTime}ms`);
      console.log(`   Број карактера: ${text.length}`);

      return text;
    } catch (error: any) {
      throw new Error(`TXT екстракција неуспешна: ${error.message}`);
    }
  }

  /**
   * Универзална метода за обраду документа
   */
  static async processDocument(filePath: string): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      console.log(`\n🔄 ОБРАДА ДОКУМЕНТА: ${filePath}\n`);

      // Учитај документ
      const buffer = readFileSync(filePath);
      const format = this.detectFormat(filePath, buffer);

      console.log(`📋 Детектован формат: ${format.toUpperCase()}`);

      // Екстрахуј текст на основу формата
      let textContent: string;

      switch (format) {
        case 'pdf':
          textContent = await this.extractFromPDF(buffer);
          break;
        case 'docx':
          textContent = await this.extractFromDOCX(buffer);
          break;
        case 'txt':
          textContent = await this.extractFromTXT(buffer);
          break;
        default:
          throw new Error(`Неподржан формат: ${format}`);
      }

      const processingTime = Date.now() - startTime;

      console.log(`\n✅ Документ обрађен за ${processingTime}ms\n`);

      return {
        format,
        textContent,
        processingTime,
        success: true,
      };
    } catch (error: any) {
      console.error(`\n❌ Грешка при обради: ${error.message}\n`);

      return {
        format: 'txt',
        textContent: '',
        processingTime: Date.now() - startTime,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Процени колико је ефикасан формат за AI обраду
   */
  static async benchmarkFormat(
    filePath: string,
    aiProcessingFn: (text: string) => Promise<any>
  ): Promise<{
    format: FileFormat;
    extractionTime: number;
    aiProcessingTime: number;
    totalTime: number;
    efficiency: 'excellent' | 'good' | 'poor';
  }> {
    const extractStart = Date.now();
    const result = await this.processDocument(filePath);
    const extractionTime = Date.now() - extractStart;

    const aiStart = Date.now();
    await aiProcessingFn(result.textContent);
    const aiProcessingTime = Date.now() - aiStart;

    const totalTime = extractionTime + aiProcessingTime;

    // Процена ефикасности
    let efficiency: 'excellent' | 'good' | 'poor';
    if (totalTime < 5000) efficiency = 'excellent';
    else if (totalTime < 15000) efficiency = 'good';
    else efficiency = 'poor';

    return {
      format: result.format,
      extractionTime,
      aiProcessingTime,
      totalTime,
      efficiency,
    };
  }
}

/**
 * Пример употребе:
 *
 * const processor = new DocumentProcessor();
 * const result = await processor.processDocument('sistematizacija.pdf');
 *
 * if (result.success) {
 *   // Сада користи result.textContent за AI екстракцију
 *   await extractJobDescriptions(result.textContent);
 * }
 */
