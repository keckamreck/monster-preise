// Test-Adapter: führt Queries über psql gegen eine lokale Postgres aus (nur für Tests).
import { execFileSync } from "node:child_process";
const lit = (v) => v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const env = process.env;
export function makeQ(conn = { host: env.PGHOST || "/tmp/claude-0/pg", port: env.PGPORT || "5499", user: env.PGUSER || "postgres", db: env.PGDATABASE || "postgres" }) {
  return async (text, params = []) => {
    const sql = text.replace(/\$(\d+)/g, (_, i) => lit(params[Number(i) - 1]));
    const isSelect = /^\s*select/i.test(sql);
    const wrapped = isSelect ? `SELECT coalesce(json_agg(t), '[]') FROM (${sql}) t` : sql;
    const out = execFileSync("psql", ["-h", conn.host, "-p", conn.port, "-U", conn.user, "-d", conn.db, "-At", "-v", "ON_ERROR_STOP=1", "-c", wrapped], { encoding: "utf8" });
    return isSelect ? JSON.parse(out.trim() || "[]") : [];
  };
}
