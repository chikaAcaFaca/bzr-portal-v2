/**
 * Document Creation Agent Service
 *
 * Guides users through conversational document creation:
 * - Asks clarifying questions with dynamic, engaging responses
 * - Validates data (PIB, JMBG) during conversation
 * - Collects company info, work positions, hazards
 * - Auto-suggests hazards based on job descriptions
 * - Generates document when all data is collected
 *
 * Uses Claude Sonnet 4.6 for document generation quality
 */

import { validatePIB, validateJMBG } from '../../lib/validators';
import { getAnthropic, MODELS } from '../../lib/ai/providers';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Dynamic Response Generation
// =============================================================================

/**
 * Generate a dynamic, engaging response using Claude
 * Falls back to static message if LLM call fails
 */
async function generateDynamicResponse(
  context: {
    step: string;
    justCollected?: string;
    justCollectedValue?: string;
    nextField: string;
    companyData?: Record<string, string | undefined>;
    positionsCount?: number;
    hazardsCount?: number;
    progressPercent?: number;
  },
  fallbackMessage: string,
  fallbackQuestion?: string,
): Promise<{ message: string; question?: string }> {
  try {
    const anthropic = getAnthropic();
    const prompt = `Ti si Botislav, AI savetnik za BZR. Upravo si u razgovoru sa korisnikom koji kreira Akt o proceni rizika.

KONTEKST:
- Korak: ${context.step}
${context.justCollected ? `- Korisnik je upravo uneo: ${context.justCollected} = "${context.justCollectedValue}"` : ''}
${context.companyData ? `- Podaci firme do sada: ${JSON.stringify(context.companyData)}` : ''}
${context.positionsCount ? `- Broj radnih mesta: ${context.positionsCount}` : ''}
${context.hazardsCount ? `- Broj opasnosti: ${context.hazardsCount}` : ''}
${context.progressPercent ? `- Napredak: ${context.progressPercent}%` : ''}
- Sledece polje koje treba prikupiti: ${context.nextField}

ZADATAK:
Napiši JEDAN kratak, angažovan odgovor (max 2 rečenice) koji:
1. Potvrdi šta je korisnik upravo uneo (sa relevantnim komentarom, NE generičko "Odlično!")
2. Prirodno pređi na sledeće pitanje

Budi SPECIFIČAN - ako je korisnik uneo šifru delatnosti, komentiši šta ta delatnost znači za BZR.
Ako je uneo broj zaposlenih, komentiši kako to utiče na cenu/kompleksnost.

Format odgovora (JSON):
{"message": "tvoj komentar", "question": "sledece pitanje"}

Piši na srpskom (ćirilica).`;

    const response = await anthropic.messages.create({
      model: MODELS.claude,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { message: parsed.message, question: parsed.question };
    }
  } catch {
    // Fall back to static response
  }
  return { message: fallbackMessage, question: fallbackQuestion };
}

/**
 * Load hazard suggestions from knowledge base for a given job description
 */
function suggestHazardsFromKnowledgeBase(
  activityCode?: string,
  jobDescription?: string,
): Array<{ hazardName: string; category: string; typical: boolean }> {
  const suggestions: Array<{ hazardName: string; category: string; typical: boolean }> = [];

  try {
    const kbPath = path.resolve(__dirname, '../../../../knowledge-base/opasnosti');
    const categories = ['MEH-mehanicke', 'ELE-elektricne', 'HEM-hemijske', 'ERG-ergonomske', 'FIZ-fizicke', 'PSI-psihosocijalne'];

    for (const cat of categories) {
      const filePath = path.join(kbPath, `${cat}.json`);
      if (!fs.existsSync(filePath)) continue;

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(data)) continue;

      for (const hazard of data) {
        const name = hazard.naziv || hazard.name || '';
        const keywords = hazard.kljucne_reci || hazard.keywords || [];
        const desc = (jobDescription || '').toLowerCase();

        // Match based on keywords or common patterns
        const isRelevant = keywords.some((kw: string) => desc.includes(kw.toLowerCase())) ||
          (cat.includes('ERG') && desc.match(/kancelarij|računar|sedec|admin|računovodj/i)) ||
          (cat.includes('ELE') && desc.match(/elektr|instalacij|struj|mašin/i)) ||
          (cat.includes('MEH') && desc.match(/mašin|alat|vozil|gradjevina|visina|teško/i)) ||
          (cat.includes('PSI') && desc.match(/stres|rok|kontakt|javnost|noćn/i));

        if (isRelevant && name) {
          suggestions.push({
            hazardName: name,
            category: cat.split('-')[0],
            typical: true,
          });
        }
      }
    }
  } catch {
    // Knowledge base not available, return empty
  }

  return suggestions.slice(0, 8); // Max 8 suggestions
}

// =============================================================================
// Types
// =============================================================================

export interface DocumentConversationState {
  step: 'company_info' | 'positions' | 'hazards' | 'measures' | 'complete';
  collectedData: {
    // Company data
    company?: {
      name?: string;
      pib?: string;
      address?: string;
      city?: string;
      director?: string;
      directorJmbg?: string;
      bzrResponsiblePerson?: string;
      bzrResponsibleJmbg?: string;
      activityCode?: string;
      activityDescription?: string;
      employeeCount?: string;
    };

    // Work positions
    positions?: Array<{
      positionName: string;
      totalCount: number;
      maleCount?: number;
      femaleCount?: number;
      workDescription?: string;
      hazards?: Array<{
        hazardName: string;
        ei: number; // Exposure index
        pi: number; // Probability index
        fi: number; // Frequency index
        ri: number; // Initial risk
        measures?: string[];
        residualRi?: number;
      }>;
    }>;

    // Metadata
    generatedDate?: string;
  };

  // Validation errors
  errors?: string[];

  // Missing fields that need to be asked
  missingFields?: string[];
}

export interface DocumentAgentResponse {
  message: string;
  question?: string;
  state: DocumentConversationState;
  isComplete: boolean;
  documentData?: any; // Final data for document generation
}

// =============================================================================
// Conversation Flow Helpers
// =============================================================================

/**
 * Determine what to ask next based on current state
 */
function getNextQuestion(state: DocumentConversationState): DocumentAgentResponse | null {
  const { collectedData, step } = state;

  // Step 1: Company Information
  if (step === 'company_info') {
    if (!collectedData.company?.name) {
      return {
        message: 'Хајде да започнемо креирање Акта о процени ризика.',
        question: 'Који је пун назив ваше компаније?',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.pib) {
      return {
        message: 'Одлично! Сада ми треба ПИБ компаније.',
        question: 'Који је ПИБ (Порески идентификациони број) ваше компаније? (9 цифара)',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.address) {
      return {
        message: 'Супер! Сада адреса.',
        question: 'Која је пуна адреса седишта компаније?',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.city) {
      return {
        message: 'Добро.',
        question: 'У ком је граду седиште?',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.director) {
      return {
        message: 'Одлично.',
        question: 'Име и презиме директора?',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.directorJmbg) {
      return {
        message: 'Добро.',
        question: 'ЈМБГ директора? (13 цифара)',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.bzrResponsiblePerson) {
      return {
        message: 'Одлично.',
        question: 'Име и презиме лица одговорног за БЗР?',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.bzrResponsibleJmbg) {
      return {
        message: 'Добро.',
        question: 'ЈМБГ лица одговорног за БЗР? (13 цифара)',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.activityCode) {
      return {
        message: 'Супер.',
        question: 'Шифра делатности компаније? (4 цифре)',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.activityDescription) {
      return {
        message: 'Одлично.',
        question: 'Опис делатности компаније?',
        state,
        isComplete: false,
      };
    }

    if (!collectedData.company?.employeeCount) {
      return {
        message: 'Добро.',
        question: 'Број запослених у компанији?',
        state,
        isComplete: false,
      };
    }

    // Company info complete, move to positions
    state.step = 'positions';
    return {
      message: 'Одлично! Основни подаци о компанији су комплетни. ✅\n\nСада прелазимо на радна места.',
      question: 'Колико радних места треба да обрадимо?',
      state,
      isComplete: false,
    };
  }

  // Step 2: Work Positions
  if (step === 'positions') {
    if (!collectedData.positions || collectedData.positions.length === 0) {
      return {
        message: 'Хајде да додамо прво радно место.',
        question: 'Назив радног места? (нпр. "Администратор", "Рачуновођа")',
        state,
        isComplete: false,
      };
    }

    // Check if current position is complete
    const currentPosition = collectedData.positions[collectedData.positions.length - 1];

    if (!currentPosition.totalCount) {
      return {
        message: 'Добро.',
        question: 'Колико запослених ради на овом радном месту?',
        state,
        isComplete: false,
      };
    }

    if (!currentPosition.workDescription) {
      return {
        message: 'Одлично.',
        question: 'Опис послова које обављају на овом радном месту?',
        state,
        isComplete: false,
      };
    }

    // Position basic info complete, suggest hazards from knowledge base
    if (!currentPosition.hazards || currentPosition.hazards.length === 0) {
      const suggestions = suggestHazardsFromKnowledgeBase(
        state.collectedData.company?.activityCode,
        currentPosition.workDescription || currentPosition.positionName,
      );

      if (suggestions.length > 0) {
        const suggestionList = suggestions.map((s, i) => `${i + 1}. ${s.hazardName} (${s.category})`).join('\n');
        return {
          message: `Супер! Радно место је дефинисано. ✅\n\nНа основу описа посла, препоручујем следеће опасности:\n\n${suggestionList}\n\nМожете потврдити све, изабрати неке (нпр. "1, 3, 5"), или додати своје.`,
          question: 'Које опасности прихватате? (све / бројеви / или опишите своје)',
          state,
          isComplete: false,
        };
      }

      return {
        message: 'Супер! Радно место је дефинисано. ✅\n\nСада треба да идентификујемо опасности и штетности.',
        question: 'Која је прва опасност на овом радном месту? (нпр. "Дуготрајан седећи положај", "Рад на рачунару")',
        state,
        isComplete: false,
      };
    }

    // Ask if want to add more hazards
    return {
      message: `Тренутно има ${currentPosition.hazards.length} идентификованих опасности.`,
      question: 'Да ли желите да додате још опасности за ово радно место? (да/не)',
      state,
      isComplete: false,
    };
  }

  // Step 3: Complete
  if (step === 'complete') {
    return {
      message: 'Свака част! Прикупили смо све потребне податке. ✅\n\nСада могу да генеришем Акт о процени ризика.',
      question: 'Да ли желите да генеришем документ? (да/не)',
      state,
      isComplete: true,
    };
  }

  return null;
}

/**
 * Extract information from user's natural language response
 */
function extractInformation(userMessage: string, expectedField: string): {
  value: string | null;
  confidence: 'high' | 'medium' | 'low';
} {
  const normalized = userMessage.trim();

  // For simple text fields, return the whole message
  if (['name', 'address', 'city', 'director', 'bzrResponsiblePerson', 'activityDescription', 'workDescription', 'hazardName'].includes(expectedField)) {
    return {
      value: normalized,
      confidence: 'high',
    };
  }

  // Extract numbers
  if (['totalCount', 'maleCount', 'femaleCount', 'employeeCount', 'ei', 'pi', 'fi'].includes(expectedField)) {
    const match = normalized.match(/\d+/);
    if (match) {
      return {
        value: match[0],
        confidence: 'high',
      };
    }
  }

  // Extract PIB (9 digits)
  if (expectedField === 'pib') {
    const match = normalized.match(/\d{9}/);
    if (match) {
      return {
        value: match[0],
        confidence: 'high',
      };
    }
  }

  // Extract JMBG (13 digits)
  if (expectedField === 'jmbg') {
    const match = normalized.match(/\d{13}/);
    if (match) {
      return {
        value: match[0],
        confidence: 'high',
      };
    }
  }

  // Extract activity code (4 digits)
  if (expectedField === 'activityCode') {
    const match = normalized.match(/\d{4}/);
    if (match) {
      return {
        value: match[0],
        confidence: 'high',
      };
    }
  }

  return {
    value: null,
    confidence: 'low',
  };
}

/**
 * Validate extracted data
 */
function validateData(field: string, value: string): { valid: boolean; error?: string } {
  if (field === 'pib') {
    if (!validatePIB(value)) {
      return {
        valid: false,
        error: `ПИБ "${value}" није валидан. ПИБ мора имати 9 цифара са валидном контролном сумом. Молим вас да проверите и унесете поново.`,
      };
    }
  }

  if (field === 'jmbg') {
    if (!validateJMBG(value)) {
      return {
        valid: false,
        error: `ЈМБГ "${value}" није валидан. ЈМБГ мора имати 13 цифара са валидном контролном сумом. Молим вас да проверите и унесете поново.`,
      };
    }
  }

  if (field === 'activityCode') {
    if (!/^\d{4}$/.test(value)) {
      return {
        valid: false,
        error: `Шифра делатности мора имати тачно 4 цифре. Молим вас да унесете поново.`,
      };
    }
  }

  return { valid: true };
}

// =============================================================================
// Main Agent Function
// =============================================================================

/**
 * Process user message and update document creation state
 * Enhanced with dynamic LLM responses and knowledge base integration
 */
export async function processDocumentConversation(
  userMessage: string,
  state: DocumentConversationState
): Promise<DocumentAgentResponse> {
  // If no state, initialize
  if (!state.collectedData) {
    state.collectedData = {};
  }

  if (!state.step) {
    state.step = 'company_info';
  }

  // Determine what field we're currently collecting
  const nextQuestion = getNextQuestion(state);

  if (!nextQuestion) {
    // No next question means we're done
    return {
      message: 'Грешка: Не могу да одредим следећи корак.',
      state,
      isComplete: false,
    };
  }

  // Extract information from user's message
  let expectedField = '';

  if (state.step === 'company_info') {
    if (!state.collectedData.company) {
      state.collectedData.company = {};
    }

    const company = state.collectedData.company;

    if (!company.name) expectedField = 'name';
    else if (!company.pib) expectedField = 'pib';
    else if (!company.address) expectedField = 'address';
    else if (!company.city) expectedField = 'city';
    else if (!company.director) expectedField = 'director';
    else if (!company.directorJmbg) expectedField = 'jmbg';
    else if (!company.bzrResponsiblePerson) expectedField = 'bzrResponsiblePerson';
    else if (!company.bzrResponsibleJmbg) expectedField = 'jmbg';
    else if (!company.activityCode) expectedField = 'activityCode';
    else if (!company.activityDescription) expectedField = 'activityDescription';
    else if (!company.employeeCount) expectedField = 'employeeCount';

    // Extract and validate
    if (expectedField) {
      const extracted = extractInformation(userMessage, expectedField);

      if (extracted.value) {
        // Validate if needed
        const validation = validateData(expectedField, extracted.value);

        if (!validation.valid) {
          return {
            message: validation.error!,
            question: nextQuestion.question,
            state,
            isComplete: false,
          };
        }

        // Store the value
        if (expectedField === 'name') company.name = extracted.value;
        else if (expectedField === 'pib') company.pib = extracted.value;
        else if (expectedField === 'address') company.address = extracted.value;
        else if (expectedField === 'city') company.city = extracted.value;
        else if (expectedField === 'director') company.director = extracted.value;
        else if (expectedField === 'jmbg' && !company.directorJmbg) company.directorJmbg = extracted.value;
        else if (expectedField === 'jmbg' && company.directorJmbg) company.bzrResponsibleJmbg = extracted.value;
        else if (expectedField === 'bzrResponsiblePerson') company.bzrResponsiblePerson = extracted.value;
        else if (expectedField === 'activityCode') company.activityCode = extracted.value;
        else if (expectedField === 'activityDescription') company.activityDescription = extracted.value;
        else if (expectedField === 'employeeCount') company.employeeCount = extracted.value;

        // Get next static question, then enhance with dynamic response
        const staticNext = getNextQuestion(state)!;

        // Determine next expected field for dynamic context
        let nextExpected = '';
        if (!company.pib) nextExpected = 'PIB';
        else if (!company.address) nextExpected = 'adresa';
        else if (!company.city) nextExpected = 'grad';
        else if (!company.director) nextExpected = 'direktor';
        else if (!company.directorJmbg) nextExpected = 'JMBG direktora';
        else if (!company.bzrResponsiblePerson) nextExpected = 'lice za BZR';
        else if (!company.bzrResponsibleJmbg) nextExpected = 'JMBG lica za BZR';
        else if (!company.activityCode) nextExpected = 'šifra delatnosti';
        else if (!company.activityDescription) nextExpected = 'opis delatnosti';
        else if (!company.employeeCount) nextExpected = 'broj zaposlenih';
        else nextExpected = 'radna mesta';

        const progress = getConversationProgress(state);
        const dynamic = await generateDynamicResponse(
          {
            step: 'company_info',
            justCollected: expectedField,
            justCollectedValue: extracted.value,
            nextField: nextExpected,
            companyData: company,
            progressPercent: progress.percentComplete,
          },
          staticNext.message,
          staticNext.question,
        );

        return {
          message: dynamic.message,
          question: dynamic.question || staticNext.question,
          state: staticNext.state,
          isComplete: staticNext.isComplete,
        };
      } else {
        return {
          message: 'Нисам сигуран да сам разумео. Молим вас да одговорите јасније.',
          question: nextQuestion.question,
          state,
          isComplete: false,
        };
      }
    }
  }

  if (state.step === 'positions') {
    if (!state.collectedData.positions) {
      state.collectedData.positions = [];
    }

    const positions = state.collectedData.positions;

    // Check if user wants to add a new position
    const addPositionKeywords = ['да', 'yes', 'још', 'додај', 'нов'];
    const noKeywords = ['не', 'no', 'завршио', 'готов'];
    const userResponse = userMessage.toLowerCase().trim();

    // Check if we have a complete position and are asking about adding more positions
    if (positions.length > 0) {
      const lastPosition = positions[positions.length - 1];
      const isLastPositionComplete =
        lastPosition.positionName &&
        lastPosition.totalCount > 0 &&
        lastPosition.workDescription &&
        lastPosition.hazards &&
        lastPosition.hazards.length > 0 &&
        lastPosition.hazards[lastPosition.hazards.length - 1].residualRi !== undefined;

      // If last position is complete, check if user wants to add another position
      if (isLastPositionComplete) {
        // Check if last hazard was just completed and we're asking about more hazards
        const lastHazard = lastPosition.hazards![lastPosition.hazards!.length - 1];
        const justCompletedHazard = lastHazard.residualRi && lastHazard.residualRi > 0;

        // If we just completed a hazard, the user is responding to "want more hazards?"
        // If they say yes, add hazard; if no, ask about more positions
        // But if the entire position was already marked complete before, user is responding to "want more positions?"

        // Check context: if asking about adding another position
        if (addPositionKeywords.some(kw => userResponse.includes(kw))) {
          // User wants to add another position
          // Extract position name if provided
          const positionNameExtracted = extractInformation(userMessage, 'positionName');
          if (positionNameExtracted.value && positionNameExtracted.value.length > 3 && !addPositionKeywords.includes(positionNameExtracted.value.toLowerCase())) {
            // User provided position name in same message
            positions.push({
              positionName: positionNameExtracted.value,
              totalCount: 0,
            });
            return {
              message: `Одлично! Додајем радно место: "${positionNameExtracted.value}"`,
              question: 'Колико запослених ради на овом радном месту?',
              state,
              isComplete: false,
            };
          } else {
            // Ask for position name
            return {
              message: 'Супер! Хајде да додамо ново радно место.',
              question: 'Назив радног места? (нпр. "Администратор", "Рачуновођа")',
              state,
              isComplete: false,
            };
          }
        } else if (noKeywords.some(kw => userResponse.includes(kw))) {
          // User doesn't want more positions, move to complete
          state.step = 'complete';
          return {
            message: `Одлично! Прикупили смо податке за ${positions.length} радних места. ✅\\n\\nСада имам све податке потребне за креирање Акта о процени ризика.`,
            question: 'Да ли желите да генеришем документ сада? (да/не)',
            state,
            isComplete: true,
          };
        }
      }
    }

    // Check if positions array is empty - need to add first position
    if (positions.length === 0) {
      // Extract position name from user message
      const extracted = extractInformation(userMessage, 'positionName');
      if (extracted.value) {
        positions.push({
          positionName: extracted.value,
          totalCount: 0,
        });
        return getNextQuestion(state)!;
      } else {
        return {
          message: 'Нисам сигуран да сам разумео назив радног места. Молим вас да одговорите јасније.',
          question: 'Назив радног места? (нпр. "Администратор", "Рачуновођа")',
          state,
          isComplete: false,
        };
      }
    }

    const currentPosition = positions[positions.length - 1];

    // Collecting totalCount
    if (!currentPosition.totalCount || currentPosition.totalCount === 0) {
      const extracted = extractInformation(userMessage, 'totalCount');
      if (extracted.value) {
        currentPosition.totalCount = parseInt(extracted.value);
        return getNextQuestion(state)!;
      } else {
        return {
          message: 'Нисам сигуран да сам разумео број запослених. Молим вас да унесете број.',
          question: 'Колико запослених ради на овом радном месту?',
          state,
          isComplete: false,
        };
      }
    }

    // Collecting work description
    if (!currentPosition.workDescription) {
      currentPosition.workDescription = userMessage.trim();
      return getNextQuestion(state)!;
    }

    // Initialize hazards array if not present
    if (!currentPosition.hazards) {
      currentPosition.hazards = [];
    }

    const hazards = currentPosition.hazards;

    // Check if user wants to add more hazards or move to next position
    if (hazards.length > 0) {
      const lastHazard = hazards[hazards.length - 1];

      // Check if current hazard is incomplete
      if (!lastHazard.ei || !lastHazard.pi || !lastHazard.fi || !lastHazard.ri) {
        // Collecting hazard risk parameters
        if (!lastHazard.ei) {
          const extracted = extractInformation(userMessage, 'ei');
          if (extracted.value) {
            lastHazard.ei = parseInt(extracted.value);
            return {
              message: 'Одлично.',
              question: 'Која је вероватноћа појаве ове опасности? (1-5, где је 1 најмања, а 5 највећа)',
              state,
              isComplete: false,
            };
          } else {
            return {
              message: 'Молим вас да унесете број од 1 до 5.',
              question: 'Колика је изложеност радника овој опасности? (1-5)',
              state,
              isComplete: false,
            };
          }
        }

        if (!lastHazard.pi) {
          const extracted = extractInformation(userMessage, 'pi');
          if (extracted.value) {
            lastHazard.pi = parseInt(extracted.value);
            return {
              message: 'Добро.',
              question: 'Колико често се радник излаже овој опасности? (1-5, где је 1 ретко, а 5 стално)',
              state,
              isComplete: false,
            };
          } else {
            return {
              message: 'Молим вас да унесете број од 1 до 5.',
              question: 'Која је вероватноћа појаве ове опасности? (1-5)',
              state,
              isComplete: false,
            };
          }
        }

        if (!lastHazard.fi) {
          const extracted = extractInformation(userMessage, 'fi');
          if (extracted.value) {
            lastHazard.fi = parseInt(extracted.value);
            // Calculate initial risk: ri = ei × pi × fi
            lastHazard.ri = lastHazard.ei * lastHazard.pi * lastHazard.fi;
            return {
              message: `Одлично! Почетни ниво ризика за "${lastHazard.hazardName}" је ${lastHazard.ri}. ✅`,
              question: 'Које мере превенције треба применити за ову опасност? (опишите мере)',
              state,
              isComplete: false,
            };
          } else {
            return {
              message: 'Молим вас да унесете број од 1 до 5.',
              question: 'Колико често се радник излаже овој опасности? (1-5)',
              state,
              isComplete: false,
            };
          }
        }

        // Collecting measures
        if (!lastHazard.measures || lastHazard.measures.length === 0) {
          const measures = userMessage.trim().split(/[,;•\n]/).map(m => m.trim()).filter(m => m.length > 0);
          lastHazard.measures = measures;

          // Ask for residual risk after measures
          return {
            message: 'Супер! Мере су забележене. ✅',
            question: 'Након примене ових мера, колики је преостали ниво ризика? (1-125, или процена)',
            state,
            isComplete: false,
          };
        }

        // Collecting residual risk
        if (!lastHazard.residualRi) {
          const extracted = extractInformation(userMessage, 'ei'); // Reuse number extraction
          if (extracted.value) {
            lastHazard.residualRi = parseInt(extracted.value);
            return {
              message: `Одлично! Опасност "${lastHazard.hazardName}" је комплетна. ✅`,
              question: 'Да ли желите да додате још опасности за ово радно место? (да/не)',
              state,
              isComplete: false,
            };
          } else {
            return {
              message: 'Молим вас да унесете процењени преостали ниво ризика (број).',
              question: 'Након примене ових мера, колики је преостали ниво ризика?',
              state,
              isComplete: false,
            };
          }
        }
      }

      // Current hazard is complete, check if user wants to add more hazards
      const userResponse = userMessage.toLowerCase().trim();

      if (addPositionKeywords.some(kw => userResponse.includes(kw))) {
        // User wants to add another hazard
        const hazardNameExtracted = extractInformation(userMessage, 'hazardName');
        if (hazardNameExtracted.value && hazardNameExtracted.value.length > 3) {
          // User provided hazard name in same message
          hazards.push({
            hazardName: hazardNameExtracted.value,
            ei: 0,
            pi: 0,
            fi: 0,
            ri: 0,
          });
          return {
            message: `Додајем опасност: "${hazardNameExtracted.value}"`,
            question: 'Колика је изложеност радника овој опасности? (1-5, где је 1 најмања, а 5 највећа)',
            state,
            isComplete: false,
          };
        } else {
          return {
            message: 'Добро.',
            question: 'Која је следећа опасност на овом радном месту?',
            state,
            isComplete: false,
          };
        }
      } else if (noKeywords.some(kw => userResponse.includes(kw))) {
        // User doesn't want more hazards
        // Check if this position is fully complete (has all required data)
        const isPositionComplete =
          currentPosition.positionName &&
          currentPosition.totalCount > 0 &&
          currentPosition.workDescription &&
          hazards.length > 0 &&
          hazards[hazards.length - 1].residualRi !== undefined;

        if (isPositionComplete) {
          // Ask if want to add more positions
          return {
            message: `Радно место "${currentPosition.positionName}" је комплетно са ${hazards.length} опасности. ✅`,
            question: 'Да ли желите да додате још једно радно место? (да/не)',
            state,
            isComplete: false,
          };
        }
      } else {
        // Ambiguous response, clarify
        return {
          message: `Тренутно има ${hazards.length} идентификованих опасности за радно место "${currentPosition.positionName}".`,
          question: 'Да ли желите да додате још опасности за ово радно место? (да/не)',
          state,
          isComplete: false,
        };
      }
    }

    // No hazards yet, add first hazard
    const hazardNameExtracted = extractInformation(userMessage, 'hazardName');
    if (hazardNameExtracted.value) {
      hazards.push({
        hazardName: hazardNameExtracted.value,
        ei: 0,
        pi: 0,
        fi: 0,
        ri: 0,
      });
      return {
        message: `Одлично! Опасност: "${hazardNameExtracted.value}"`,
        question: 'Колика је изложеност радника овој опасности? (1-5, где је 1 најмања, а 5 највећа)',
        state,
        isComplete: false,
      };
    } else {
      return {
        message: 'Нисам сигуран да сам разумео назив опасности. Молим вас да опишете опасност јасније.',
        question: 'Која је прва опасност на овом радном месту? (нпр. "Дуготрајан седећи положај")',
        state,
        isComplete: false,
      };
    }
  }

  // Step: Complete - User confirming document generation
  if (state.step === 'complete') {
    const userResponse = userMessage.toLowerCase().trim();
    const yesKeywords = ['да', 'yes', 'генериши', 'креирај'];
    const noKeywords = ['не', 'no'];

    if (yesKeywords.some(kw => userResponse.includes(kw))) {
      // User confirmed document generation
      return {
        message: 'Одлично! Генеришем Акт о процени ризика на основу прикупљених података. ✅\\n\\nДокумент ће бити спреман за преузимање за неколико тренутака.',
        state,
        isComplete: true,
        documentData: state.collectedData, // Pass collected data for document generation
      };
    } else if (noKeywords.some(kw => userResponse.includes(kw))) {
      // User doesn't want to generate yet
      return {
        message: 'У реду. Ако желите да измените неке податке или генеришете документ касније, само ми реците.',
        question: 'Шта бисте желели да урадите? (измени податке / генериши документ / откажи)',
        state,
        isComplete: false,
      };
    } else {
      // Unclear response
      return {
        message: 'Нисам сигуран да сам разумео.',
        question: 'Да ли желите да генеришем Акт о процени ризика сада? (да/не)',
        state,
        isComplete: false,
      };
    }
  }

  // Fallback
  return nextQuestion;
}

/**
 * Initialize a new document creation conversation
 */
export function initializeDocumentConversation(): DocumentConversationState {
  return {
    step: 'company_info',
    collectedData: {},
  };
}

/**
 * Get conversation progress summary
 */
export function getConversationProgress(state: DocumentConversationState): {
  percentComplete: number;
  summary: string;
} {
  let completed = 0;
  let total = 11; // Company fields

  // Count company fields
  if (state.collectedData.company) {
    if (state.collectedData.company.name) completed++;
    if (state.collectedData.company.pib) completed++;
    if (state.collectedData.company.address) completed++;
    if (state.collectedData.company.city) completed++;
    if (state.collectedData.company.director) completed++;
    if (state.collectedData.company.directorJmbg) completed++;
    if (state.collectedData.company.bzrResponsiblePerson) completed++;
    if (state.collectedData.company.bzrResponsibleJmbg) completed++;
    if (state.collectedData.company.activityCode) completed++;
    if (state.collectedData.company.activityDescription) completed++;
    if (state.collectedData.company.employeeCount) completed++;
  }

  // Count positions (estimate: each position = 5 points, each hazard = 2 points)
  if (state.collectedData.positions && state.collectedData.positions.length > 0) {
    // Add points for having at least one position
    total += state.collectedData.positions.length * 5;

    state.collectedData.positions.forEach(position => {
      if (position.positionName) completed++;
      if (position.totalCount) completed++;
      if (position.workDescription) completed++;

      // Count hazards for this position
      if (position.hazards && position.hazards.length > 0) {
        completed += 2; // Basic hazard identification
        total += position.hazards.length * 2;

        position.hazards.forEach(hazard => {
          if (hazard.ei && hazard.pi && hazard.fi && hazard.ri) completed++;
          if (hazard.measures && hazard.measures.length > 0) completed++;
        });
      }
    });
  } else if (state.step === 'positions' || state.step === 'complete') {
    // Estimate: expect at least 2 positions with 2 hazards each
    total += 2 * 5 + 2 * 2 * 2; // 2 positions × 5 + 2 positions × 2 hazards × 2
  }

  const percentComplete = Math.round((completed / total) * 100);

  // Build summary
  let summary = `Прикупљено ${completed} од ${total} података (${percentComplete}%)`;

  if (state.step === 'company_info') {
    summary += ` - Основни подаци о компанији`;
  } else if (state.step === 'positions') {
    const posCount = state.collectedData.positions?.length || 0;
    const hazCount = state.collectedData.positions?.reduce((sum, p) => sum + (p.hazards?.length || 0), 0) || 0;
    summary += ` - Радна места: ${posCount}, Опасности: ${hazCount}`;
  } else if (state.step === 'complete') {
    summary += ` - Спремно за генерисање`;
  }

  return {
    percentComplete,
    summary,
  };
}
