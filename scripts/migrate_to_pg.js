const fs = require('fs');
const path = require('path');
const db = require('../db');

async function loadJson(p){ try{ return JSON.parse(fs.readFileSync(p,'utf8')||'[]'); }catch(e){ return []; } }

async function run(){
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set. Aborting migration.'); process.exit(1); }
  await db.init();
  const dataDir = path.join(__dirname,'..','data');
  const usersFile = path.join(dataDir,'users.json');
  const storiesFile = path.join(dataDir,'stories.json');
  const likesFile = path.join(dataDir,'likes.json');

  const users = await loadJson(usersFile);
  const stories = await loadJson(storiesFile);
  const likes = await loadJson(likesFile);

  console.log('Found', users.length, 'users', stories.length, 'stories', likes.length, 'likes');

  for (const u of users){
    try{ await db.addUser(u); }catch(e){ console.warn('addUser skipped', u.id, e.message); }
  }
  for (const s of stories){
    try{ await db.addStory(s); }catch(e){ console.warn('addStory skipped', s.id, e.message); }
  }
  for (const l of likes){
    try{ await db.addLike(l); }catch(e){ console.warn('addLike skipped', l.id, e.message); }
  }

  // backup JSON files
  const backupDir = path.join(dataDir, 'backup_'+Date.now());
  fs.mkdirSync(backupDir, { recursive: true });
  [usersFile, storiesFile, likesFile].forEach(f=>{ if(fs.existsSync(f)) fs.renameSync(f, path.join(backupDir, path.basename(f))); });

  console.log('Migration complete. Originals moved to', backupDir);
}

run().catch(err=>{ console.error('Migration failed', err); process.exit(1); });
