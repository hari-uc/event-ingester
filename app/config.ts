const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

export const config = {
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: num(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME ?? "event-ingester",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
  },
  awsRegion: process.env.AWS_REGION ?? "ap-south-1",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  queueUrl: process.env.INGESTER_FIFO_QUEUE_URL ?? "",
  port: num(process.env.PORT, 8000),
  worker: {
    batchSize: num(process.env.WORKER_BATCH_SIZE, 10),
    waitSeconds: num(process.env.WORKER_WAIT_SECONDS, 20),
    visibilityTimeout: num(process.env.WORKER_VISIBILITY_TIMEOUT, 60),
  },
} as const;
