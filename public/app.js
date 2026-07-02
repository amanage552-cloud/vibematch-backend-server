// Main app logic: stories slider, central profile player, and auth placeholders
document.addEventListener('DOMContentLoaded', async () => {
  const storiesRow = document.getElementById('storiesRow');
  const profilePlayer = document.getElementById('profilePlayer');
  const profileName = document.getElementById('profileName');
  const profileAge = document.getElementById('profileAge');
  const profileMatch = document.getElementById('profileMatch');
  const loginOverlay = document.getElementById('loginOverlay');

  function showLogin(){ if(loginOverlay) loginOverlay.style.display='flex'; }
  function hideLogin(){ if(loginOverlay) loginOverlay.style.display='none'; }

  async function apiPost(path, body){ const token = localStorage.getItem('vibematch_token'); const res = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}: {})}, body: JSON.stringify(body)}); return res; }

  // Auth UI wiring (phone/password)
  // read token from URL if present (after OAuth redirect)
  try{
    const urlParams = new URLSearchParams(window.location.search);
    const maybeToken = urlParams.get('token');
    if (maybeToken) { localStorage.setItem('vibematch_token', maybeToken); history.replaceState({}, document.title, window.location.pathname); }
  }catch(e){}

  const phoneInput = document.getElementById('phoneInput');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  loginBtn && loginBtn.addEventListener('click', async ()=>{
    try{ const res = await apiPost('/api/login',{ phone: phoneInput.value, password: passwordInput.value }); const j = await res.json(); if(res.ok){ localStorage.setItem('vibematch_token', j.token); hideLogin(); } else { alert(j.error||'login failed'); } }catch(e){console.error(e);alert('login error'); }
  });
  signupBtn && signupBtn.addEventListener('click', async ()=>{
    try{ const res = await apiPost('/api/signup',{ phone: phoneInput.value, password: passwordInput.value, name: phoneInput.value.replace(/\D/g,'') }); const j = await res.json(); if(res.ok){ localStorage.setItem('vibematch_token', j.token); hideLogin(); } else { alert(j.error||'signup failed'); } }catch(e){console.error(e);alert('signup error'); }
  });

  // Google OAuth: redirect to server route
  const googleBtn = document.getElementById('googleBtn');
  googleBtn && googleBtn.addEventListener('click', ()=>{ window.location.href = '/auth/google'; });

  // show login if not authenticated
  if (!localStorage.getItem('vibematch_token')) showLogin();

  // Load stories from backend and populate slider
  async function loadStories(){
    try{
      const res = await fetch('/api/stories'); const items = await res.json();
      if (!storiesRow) return;
      storiesRow.innerHTML = '';
      items.forEach((s, idx)=>{
        const el = document.createElement('div'); el.className='story-item';
        if(s.file_path && (s.file_path.endsWith('.mp4') || s.file_path.endsWith('.webm'))){
          const v = document.createElement('video'); v.src = s.file_path; v.muted = true; v.loop = false; v.playsInline = true; v.preload='metadata'; el.appendChild(v);
          v.addEventListener('click', ()=>{ v.currentTime = 0; v.play(); setTimeout(()=>v.pause(),15000); });
        } else {
          const img = document.createElement('img'); img.src = s.file_path || '/stories/placeholder.jpg'; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover'; el.appendChild(img);
          el.addEventListener('click', ()=>{ overlayStoryImage(s.file_path || img.src); });
        }
        storiesRow.appendChild(el);
      });
    }catch(err){ console.warn('loadStories', err); }
  }

  // show image overlay for stories with timeout
  function overlayStoryImage(src){
    const ov = document.createElement('div'); ov.style.position='fixed'; ov.style.inset='0'; ov.style.background='rgba(0,0,0,0.85)'; ov.style.display='grid'; ov.style.placeItems='center'; ov.style.zIndex=60;
    const img = document.createElement('img'); img.src = src; img.style.maxWidth='90%'; img.style.maxHeight='90%'; ov.appendChild(img);
    document.body.appendChild(ov);
    setTimeout(()=>{ ov.remove(); }, 8000);
    ov.addEventListener('click', ()=>ov.remove());
  }

  // Load central profiles and initialize player
  async function loadProfiles(){
    try{
      const res = await fetch('/api/profiles'); const profiles = await res.json();
      if(!profiles || profiles.length===0) return;
      const p = profiles[0];
      if(profileName) profileName.textContent = p.name || 'Guest';
      if(profileAge) profileAge.textContent = p.age || '—';
      if(profileMatch) profileMatch.textContent = (p.match||'—') + '%';
      if(profilePlayer){ profilePlayer.src = p.video || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'; profilePlayer.play().catch(()=>{}); }
    }catch(err){ console.warn('loadProfiles', err); }
  }

  // populate nearby list
  async function loadNearby(){
    try{ const res = await fetch('/api/online'); const near = await res.json(); const el = document.getElementById('nearbyList'); if(el) el.innerHTML = near.map(n=>`<div style="padding:8px;border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,0.02)">${n.name}</div>`).join(''); }catch(e){}
  }

  await Promise.all([loadStories(), loadProfiles(), loadNearby()]);
});
