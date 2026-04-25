import {
  SQSClient,
  SendMessageBatchCommand,
  ReceiveMessageCommand,
  DeleteMessageBatchCommand,
  type Message,
  type SendMessageBatchResultEntry,
  type BatchResultErrorEntry,
} from "@aws-sdk/client-sqs";

import { config } from "./config";

const client = new SQSClient({
  region: config.awsRegion,
  ...(config.awsAccessKeyId && config.awsSecretAccessKey
    ? {
        credentials: {
          accessKeyId: config.awsAccessKeyId,
          secretAccessKey: config.awsSecretAccessKey,
        },
      }
    : {}),
});

type AnyEvent = {
  event_id: string;
  transaction_id: string;
  [k: string]: unknown;
};

export async function sendBatch(events: AnyEvent[]): Promise<{
  successful: SendMessageBatchResultEntry[];
  failed: BatchResultErrorEntry[];
}> {
  if (events.length === 0) return { successful: [], failed: [] };
  if (events.length > 10) {
    throw new Error("sendBatch supports max 10 entries; chunk before calling");
  }
  const out = await client.send(
    new SendMessageBatchCommand({
      QueueUrl: config.queueUrl,
      Entries: events.map((e, i) => ({
        Id: String(i),
        MessageBody: JSON.stringify(e),
        MessageGroupId: String(e.transaction_id),
        MessageDeduplicationId: String(e.event_id),
      })),
    }),
  );
  return { successful: out.Successful ?? [], failed: out.Failed ?? [] };
}

export async function receive(
  maxMessages: number,
  waitSeconds: number,
  visibilityTimeout: number,
): Promise<Message[]> {
  const out = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: config.queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitSeconds,
      VisibilityTimeout: visibilityTimeout,
    }),
  );
  return out.Messages ?? [];
}

export async function deleteBatch(
  entries: { Id: string; ReceiptHandle: string }[],
): Promise<void> {
  if (entries.length === 0) return;
  await client.send(
    new DeleteMessageBatchCommand({
      QueueUrl: config.queueUrl,
      Entries: entries,
    }),
  );
}
