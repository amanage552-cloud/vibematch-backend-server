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
      const res = await fetch('/api/profiles'); let profiles = [];
      if(res.ok) profiles = await res.json();
      // fallback mock profile when backend not available or empty
      if(!profiles || profiles.length===0){
        profiles = [{
          name: 'Ava', age: 26, match: 87,
          video: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          bio: 'Loves city sunsets, indie playlists, and coffee shops.',
        }];
      }
      const p = profiles[0];
      if(profileName) profileName.textContent = p.name || 'Guest';
      if(profileAge) profileAge.textContent = p.age || '—';
      if(profileMatch) profileMatch.textContent = (p.match||'—') + '%';
      if(profilePlayer){
        profilePlayer.src = p.video || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
        profilePlayer.muted = true;
        profilePlayer.loop = true;
        profilePlayer.playsInline = true;
        profilePlayer.autoplay = true;
        profilePlayer.play().catch(()=>{});
      }
    }catch(err){ console.warn('loadProfiles', err);
      // set mock content on error
      const p = { name: 'Ava', age: 26, match: 87, video: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' };
      if(profileName) profileName.textContent = p.name;
      if(profileAge) profileAge.textContent = p.age;
      if(profileMatch) profileMatch.textContent = p.match + '%';
      if(profilePlayer){ profilePlayer.src = p.video; profilePlayer.muted = true; profilePlayer.loop = true; profilePlayer.playsInline = true; profilePlayer.autoplay = true; profilePlayer.play().catch(()=>{}); }
    }
  }

  // populate nearby list
  async function loadNearby(){
    try{
      const res = await fetch('/api/online'); let near = [];
      if(res.ok) near = await res.json();
      if(!near || near.length===0){
        near = [
          { name: 'Ava — 0.8 mi' },
          { name: 'Liam — 1.2 mi' },
          { name: 'Zara — 1.9 mi' },
          { name: 'Noah — 2.4 mi' }
        ];
      }
      const el = document.getElementById('nearbyList');
      if(el) el.innerHTML = near.map(n=>`<div style="padding:10px;border-radius:10px;margin-bottom:8px;background:linear-gradient(90deg, rgba(163,230,53,0.06), rgba(163,230,53,0.02));border:1px solid rgba(255,255,255,0.02);">`+
        `<div style="font-weight:700;color:#E6FCD9">${n.name.split(' — ')[0]}</div><div style="font-size:12px;color:#9AB39A;margin-top:4px">${n.name.split(' — ')[1]||'—'}</div></div>`).join('');
    }catch(e){
      // fallback static list
      const el = document.getElementById('nearbyList');
      if(el) el.innerHTML = ['Ava — 0.8 mi','Liam — 1.2 mi','Zara — 1.9 mi','Noah — 2.4 mi'].map(n=>`<div style="padding:10px;border-radius:10px;margin-bottom:8px;background:linear-gradient(90deg, rgba(163,230,53,0.06), rgba(163,230,53,0.02));border:1px solid rgba(255,255,255,0.02);">`+
        `<div style="font-weight:700;color:#E6FCD9">${n.split(' — ')[0]}</div><div style="font-size:12px;color:#9AB39A;margin-top:4px">${n.split(' — ')[1]||'—'}</div></div>`).join('');
    }
  }

  await Promise.all([loadStories(), loadProfiles(), loadNearby()]);

  // Reels viewer wiring
  const reelsBtn = document.getElementById('reelsBtn');
  const reelsViewer = document.getElementById('reelsViewer');
  const closeReels = document.getElementById('closeReels');
  const reelsContainer = document.getElementById('reelsContainer');
  const uploadReelBtn = document.getElementById('uploadReelBtn');
  const reelFile = document.getElementById('reelFile');

  async function fetchReels(){
    try{
      const res = await fetch('/api/reels');
      const rows = res.ok?await res.json():[];
      if(!rows || rows.length===0){
        // fallback sample
        return [{id:'mock1', file_path:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', caption:'Sample Reel', created_at:Date.now(), user:{name:'Ava'}, user_id:null}];
      }
      return rows;
    }catch(e){ return [{id:'mock1', file_path:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', caption:'Sample Reel', created_at:Date.now(), user:{name:'Ava'}, user_id:null}]; }
  }

  function makeReelNode(r){
    const wrap = document.createElement('div'); wrap.style.height='100vh'; wrap.style.scrollSnapAlign='start'; wrap.style.position='relative'; wrap.style.display='grid'; wrap.style.placeItems='center';
    const v = document.createElement('video'); v.src = r.file_path || r.url || r.filePath; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.className='w-full h-full object-cover';
    wrap.appendChild(v);
    // overlay creator badge
    const badge = document.createElement('div'); badge.style.position='absolute'; badge.style.left='18px'; badge.style.top='18px'; badge.style.display='flex'; badge.style.alignItems='center';
    const avatar = document.createElement('div'); avatar.style.width='42px'; avatar.style.height='42px'; avatar.style.borderRadius='999px'; avatar.style.background='#071015'; avatar.style.display='grid'; avatar.style.placeItems='center'; avatar.style.marginRight='8px'; avatar.style.border='2px solid rgba(163,230,53,0.12)';
    const initials = document.createElement('div'); initials.style.color='#E6FCD9'; initials.style.fontWeight='800'; initials.style.fontFamily='Poppins,Inter,sans-serif'; initials.textContent = (r.user && r.user.name)?r.user.name[0].toUpperCase() : 'V';
    avatar.appendChild(initials);
    const matchPill = document.createElement('div'); matchPill.style.background='#A3E635'; matchPill.style.color='#07120a'; matchPill.style.fontWeight='800'; matchPill.style.padding='6px 8px'; matchPill.style.borderRadius='999px'; matchPill.textContent = (r.match||'—') + '%';
    badge.appendChild(avatar); badge.appendChild(matchPill);
    wrap.appendChild(badge);

    // double-tap to like (simple doubleclick)
    let lastTap = 0;
    wrap.addEventListener('click', (e)=>{
      const now = Date.now();
      if (now - lastTap < 300){
        // like animation
        const heart = document.createElement('div'); heart.textContent='❤'; heart.style.position='absolute'; heart.style.fontSize='48px'; heart.style.left=(e.clientX-24)+'px'; heart.style.top=(e.clientY-24)+'px'; heart.style.transform='scale(0.6)'; heart.style.opacity='0.95'; heart.style.transition='transform 300ms ease, opacity 600ms ease'; document.body.appendChild(heart);
        setTimeout(()=>{ heart.style.transform='scale(1.4)'; heart.style.opacity='0'; }, 10); setTimeout(()=>heart.remove(),700);
      }
      lastTap = now;
    });

    // ensure play on view
    const io = new IntersectionObserver((entries)=>{ entries.forEach(en=>{ if(en.isIntersecting){ v.play().catch(()=>{}); } else { v.pause(); } }); }, { threshold: 0.6 });
    io.observe(wrap);

    return wrap;
  }

  reelsBtn && reelsBtn.addEventListener('click', async ()=>{
    reelsViewer.style.display='block';
    reelsContainer.innerHTML = '';
    const rows = await fetchReels();
    rows.forEach(r=> reelsContainer.appendChild(makeReelNode(r)));
    reelsContainer.scrollTop = 0;
  });
  closeReels && closeReels.addEventListener('click', ()=>{ reelsViewer.style.display='none'; reelsContainer.innerHTML=''; });

  uploadReelBtn && uploadReelBtn.addEventListener('click', ()=> reelFile.click());
  reelFile && reelFile.addEventListener('change', async (ev)=>{
    const f = ev.target.files[0]; if(!f) return; const fd = new FormData(); fd.append('video', f); fd.append('caption','Uploaded from client');
    const token = localStorage.getItem('vibematch_token');
    const res = await fetch('/api/reels', { method:'POST', headers: { ...(token?{ Authorization: 'Bearer '+token }: {}) }, body: fd });
    if(res.ok){ alert('Uploaded Reel'); const newReels = await fetchReels(); reelsContainer.innerHTML=''; newReels.forEach(r=> reelsContainer.appendChild(makeReelNode(r))); } else { const j = await res.json(); alert('Upload failed: '+(j.error||res.statusText)); }
  });

  // Bottom dock wiring
  const bottomHomeBtn = document.getElementById('bottomHomeBtn');
  const bottomCenterBtn = document.getElementById('bottomCenterBtn');
  const bottomDiscoverBtn = document.getElementById('bottomDiscoverBtn');
  const bottomMessagesBtn = document.getElementById('bottomMessagesBtn');
  const bottomProfileBtn = document.getElementById('bottomProfileBtn');
  const mediaUploadModal = document.getElementById('mediaUploadModal');
  const closeUploadModal = document.getElementById('closeUploadModal');
  const uploadTabs = document.querySelectorAll('.uploadTab');
  const uploadSnap = document.getElementById('uploadSnap');
  const uploadReel = document.getElementById('uploadReel');
  const uploadPost = document.getElementById('uploadPost');
  const snapImageInput = document.getElementById('snapImageInput');
  const submitSnapBtn = document.getElementById('submitSnapBtn');
  const reelVideoInput = document.getElementById('reelVideoInput');
  const submitReelBtn = document.getElementById('submitReelBtn');
  const postImageInput2 = document.getElementById('postImageInput2');
  const submitPostBtn2 = document.getElementById('submitPostBtn2');

  function showUploadTab(tab){ uploadSnap.style.display='none'; uploadReel.style.display='none'; uploadPost.style.display='none'; if(tab==='snap') uploadSnap.style.display='block'; if(tab==='reel') uploadReel.style.display='block'; if(tab==='post') uploadPost.style.display='block'; }

  uploadTabs.forEach(t=> t.addEventListener('click',(e)=>{ uploadTabs.forEach(x=>x.style.boxShadow='none'); e.currentTarget.style.boxShadow='inset 0 0 0 2px rgba(163,230,53,0.12)'; showUploadTab(e.currentTarget.dataset.tab); }));
  bottomCenterBtn && bottomCenterBtn.addEventListener('click', ()=>{ mediaUploadModal.style.display='flex'; showUploadTab('reel'); });
  closeUploadModal && closeUploadModal.addEventListener('click', ()=>{ mediaUploadModal.style.display='none'; });
  bottomHomeBtn && bottomHomeBtn.addEventListener('click', ()=>{ window.scrollTo({ top: 0, behavior: 'smooth' }); reelsViewer && (reelsViewer.style.display='none'); });

  // Submit handlers for upload modal
  submitSnapBtn && submitSnapBtn.addEventListener('click', async ()=>{
    const f = snapImageInput.files[0]; if(!f){ alert('Select an image'); return; }
    const reader = new FileReader(); reader.onload = async ()=>{
      const dataUrl = reader.result;
      const token = localStorage.getItem('vibematch_token');
      const res = await fetch('/api/stories', { method:'POST', headers: { 'Content-Type':'application/json', ...(token?{ Authorization: 'Bearer '+token }: {}) }, body: JSON.stringify({ dataUrl, caption: '' }) });
      if(res.ok){ alert('Snap uploaded'); mediaUploadModal.style.display='none'; } else { alert('Upload failed'); }
    }; reader.readAsDataURL(f);
  });

  submitReelBtn && submitReelBtn.addEventListener('click', async ()=>{
    const f = reelVideoInput.files[0]; if(!f){ alert('Select a video'); return; }
    const fd = new FormData(); fd.append('video', f); fd.append('caption', document.getElementById('reelCaption').value||'');
    const token = localStorage.getItem('vibematch_token');
    const res = await fetch('/api/reels', { method:'POST', headers: { ...(token?{ Authorization: 'Bearer '+token }: {}) }, body: fd });
    if(res.ok){ alert('Reel uploaded'); mediaUploadModal.style.display='none'; } else { const j = await res.json().catch(()=>{}); alert('Upload failed: '+(j&&j.error?j.error:'error')); }
  });

  submitPostBtn2 && submitPostBtn2.addEventListener('click', async ()=>{
    const f = postImageInput2.files[0]; if(!f){ alert('Select an image'); return; }
    const fd = new FormData(); fd.append('image', f); fd.append('caption', document.getElementById('postCaption2').value||'');
    const token = localStorage.getItem('vibematch_token');
    const res = await fetch('/api/posts', { method:'POST', headers: { ...(token?{ Authorization: 'Bearer '+token }: {}) }, body: fd });
    if(res.ok){ alert('Post created'); mediaUploadModal.style.display='none'; } else { const j = await res.json().catch(()=>{}); alert('Post failed: '+(j&&j.error?j.error:'error')); }
  });

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        console.info('ServiceWorker registered', reg.scope);
      } catch (err) {
        console.warn('ServiceWorker register failed', err);
      }
    });
  }
});
