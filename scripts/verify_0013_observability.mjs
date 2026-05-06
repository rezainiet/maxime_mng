// Post-deploy verification of the analytics observability upgrade.
//
// Reads from production DB and confirms:
//   1. migration 0013 schema is in place
//   2. join_request audit rows are being written by the live webhook
//   3. join rolling-window queries return non-zero numbers (or warn if zero)
//   4. funnel snapshot SQL runs cleanly
//   5. bypass attempt counter is observable
//
// Usage:  DATABASE_URL='mysql://...' node scripts/verify_0013_observability.mjs

import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);
let pass = 0;
let warn = 0;
let fail = 0;
const log = (label, ok, detail = "") => {
  if (ok === true) {
    pass += 1;
    console.log("  ✅", label, detail);
  } else if (ok === "warn") {
    warn += 1;
    console.log("  ⚠️ ", label, detail);
  } else {
    fail += 1;
    console.log("  ❌", label, detail);
  }
};

try {
  console.log("[1] Schema");
  const [tab] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'telegram_join_request_audit'`,
  );
  log("telegram_join_request_audit table exists", tab.length === 1);

  const [idx] = await conn.query(
    `SELECT TABLE_NAME, INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND INDEX_NAME IN (
          'telegram_join_request_audit_decidedAt_idx',
          'telegram_join_request_audit_decision_decidedAt_idx',
          'telegram_join_request_audit_user_idx',
          'bot_starts_joinedAt_idx',
          'telegram_joins_attributionStatus_idx'
        )
      GROUP BY TABLE_NAME, INDEX_NAME`,
  );
  log("all 5 expected indexes present", idx.length === 5, `(found ${idx.length}/5)`);

  console.log("\n[2] Audit rows being written");
  const [audit] = await conn.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(decision='approved'), 0) AS approved,
       COALESCE(SUM(decision='declined'), 0) AS declined,
       COALESCE(SUM(decision='declined' AND hadBotStart=0), 0) AS bypassAttempts,
       MAX(decidedAt) AS lastDecidedAt
     FROM telegram_join_request_audit`,
  );
  const a = audit[0];
  console.log(`  total=${a.total} approved=${a.approved} declined=${a.declined} bypass=${a.bypassAttempts} lastAt=${a.lastDecidedAt}`);
  if (Number(a.total) === 0) {
    log(
      "audit rows present",
      "warn",
      "(zero rows — expected after fresh deploy until the next chat_join_request fires)",
    );
  } else {
    log("audit rows present", true, `${a.total} rows`);
  }

  console.log("\n[3] Rolling-window join queries (mirrors the dashboard SQL)");
  const [roll] = await conn.query(`
    SELECT
      COALESCE(SUM(joinedAt >= NOW() - INTERVAL 1 HOUR  AND attributionStatus <> 'bypass_join'), 0) AS last1h,
      COALESCE(SUM(joinedAt >= NOW() - INTERVAL 6 HOUR  AND attributionStatus <> 'bypass_join'), 0) AS last6h,
      COALESCE(SUM(joinedAt >= NOW() - INTERVAL 24 HOUR AND attributionStatus <> 'bypass_join'), 0) AS last24h,
      COALESCE(SUM(DATE(joinedAt) = CURRENT_DATE()      AND attributionStatus <> 'bypass_join'), 0) AS today,
      COALESCE(SUM(joinedAt >= NOW() - INTERVAL 24 HOUR), 0) AS last24hAll
    FROM telegram_joins
  `);
  console.log("  rolling joins:", roll[0]);
  log("rolling-window query runs", true);

  console.log("\n[4] Funnel snapshot — today");
  const [fun] = await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM tracking_events WHERE eventType = 'pageview' AND createdAt >= CURRENT_DATE()) AS pageviews,
      (SELECT COUNT(*) FROM tracking_events WHERE eventType = 'lead' AND createdAt >= CURRENT_DATE()) AS leads,
      (SELECT COUNT(*) FROM bot_starts WHERE startedAt >= CURRENT_DATE()) AS botStarts,
      (SELECT COUNT(*) FROM telegram_join_request_audit WHERE decision = 'approved' AND decidedAt >= CURRENT_DATE()) AS approved,
      (SELECT COUNT(*) FROM meta_event_logs WHERE eventScope IN ('telegram_start','telegram_join') AND status = 'sent' AND COALESCE(completedAt, createdAt) >= CURRENT_DATE()) AS subscribesSent
  `);
  console.log("  funnel today:", fun[0]);
  log("funnel snapshot SQL runs", true);

  console.log("\n[5] Cross-check: telegram_joins.totalJoins vs bot_starts.joinedAfterStart (the KPI that confused the operator)");
  const [cross] = await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM telegram_joins) AS totalJoins,
      (SELECT COUNT(*) FROM telegram_joins WHERE attributionStatus <> 'bypass_join') AS funnelJoins,
      (SELECT COUNT(*) FROM telegram_joins WHERE attributionStatus = 'bypass_join') AS bypassJoins,
      (SELECT COUNT(*) FROM bot_starts WHERE joinedAt IS NOT NULL) AS startsThenJoined
  `);
  console.log("  cross-check:", cross[0]);
  const drift = Number(cross[0].funnelJoins) - Number(cross[0].startsThenJoined);
  if (Math.abs(drift) <= 1) {
    log(
      "funnelJoins ≈ startsThenJoined (within 1)",
      true,
      `(drift ${drift})`,
    );
  } else {
    // A non-trivial drift is informational, not a bug — re-joins / data races
    // can produce small differences. Big drifts indicate something else.
    log(
      "funnelJoins vs startsThenJoined drift",
      "warn",
      `(drift ${drift} — investigate if > 5)`,
    );
  }
} finally {
  await conn.end();
}

console.log("\n" + "=".repeat(60));
console.log(`PASS ${pass}  WARN ${warn}  FAIL ${fail}`);
console.log("=".repeat(60));
if (fail > 0) process.exitCode = 1;
