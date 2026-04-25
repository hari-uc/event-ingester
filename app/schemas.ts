import { z } from "zod";

export const EventType = z.enum([
  "payment_initiated",
  "payment_processed",
  "payment_failed",
  "settled",
]);
export type EventType = z.infer<typeof EventType>;

export const EventIn = z.object({
  event_id: z.string().uuid(),
  event_type: EventType,
  transaction_id: z.string().uuid(),
  merchant_id: z.string().min(1),
  merchant_name: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  timestamp: z.string().datetime({ offset: true }),
});
export type EventIn = z.infer<typeof EventIn>;

export const EventIngest = z
  .object({
    event_id: z.string().min(1),
    transaction_id: z.string().min(1),
  })
  .passthrough();
export type EventIngest = z.infer<typeof EventIngest>;

export const EventIngestBody = z.union([EventIngest, z.array(EventIngest)]);
