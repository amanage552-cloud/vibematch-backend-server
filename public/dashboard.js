// Dashboard dynamic rendering: fetch profiles and populate stories + feed
async function fetchProfiles() {
  try {
    const res = await fetch('/api/profiles');
    if (!res.ok) throw new Error('Failed to fetch profiles');
    return await res.json();
  } catch (err) {
    console.error(err);
    // return mock profiles when backend is unavailable
    return [{
      name: 'Ava', age: 26, match: 87,
      photo: '/assets/logo.svg',
      video: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      bio: 'Loves city sunsets and indie playlists.',
      interests: ['coffee','hikes','vinyl']
    }, {
      name: 'Liam', age: 29, match: 82,
      photo: '/assets/logo.svg', video: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', bio: '', interests: []
    }];
  }
}

function createStoryNode(profile) {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex-none w-20 text-center';
  const avatar = document.createElement('div');
  avatar.className = 'w-16 h-16 mx-auto rounded-full ring-2 ring-gray-900';
  avatar.style.backgroundImage = `linear-gradient(180deg, rgba(163,230,53,0.16), rgba(163,230,53,0)), url(${profile.photo})`;
  avatar.style.backgroundSize = 'cover';
  avatar.style.backgroundPosition = 'center';
  const label = document.createElement('div');
  label.className = 'text-xs mt-2 text-gray-300';
  label.textContent = profile.name;
  wrapper.appendChild(avatar);
  wrapper.appendChild(label);
  return wrapper;
}

function createProfileCard(profile) {
  const article = document.createElement('article');
  article.className = 'rounded-2xl overflow-hidden bg-gradient-to-b from-gray-900/60 to-black border border-gray-800 neon';
  const hero = document.createElement('div');
  hero.className = 'h-80 bg-cover bg-center relative overflow-hidden';
  if(profile.video){
    const v = document.createElement('video');
    v.src = profile.video; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
    v.className = 'w-full h-full object-cover';
    hero.appendChild(v);
  } else {
    hero.style.backgroundImage = `url('${profile.photo}')`;
  }

  const body = document.createElement('div');
  body.className = 'p-4 flex items-start justify-between';

  const left = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'flex items-center gap-3';
  const title = document.createElement('h3');
  title.className = 'text-lg font-bold';
  title.textContent = `${profile.name}, ${profile.age}`;
  const badge = document.createElement('span');
  badge.className = 'text-xs ml-2 px-3 py-1 rounded-full accent-pill text-xs';
  badge.textContent = `${profile.match}% Match`;
  meta.appendChild(title);
  meta.appendChild(badge);

  const bio = document.createElement('p');
  bio.className = 'text-sm text-gray-400 mt-2';
  bio.textContent = profile.bio || '';

  const interests = document.createElement('div');
  interests.className = 'flex gap-2 mt-3';
  (profile.interests || []).forEach((t) => {
    const span = document.createElement('span');
    span.className = 'text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-200';
    span.textContent = t;
    interests.appendChild(span);
  });

  left.appendChild(meta);
  left.appendChild(bio);
  left.appendChild(interests);

  const actions = document.createElement('div');
  actions.className = 'flex flex-col gap-2';
  const chatBtn = document.createElement('button');
  chatBtn.className = 'px-4 py-2 rounded-lg bg-green-400 text-black font-bold glow-hover';
  chatBtn.textContent = 'Chat';
  chatBtn.addEventListener('click', () => alert(`Start chat with ${profile.name}`));
  const viewBtn = document.createElement('button');
  viewBtn.className = 'px-4 py-2 rounded-lg bg-transparent border border-gray-700 text-gray-300';
  viewBtn.textContent = 'View';
  viewBtn.addEventListener('click', () => alert(`View profile ${profile.name}`));
  actions.appendChild(chatBtn);
  actions.appendChild(viewBtn);

  body.appendChild(left);
  body.appendChild(actions);
  article.appendChild(hero);
  article.appendChild(body);
  return article;
}

document.addEventListener('DOMContentLoaded', async () => {
  // wire simple click prevention for brand
  document.querySelectorAll('.brand, .glow-hover').forEach((el) => el.addEventListener('click', (e) => e.preventDefault()));

  const profiles = await fetchProfiles();
  const storiesRow = document.getElementById('storiesRow');
  const feedGrid = document.getElementById('feedGrid');
  const profilePlayer = document.getElementById('profilePlayer');
  const profileName = document.getElementById('profileName');
  const profileAge = document.getElementById('profileAge');
  const profileMatch = document.getElementById('profileMatch');

  if (storiesRow) {
    profiles.slice(0, 8).forEach((p) => storiesRow.appendChild(createStoryNode(p)));
  }

  if (feedGrid) {
    profiles.forEach((p) => feedGrid.appendChild(createProfileCard(p)));
  }

  // Create Post modal wiring
  const createPostBtn = document.getElementById('createPostBtn');
  const createPostModal = document.getElementById('createPostModal');
  const postImageInput = document.getElementById('postImageInput');
  const postCaption = document.getElementById('postCaption');
  const cancelPost = document.getElementById('cancelPost');
  const submitPost = document.getElementById('submitPost');

  createPostBtn && createPostBtn.addEventListener('click', ()=>{ createPostModal.style.display='flex'; });
  cancelPost && cancelPost.addEventListener('click', ()=>{ createPostModal.style.display='none'; });

  submitPost && submitPost.addEventListener('click', async ()=>{
    const f = postImageInput.files[0]; if(!f){ alert('Please select an image'); return; }
    const fd = new FormData(); fd.append('image', f); fd.append('caption', postCaption.value||'');
    const token = localStorage.getItem('vibematch_token');
    const res = await fetch('/api/posts', { method:'POST', headers: { ...(token?{ Authorization: 'Bearer '+token }: {}) }, body: fd });
    if(res.ok){ alert('Posted'); createPostModal.style.display='none'; postCaption.value=''; postImageInput.value=''; const newPosts = await fetch('/api/posts').then(r=>r.ok?r.json():[]); if(feedGrid){ feedGrid.insertBefore(createProfileCard({ name:'You', age:'', match:'—', photo:newPosts[0]?.image_path || '', bio: newPosts[0]?.caption || '' }), feedGrid.firstChild); } } else { const j = await res.json().catch(()=>({})); alert('Post failed: '+(j.error||res.statusText)); }
  });

  // set center profile player to first profile's video (fallback to mock)
  if(profiles && profiles.length>0 && profilePlayer){
    const p = profiles[0];
    if(p.video){ profilePlayer.src = p.video; profilePlayer.muted=true; profilePlayer.loop=true; profilePlayer.autoplay=true; profilePlayer.playsInline=true; profilePlayer.play().catch(()=>{}); }
    if(profileName) profileName.textContent = p.name || 'Guest';
    if(profileAge) profileAge.textContent = p.age || '—';
    if(profileMatch) profileMatch.textContent = (p.match||'—') + '%';
  }
});
