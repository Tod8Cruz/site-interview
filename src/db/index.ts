import "server-only";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

function isLocal(url: string) {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // 로컬 Postgres는 Neon 드라이버(WebSocket 프록시 필요)로 붙을 수 없어 node-postgres를 쓴다.
  // 두 드라이버의 쿼리 빌더 API는 같다.
  if (isLocal(url)) return drizzlePg(new PgPool({ connectionString: url }), { schema });
  return drizzleNeon(new NeonPool({ connectionString: url }), { schema }) as unknown as Db;
}

const globalForDb = globalThis as unknown as { db?: Db };
export const db = globalForDb.db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
