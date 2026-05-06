// One-shot migration runner for 0013_join_request_audit.sql.
//
// Idempotent: re-running is safe — each statement is wrapped in a try/catch
// that swallows the well-known "already exists" errors (1050 = table exists,
// 1061 = duplicate key/index). Anything else aborts the script.
//
// Usage:  DATABASE_URL='mysql://user:pass@host:port/db' node scripts/apply_0013_migration.mjs

import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sqlPath = resolve(import.meta.dirname, "../drizzle/0013_join_request_audit.sql");
const fileSql = readFileSync(sqlPath, "utf8");

// Drizzle separates DDL statements with `--> statement-breakpoint`. Split,
// trim, and drop the empty tail so each piece executes independently.
const statements = fileSql
  .split(/-->\s*statement-breakpoint/g)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  try {
    console.log("Pre-flight: looking for telegram_join_request_audit…");
    const [pre] = await conn.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'telegram_join_request_audit'`,
    );
    console.log(
      pre.length
        ? "  table already exists — index creation will be retried idempotently."
        : "  table does not exist — will create.",
    );

    let executed = 0;
    let skipped = 0;
    for (const stmt of statements) {
      const head = stmt.split("\n")[0].slice(0, 80);
      try {
        await conn.query(stmt);
        executed += 1;
        console.log(`  ✅ ${head}`);
      } catch (error) {
        const code = error?.errno;
        // 1050 = ER_TABLE_EXISTS_ERROR, 1061 = ER_DUP_KEYNAME
        if (code === 1050 || code === 1061) {
          skipped += 1;
          console.log(`  ⏭  ${head}  (already present, errno ${code})`);
          continue;
        }
        console.error(`  ❌ ${head}\n     ${error.message}`);
        throw error;
      }
    }

    console.log(`\nApplied ${executed} statements, skipped ${skipped}.`);

    console.log("\nPost-flight verification:");
    const [tableCheck] = await conn.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'telegram_join_request_audit'`,
    );
    if (tableCheck.length !== 1) {
      throw new Error("telegram_join_request_audit not present after migration");
    }
    console.log("  ✅ telegram_join_request_audit exists");

    const expectedIndexes = [
      ["telegram_join_request_audit", "telegram_join_request_audit_decidedAt_idx"],
      ["telegram_join_request_audit", "telegram_join_request_audit_decision_decidedAt_idx"],
      ["telegram_join_request_audit", "telegram_join_request_audit_user_idx"],
      ["bot_starts", "bot_starts_joinedAt_idx"],
      ["telegram_joins", "telegram_joins_attributionStatus_idx"],
    ];
    for (const [table, indexName] of expectedIndexes) {
      const [rows] = await conn.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND INDEX_NAME = ?
          LIMIT 1`,
        [table, indexName],
      );
      if (!rows.length) {
        throw new Error(`Missing index ${table}.${indexName}`);
      }
      console.log(`  ✅ index ${table}.${indexName}`);
    }

    const [shape] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'telegram_join_request_audit'
        ORDER BY ORDINAL_POSITION`,
    );
    console.log("\nFinal column shape:");
    console.table(shape);

    console.log("\nOK — migration 0013 verified.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
