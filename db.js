const { Pool } = require('pg');
const fs = require('fs');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn('No DATABASE_URL provided — Postgres required for DB migration');
}

let pool = null;

async function init() {
  if (!DATABASE_URL) return;
  pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
  await ensureTables();
}

async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE,
        phone TEXT UNIQUE,
        name TEXT,
        password TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS stories (
        id UUID PRIMARY KEY,
        user_id UUID REFERENCES users(id),
        file_path TEXT,
        caption TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS likes (
        id UUID PRIMARY KEY,
        from_user UUID REFERENCES users(id),
        to_user UUID REFERENCES users(id),
        created_at BIGINT
      );
    `);
  } finally {
    client.release();
  }
}

async function addUser(user){
  if (!pool) throw new Error('DB not configured');
  const q = 'INSERT INTO users(id,email,phone,name,password,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,phone,name';
  const r = await pool.query(q, [user.id, user.email || null, user.phone || null, user.name, user.password || null, user.created_at]);
  return r.rows[0];
}

async function findUserByEmail(email){
  if (!pool) throw new Error('DB not configured');
  const r = await pool.query('SELECT id,email,phone,name,password,created_at FROM users WHERE email=$1 LIMIT 1', [email]);
  return r.rows[0];
}

async function findUserByPhone(phone){
  if (!pool) throw new Error('DB not configured');
  const r = await pool.query('SELECT id,email,phone,name,password,created_at FROM users WHERE phone=$1 LIMIT 1', [phone]);
  return r.rows[0];
}

async function findUserById(id){
  if (!pool) throw new Error('DB not configured');
  const r = await pool.query('SELECT id,email,name,created_at FROM users WHERE id=$1 LIMIT 1', [id]);
  return r.rows[0];
}

async function addStory(story){
  if (!pool) throw new Error('DB not configured');
  const q = 'INSERT INTO stories(id,user_id,file_path,caption,created_at) VALUES($1,$2,$3,$4,$5)';
  await pool.query(q, [story.id, story.user_id, story.file_path, story.caption, story.created_at]);
}

async function getRecentStories(){
  if (!pool) throw new Error('DB not configured');
  const cutoff = Date.now() - 24*60*60*1000;
  const r = await pool.query('SELECT id,user_id,file_path,caption,created_at FROM stories WHERE created_at > $1 ORDER BY created_at DESC', [cutoff]);
  return r.rows;
}

async function purgeOldStories(){
  if (!pool) throw new Error('DB not configured');
  const cutoff = Date.now() - 24*60*60*1000;
  await pool.query('DELETE FROM stories WHERE created_at <= $1', [cutoff]);
}

async function addLike(like){
  if (!pool) throw new Error('DB not configured');
  await pool.query('INSERT INTO likes(id,from_user,to_user,created_at) VALUES($1,$2,$3,$4)', [like.id, like.from_user, like.to_user, like.created_at]);
}

async function hasLike(from, to){
  if (!pool) throw new Error('DB not configured');
  const r = await pool.query('SELECT id FROM likes WHERE from_user=$1 AND to_user=$2 LIMIT 1', [from, to]);
  return r.rows[0];
}

async function purgeOldLikes(){
  if (!pool) throw new Error('DB not configured');
  const cutoff = Date.now() - 24*60*60*1000;
  await pool.query('DELETE FROM likes WHERE created_at <= $1', [cutoff]);
}

module.exports = { init, addUser, findUserByEmail, findUserById, addStory, getRecentStories, purgeOldStories, addLike, hasLike, purgeOldLikes };
