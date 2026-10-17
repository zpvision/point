import { z } from "zod";
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const daysInMonth = (month: string) =>
  new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
export const planSchema = z
  .object({
    pointId: z.string().uuid(),
    month: monthSchema,
    workingDays: z.number().int().min(1).max(31),
    acceptPerDay: z.number().int().min(0).max(10000),
    issuePerDay: z.number().int().min(0).max(10000),
    storageSlots: z.number().int().min(1).max(100000),
    averageStorageDays: z.number().min(1).max(90),
  })
  .strict()
  .refine((v) => v.workingDays <= daysInMonth(v.month), {
    message: "Рабочих дней больше, чем дней в месяце",
  });
export type PointPlan = z.infer<typeof planSchema>;
export function capacity(p: PointPlan) {
  const accept = p.workingDays * p.acceptPerDay,
    issue = p.workingDays * p.issuePerDay,
    storage = Math.floor(
      (p.storageSlots * daysInMonth(p.month)) / p.averageStorageDays,
    );
  return {
    accept,
    issue,
    storage,
    recommended: Math.min(accept, issue, storage),
  };
}
export const eventSchema = z
  .object({
    id: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[a-zA-Z0-9:_-]+$/),
    pointId: z.string().uuid(),
    kind: z.enum(["issued", "paid"]),
    reference: z.string().trim().min(1).max(128),
    amountKopecks: z.number().int().min(1).max(100000000),
    occurredAt: z.string().datetime(),
  })
  .strict()
  .refine((e) => Date.parse(e.occurredAt) <= Date.now() + 60000, {
    message: "Будущая операция недопустима",
  });
export async function secretMatches(a: string, b: string) {
  const enc = new TextEncoder();
  const hashes = await Promise.all(
    [a, b].map((v) => crypto.subtle.digest("SHA-256", enc.encode(v))),
  );
  const left = new Uint8Array(hashes[0]),
    right = new Uint8Array(hashes[1]);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
