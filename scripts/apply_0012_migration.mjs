// One-shot migration runner for 0012_personal_invite_link.sql.
// Usage: DATABASE_URL=... node scripts/apply_0012_migration.mjs

import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sqlPath = resolve(import.meta.dirname, "../drizzle/0012_personal_invite_link.sql");
const sql = readFileSync(sqlPath, "utf8");

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  try {
    console.log("Pre-flight: inspecting bot_starts schema...");
    const [pre] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'bot_starts'
          AND COLUMN_NAME IN ('personalInviteLink','personalInviteLinkExpiresAt')
        ORDER BY COLUMN_NAME`
    );
    console.log("Pre-flight columns present:", pre);

    if (pre.length === 2) {
      console.log("Both columns already exist. Skipping ALTER.");
    } else {
      console.log("Applying migration:");
      console.log(sql);
      // mysql2 multipleStatements is off by default, but the migration is one
      // logical ALTER with two ADD COLUMN clauses — runs in a single statement.
      const [result] = await conn.query(sql);
      console.log("ALTER result:", result);
    }

    console.log("Post-flight: inspecting bot_starts schema...");
    const [post] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'bot_starts'
          AND COLUMN_NAME IN ('personalInviteLink','personalInviteLinkExpiresAt')
        ORDER BY COLUMN_NAME`
    );
    console.log("Post-flight columns:", post);

    if (post.length !== 2) {
      throw new Error("Verification failed: expected 2 columns to exist after migration");
    }

    console.log("OK — migration verified.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
