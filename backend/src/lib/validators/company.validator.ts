import { z } from 'zod';

/**
 * PIB (Serbian Tax ID) Validator with Modulo-11 Checksum
 *
 * Per FR-043b requirement in spec.md
 */
function validatePIB(pib: string): boolean {
  if (!/^\d{9}$/.test(pib)) return false;

  const digits = pib.split('').map(Number);
  const checksum =
    (11 -
      ((7 * digits[0]! +
        6 * digits[1]! +
        5 * digits[2]! +
        4 * digits[3]! +
        3 * digits[4]! +
        2 * digits[5]! +
        7 * digits[6]! +
        6 * digits[7]!) %
        11)) %
    11;

  return checksum === digits[8];
}

/**
 * Company Validation Schema
 *
 * Maps to FR-001 requirements and companies.contract.md
 */
export const createCompanySchema = z.object({
  // Required fields
  name: z
    .string()
    .min(2, 'Назив предузећа мора имати најмање 2 карактера')
    .max(255, 'Назив предузећа може имати максимално 255 карактера'),

  pib: z
    .string()
    .length(9, 'PIB мора имати тачно 9 цифара')
    .regex(/^\d{9}$/, 'PIB мора садржати само цифре')
    .refine(validatePIB, 'Неисправан PIB - провера modulo-11 није прошла'),

  activityCode: z
    .string()
    .length(4, 'Шифра делатности мора имати тачно 4 цифре')
    .regex(/^\d{4}$/, 'Шифра делатности мора садржати само цифре'),

  address: z
    .string()
    .min(5, 'Адреса мора имати најмање 5 карактера')
    .max(500, 'Адреса може имати максимално 500 карактера'),

  director: z
    .string()
    .min(2, 'Име директора мора имати најмање 2 карактера')
    .max(255, 'Име директора може имати максимално 255 карактера'),

  bzrResponsiblePerson: z
    .string()
    .min(2, 'Име лица за БЗР мора имати најмање 2 карактера')
    .max(255, 'Име лица за БЗР може имати максимално 255 карактера'),

  // Optional fields
  maticniBroj: z
    .string()
    .length(8, 'Матични број мора имати тачно 8 цифара')
    .regex(/^\d{8}$/, 'Матични број мора садржати само цифре')
    .optional(),

  activityDescription: z.string().max(1000).optional(),

  city: z.string().max(100).optional(),

  postalCode: z
    .string()
    .max(10)
    .regex(/^\d+$/, 'Поштански број мора садржати само цифре')
    .optional(),

  phone: z
    .string()
    .max(50)
    .regex(/^[0-9\s\-+()]+$/, 'Неисправан формат телефона')
    .optional(),

  email: z.string().email('Неисправан формат email адресе').max(255).optional(),

  directorJmbg: z
    .string()
    .length(13, 'JMBG мора имати тачно 13 цифара')
    .regex(/^\d{13}$/, 'JMBG мора садржати само цифре')
    .optional(),

  bzrResponsibleJmbg: z
    .string()
    .length(13, 'JMBG мора имати тачно 13 цифара')
    .regex(/^\d{13}$/, 'JMBG мора садржати само цифре')
    .optional(),

  employeeCount: z.string().max(10).optional(),

  organizationChart: z.string().url('Неисправан URL').optional().or(z.literal('')),
});

export const updateCompanySchema = createCompanySchema.partial().extend({
  id: z.number().int().positive(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
