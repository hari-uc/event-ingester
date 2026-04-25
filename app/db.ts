import postgres from "postgres";
import { config } from "./config";

export const sql = postgres({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 10,
  idle_timeout: 30,
  types: {
    numeric: {
      to: 1700,
      from: [1700],
      serialize: (x: number | string) => String(x),
      parse: (x: string) => Number(x),
    },
  },
});

export type Sql = typeof sql;
