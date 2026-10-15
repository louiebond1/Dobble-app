"use strict";
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");
class Store {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(path.join(dir, "draft2.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, status TEXT NOT NULL, image BLOB, usage TEXT);
 CREATE TABLE IF NOT EXISTS allowance(day TEXT PRIMARY KEY, images INTEGER DEFAULT 0, texts INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS plans(key TEXT PRIMARY KEY, plan TEXT NOT NULL);`);
  }
  save(g) {
    this.db
      .prepare("INSERT OR REPLACE INTO rooms VALUES(?,?)")
      .run(g.code, JSON.stringify(g));
  }
  load() {
    return this.db
      .prepare("SELECT state FROM rooms")
      .all()
      .map((r) => JSON.parse(r.state));
  }
  plan(key, value) {
    if (value)
      this.db
        .prepare("INSERT OR REPLACE INTO plans VALUES(?,?)")
        .run(key, JSON.stringify(value));
    else {
      const r = this.db.prepare("SELECT plan FROM plans WHERE key=?").get(key);
      return r ? JSON.parse(r.plan) : null;
    }
  }
  reserve(id, kind, max) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.job(id)) {
        this.db.exec("ROLLBACK");
        return false;
      }
      const day = new Date().toISOString().slice(0, 10);
      this.db
        .prepare("INSERT OR IGNORE INTO allowance(day) VALUES(?)")
        .run(day);
      const n = this.db
        .prepare(`SELECT ${kind} AS n FROM allowance WHERE day=?`)
        .get(day).n;
      if (n >= max)
        throw Error(
          "Today’s AI allowance is used up. Your collection is safe.",
        );
      this.db
        .prepare(`UPDATE allowance SET ${kind}=${kind}+1 WHERE day=?`)
        .run(day);
      this.db
        .prepare("INSERT INTO jobs(id,status) VALUES(?,?)")
        .run(id, "started");
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw e;
    }
  }
  job(id) {
    return this.db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
  }
  finish(id, status, image, usage) {
    this.db
      .prepare("UPDATE jobs SET status=?,image=?,usage=? WHERE id=?")
      .run(status, image || null, JSON.stringify(usage || {}), id);
  }
  close() {
    this.db.close();
  }
}
module.exports = { Store };
