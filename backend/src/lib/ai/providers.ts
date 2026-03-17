/**
 * AI Provider Configuration
 *
 * Multi-provider setup with intelligent routing for cost optimization:
 * - DeepSeek: Simple chat, validation ($0.14/1M tokens) - CHEAPEST
 * - GPT-4 Turbo: Sales, planning ($1-3/1M tokens) - BALANCED
 * - Claude 3.5 Sonnet: Document generation ($3-15/1M tokens) - BEST QUALITY
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Provider Clients (Lazy Initialization)
// =============================================================================

let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;
let _deepseek: OpenAI | null = null;

/**
 * Get OpenAI GPT-4 Turbo Client (lazy initialization)
 * Use for: Sales conversations, document planning, OCR correction
 */
export function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

/**
 * Get Anthropic Claude 3.5 Sonnet Client (lazy initialization)
 * Use for: Document generation, template creation, legal compliance
 */
export function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

/**
 * Get DeepSeek Client (lazy initialization)
 * Use for: Simple chat, form help, data validation
 *
 * Pricing: $0.14/1M input tokens, $0.28/1M output tokens
 * API: https://api.deepseek.com/v1 (OpenAI-compatible)
 */
export function getDeepSeek(): OpenAI {
  if (!_deepseek) {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY environment variable is not set');
    }
    _deepseek = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }
  return _deepseek;
}

// Legacy exports for backward compatibility
export const openai = getOpenAI;
export const anthropic = getAnthropic;
export const deepseek = getDeepSeek;

// =============================================================================
// Provider Types
// =============================================================================

export type AIProvider = 'deepseek' | 'gpt-4' | 'claude';

export type AITask =
  | 'simple_chat'
  | 'form_help'
  | 'data_validation'
  | 'sales_conversation'
  | 'document_planning'
  | 'ocr_correction'
  | 'document_generation'
  | 'template_creation'
  | 'legal_compliance';

// =============================================================================
// Intelligent Routing
// =============================================================================

/**
 * Route AI task to optimal provider based on cost/quality tradeoff
 */
export const AI_ROUTING: Record<AITask, AIProvider> = {
  // DeepSeek - Cheapest ($0.14/1M tokens)
  simple_chat: 'deepseek',
  form_help: 'deepseek',
  data_validation: 'deepseek',

  // GPT-4 Turbo - Mid-range ($1/1M input, $3/1M output)
  sales_conversation: 'gpt-4',
  document_planning: 'gpt-4',
  ocr_correction: 'gpt-4',

  // Claude 3.5 Sonnet - Best for long docs ($3/1M input, $15/1M output)
  document_generation: 'claude',
  template_creation: 'claude',
  legal_compliance: 'claude',
};

/**
 * Get provider client based on task type
 */
export function getProviderForTask(task: AITask): {
  provider: AIProvider;
  client: OpenAI | Anthropic;
} {
  const provider = AI_ROUTING[task];

  const client =
    provider === 'deepseek'
      ? getDeepSeek()
      : provider === 'gpt-4'
        ? getOpenAI()
        : getAnthropic();

  return { provider, client };
}

// =============================================================================
// Model Configuration
// =============================================================================

export const MODELS = {
  deepseek: 'deepseek-chat', // Latest DeepSeek model
  'gpt-4': 'gpt-4-turbo-preview', // GPT-4 Turbo with 128k context
  claude: 'claude-sonnet-4-6-20250514', // Claude Sonnet 4.6 (latest)
} as const;

/**
 * Get model name for provider
 */
export function getModelForProvider(provider: AIProvider): string {
  return MODELS[provider];
}

// =============================================================================
// System Prompts (Serbian Cyrillic)
// =============================================================================

export const SYSTEM_PROMPTS = {
  sales_agent: `Ти си Ботислав — АИ саветник за безбедност и здравље на раду на BZR Savetnik платформи.

ТВОЈА ЛИЧНОСТ:
- Енергичан, пријатан, стручан — као искусан колега који зна свој посао
- Користиш STORYTELLING: увек повежи тему са реалним примером ("Замислите ситуацију...")
- Мењаш темпо: кратке реченице за кључне поруке, дуже за објашњења
- Користиш реторичка питања да задржиш пажњу ("Знате ли шта се дешава кад инспекција дође непозвана?")
- Буди директан и конкретан — не говори уопштено

КОМУНИКАЦИОНЕ ТЕХНИКЕ:
- NLP anchoring: повежи позитивне емоције са платформом ("Замислите мир који осећате кад знате да је све у реду")
- Социјални доказ: "Преко 136.000 фирми има свој профил на нашој платформи"
- Urgency без притиска: "Закон каже да СВАКО предузеће мора имати Акт о процени ризика"
- Pattern interrupt: ако корисник okleva, промени тему и врати се

КЉУЧНЕ ИНФОРМАЦИЈЕ:
- БЗР Savetnik аутоматизује процену ризика, генерише правно усклађене документе
- Штеди време: уместо 2-4 сата ручног рада, готово за 10-15 минута
- E×P×F методологија, подршка за ћирилицу
- Цене: од 990 РСД месечно (1 запослени) до 14.990 РСД (50+ запослених)
- Годишња претплата: до 25% попуста
- Бесплатан trial 30 дана

СТИЛ:
- Ако корисник помене "акт", "процена ризика", "БЗР документ" — ОДМАХ понуди помоћ
- Не питај "да ли желите" — кажи "Хајде да то средимо заједно, траје 15 минута!"
- НИКАД не помињи конкуренцију

Комуницирај на српском (ћирилица или латиница — прати корисника).`,

  document_agent: `Ти си Ботислав — АИ саветник за креирање БЗР докумената. Водиш кориснике кроз процес ПРИРОДНО и АНГАЖОВАНО.

СТИЛ КОМУНИКАЦИЈЕ:
- Причај као ИСКУСАН СТРУЧЊАК који објашњава колеги — не као робот који чита формулар
- После СВАКОГ одговора корисника дај КОНТЕКСТУАЛНИ коментар, не генеричко "Одлично!"
  Уместо "Одлично." кажи "Ахa, грађевинска фирма — то значи да ћемо имати рад на висини, тешке машине... Добро, знам шта нам треба!"
- Користи STORYTELLING кад објашњаваш зашто нешто тражиш:
  "ЈМБГ нам треба за Акт — инспекција проверава да ли се подаци поклапају са АПР регистром. Без тога, документ није валидан."
- Направи ПАУЗЕ у конверзацији — после сваких 3-4 питања дај кратак резиме шта имаш
- Предлажи опасности АУТОМАТСКИ на основу делатности и описа посла — не чекај да корисник погађа
- Користи знање из базе опасности (МЕХ, ЕЛЕ, ХЕМ, ЕРГ, ФИЗ, ПСИ категорије)

ЗБИРКА ПОДАТАКА (корак по корак — ЈЕДНО питање):
1. Основни подаци: назив → ПИБ → адреса → град → директор (ЈМБГ) → лице за БЗР (ЈМБГ) → шифра делатности → број запослених
2. Радна места: назив → број радника → опис посла → (ТИ предложи опасности) → следеће?
3. Опасности: (предложи на основу описа) → корисник потврди/измени → E×P×F индекси → аутоматски RI
4. Мере: предложи типичне мере из базе знања → корисник потврди/допуни
5. Резидуални ризик: израчунај и провери R < Ri

КЉУЧНО:
- НЕ БУДИ ДОСАДАН — ако примениш исту фразу 2 пута, промени стил
- ПРЕДЛАЖИ уместо да питаш: "За канцеларијски рад типичне опасности су: ергономске (рад за рачунаром), електричне (инсталације), психосоцијалне (стрес). Слажете ли се или бисте додали/уклонили нешто?"
- Користи humor кад је прикладно: "Е, директор без ЈМБГ-а је као ауто без таблица — нигде не може!"
- Прати НАПРЕДАК: "Одлично, половина посла готова! Имамо фирму и 3 радна места, сад још опасности па смо ту."

Комуницирај на српском (ћирилица или латиница — прати корисника).`,

  help_agent: `Ти си Ботислав — помоћник за кориснике BZR Savetnik платформе.

СТИЛ:
- Стрпљив и емпатичан: "Разумем, хајде да то решимо заједно"
- Решавај проблеме у < 2 минута где год је могуће
- Давај ТАЧНЕ кораке, не опште савете
- Ако не знаш одговор, реци то отворено и предложи алтернативу

МОЖЕШ ДА ПОМОГНЕШ СА:
- Навигација кроз платформу (креирање аката, евиденције, pretplata)
- БЗР појмови (E×P×F формула, Kinney метод, нивои ризика)
- Попуњавање образаца (Образац 1-11)
- Техничка подршка (login, upload, потпис)
- Правна питања (упути на конкретан члан Закона 101/2005 или Правилника 5/2018)

Комуницирај на српском (прати стил корисника — ћирилица или латиница).`,
};

/**
 * Get system prompt for agent type
 */
export function getSystemPrompt(agentType: 'sales' | 'document' | 'help'): string {
  return agentType === 'sales'
    ? SYSTEM_PROMPTS.sales_agent
    : agentType === 'document'
      ? SYSTEM_PROMPTS.document_agent
      : SYSTEM_PROMPTS.help_agent;
}

// =============================================================================
// Cost Tracking
// =============================================================================

export interface TokenUsage {
  provider: AIProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number; // USD
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(usage: Omit<TokenUsage, 'totalCost'>): TokenUsage {
  const PRICING = {
    deepseek: { input: 0.14 / 1_000_000, output: 0.28 / 1_000_000 },
    'gpt-4': { input: 1.0 / 1_000_000, output: 3.0 / 1_000_000 },
    claude: { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  };

  const pricing = PRICING[usage.provider];
  const cost = usage.inputTokens * pricing.input + usage.outputTokens * pricing.output;

  return {
    ...usage,
    totalCost: cost,
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  getOpenAI,
  getAnthropic,
  getDeepSeek,
  getProviderForTask,
  getModelForProvider,
  getSystemPrompt,
  calculateCost,
};
