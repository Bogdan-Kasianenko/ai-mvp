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
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("DELETE FROM attempts WHERE time<?").run(
          Date.now() - 24 * 60 * 60 * 1000,
        );
        const count = db
          .prepare(
            "SELECT count(*) AS n FROM attempts WHERE bucket=? AND time>?",
          )
          .get(bucket, Date.now() - windowMs).n;
        if (count >= limit) {
          db.exec("COMMIT");
          return false;
        }
        db.prepare("INSERT INTO attempts VALUES(?,?)").run(bucket, Date.now());
        db.exec("COMMIT");
        return true;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    cleanup() {
      db.prepare("DELETE FROM sessions WHERE expires<? AND locked_until<?").run(
        Date.now(),
        Date.now(),
      );
    },
    close() {
      db.close();
    },
  };
}
