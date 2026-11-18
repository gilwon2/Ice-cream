import { z } from "zod";
import rawPolicies from "@/data/policies.json";
import { REGIONS } from "@/lib/profile";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const eligibilitySchema = z.object({
  age: z.object({ min: z.number().int(), max: z.number().int() }),
  regions: z.array(z.enum(REGIONS)).optional(),
  minResidencyMonths: z.number().int().optional(),
  employment: z.array(z.enum(["unemployed", "employed", "self_employed", "student"])).optional(),
  housing: z.array(z.enum(["monthly_rent", "jeonse", "with_parents", "owned"])).optional(),
  maxMonthlyRent: z.number().optional(),
  maxDeposit: z.number().optional(),
  maxMedianIncomePercent: z.number().optional(),
  maxPersonalAnnualIncome: z.number().optional(),
  requiresIndependentHousehold: z.boolean().optional(),
  requiresResidentRegistration: z.boolean().optional(),
  noHomeOwnership: z.boolean().optional(),
  excludesPolicies: z.array(z.string()).optional(),
});

const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  agency: z.string(),
  category: z.string(),
  summary: z.string(),
  benefit: z.string(),
  eligibility: eligibilitySchema,
  window: z.discriminatedUnion("type", [
    z.object({ type: z.literal("always") }),
    z.object({ type: z.literal("period"), start: isoDate, end: isoDate }),
  ]),
  nextRoundNote: z.string().optional(),
  documents: z.array(
    z.object({ id: z.string(), name: z.string(), issuer: z.string(), howTo: z.string() }),
  ),
  applyUrl: z.string(),
});

export type Policy = z.infer<typeof policySchema>;
export type PolicyDocument = Policy["documents"][number];

export const policies: Policy[] = z.array(policySchema).parse(rawPolicies);

export function getPolicy(id: string): Policy | undefined {
  return policies.find((policy) => policy.id === id);
}
