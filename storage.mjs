import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function createRepository(path = ":memory:") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL, lease TEXT, locked_until INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(bucket TEXT NOT NULL, time INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS attempts_time ON attempts(time);`);
    let nextEmptyMigrationAt = Infinity;

  function migrateEmptySessions() {
    db.exec("BEGIN IMMEDIATE");

    try {
      const now = Date.now();
      const emptyTtl = 5 * 60 * 1000;
      const previousTtl = 24 * 60 * 60 * 1000;
      let retryAt = Infinity;

      const rows = db.prepare(
        "SELECT id,data,expires,locked_until FROM sessions",
      ).all();

      const update = db.prepare(
        "UPDATE sessions SET data=?,expires=? WHERE id=?",
      );

      for (const row of rows) {
        let session;

        try {
          session = JSON.parse(row.data);
        } catch {
          continue;
        }

        if (
          !session ||
          !Array.isArray(session.history) ||
          !Number.isFinite(row.expires)
        ) {
          continue;
        }

        if (
          session.history.some(entry => entry?.role === "user") ||
          session.lastDelivery ||
          session.pendingRequest
        ) {
          continue;
        }

        if (row.locked_until > now) {
          retryAt = Math.min(retryAt, row.locked_until);
          continue;
        }

        const legacyDeadline = row.expires > now + emptyTtl
          ? row.expires - previousTtl + emptyTtl
          : row.expires;

        const deadline = Math.min(
          row.expires,
          now + emptyTtl,
          Number.isFinite(session.emptyExpiresAt)
            ? session.emptyExpiresAt
            : legacyDeadline,
        );

        if (
          session.emptyExpiresAt === deadline &&
          session.expiresAt === deadline &&
          row.expires === deadline
        ) {
          continue;
        }

        session.emptyExpiresAt = deadline;
        session.expiresAt = deadline;

        update.run(JSON.stringify(session), deadline, row.id);
      }

      db.prepare(
        "DELETE FROM sessions WHERE expires<=? AND locked_until<=?",
      ).run(now, now);

      db.exec("COMMIT");
      nextEmptyMigrationAt = retryAt;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  try {
    migrateEmptySessions();
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    load(id) {
      const row = db
        .prepare("SELECT data FROM sessions WHERE id=? AND expires>?")
        .get(id, Date.now());
      return row ? JSON.parse(row.data) : null;
    },
    save(session) {
      const { busy, ...data } = session;
      db.prepare(
        "INSERT INTO sessions(id,data,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,expires=excluded.expires",
      ).run(session.id, JSON.stringify(data), session.expiresAt);
    },
    lock(id, owner) {
      return (
        db
          .prepare(
            "UPDATE sessions SET lease=?,locked_until=? WHERE id=? AND (lease IS NULL OR locked_until<?)",
          )
          .run(owner, Date.now() + 120000, id, Date.now()).changes === 1
      );
    },
    activeCount() {
      return db
        .prepare("SELECT count(*) AS n FROM sessions WHERE locked_until>?")
        .get(Date.now()).n;
    },
    sessionCount() {
      return db.prepare("SELECT count(*) AS n FROM sessions").get().n;
    },
    unlock(id, owner) {
      db.prepare(
        "UPDATE sessions SET lease=NULL,locked_until=0 WHERE id=? AND lease=?",
      ).run(id, owner);
    },
    delivery(id) {
      const row = db.prepare("SELECT * FROM deliveries WHERE id=?").get(id);
      return row ? { ...row, data: JSON.parse(row.data) } : null;
    },
    reserve(id, sessionId, data) {
      return (
        db
          .prepare("INSERT OR IGNORE INTO deliveries VALUES(?,?,'pending',?,?)")
          .run(id, sessionId, JSON.stringify(data), Date.now()).changes === 1
      );
    },
    finish(id, status) {
      db.prepare("UPDATE deliveries SET status=?,updated=? WHERE id=?").run(
        status,
        Date.now(),
        id,
      );
    },
    retryFailed(id) {
      return (
        db
          .prepare(
            "UPDATE deliveries SET status='pending',updated=? WHERE id=? AND status='failed'",
          )
          .run(Date.now(), id).changes === 1
      );
    },
        allow(bucket, limit, windowMs) {
      return this.allowMany([{ bucket, limit, windowMs }]);
    },

    allowMany(limits) {
      db.exec("BEGIN IMMEDIATE");

      try {
        const now = Date.now();

        db.prepare("DELETE FROM attempts WHERE time<?").run(
          now - 24 * 60 * 60 * 1000,
        );

        const countAttempts = db.prepare(
          "SELECT count(*) AS n FROM attempts WHERE bucket=? AND time>?",
        );

        for (const { bucket, limit, windowMs } of limits) {
          const count = countAttempts.get(
            bucket,
            now - windowMs,
          ).n;

          if (count >= limit) {
            db.exec("COMMIT");
            return false;
          }
        }

        const insert = db.prepare(
          "INSERT INTO attempts VALUES(?,?)",
        );

        for (const bucket of new Set(
          limits.map(rule => rule.bucket)
        )) {
          insert.run(bucket, now);
        }

        db.exec("COMMIT");
        return true;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
        cleanup() {
      if (Date.now() >= nextEmptyMigrationAt) {
        migrateEmptySessions();
      }

      db.prepare(
        "DELETE FROM sessions WHERE expires<=? AND locked_until<=?",
      ).run(
        Date.now(),
        Date.now(),
      );
    },
    close() {
      db.close();
    },
  };
}
