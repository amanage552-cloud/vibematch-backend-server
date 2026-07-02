// Main app logic: camera stream, filter selection, swipe navigation and deck
document.addEventListener('DOMContentLoaded', async () => {
  const swipeContainer = document.getElementById('swipeContainer');
  const cameraVideo = document.getElementById('cameraVideo');
  const overlayCanvas = document.getElementById('overlayCanvas');
  const filterTray = document.getElementById('filterTray');
  const captureBtn = document.getElementById('captureBtn');
  const cardStack = document.getElementById('cardStack');
  const matchModal = document.getElementById('matchModal');
  const matchName = document.getElementById('matchName');
  const closeModal = document.getElementById('closeModal');

  // swipe positions: 0 = chat (left), 1 = camera (center), 2 = deck (right)
  let pos = 1;
  function showPos(p){
    pos = p; swipeContainer.style.transform = `translateX(-${p*100}vw)`;
  }

  // touch navigation
  let startX=null; let deltaX=0;
  swipeContainer.addEventListener('touchstart',(e)=>{startX=e.touches[0].clientX});
  swipeContainer.addEventListener('touchmove',(e)=>{ if(startX!==null){deltaX=e.touches[0].clientX-startX; swipeContainer.style.transform=`translateX(calc(-${pos*100}vw + ${deltaX}px))`} });
  swipeContainer.addEventListener('touchend',(e)=>{ if(startX!==null){ if(deltaX>80) showPos(Math.max(0,pos-1)); else if(deltaX<-80) showPos(Math.min(2,pos+1)); else showPos(pos); } startX=null; deltaX=0; });

  // initialize camera
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false});
    cameraVideo.srcObject = stream;
    cameraVideo.play();
    // initialize MediaPipe filters pipeline (if available)
    const glCanvas = document.getElementById('glCanvas');
    const postStoryBtn = document.getElementById('postStoryBtn');
    if (window.Filters && typeof Filters.init === 'function') {
      Filters.init(cameraVideo, glCanvas, overlayCanvas);
    } else if (window.Filters && typeof Filters.initFaceTrackingPlaceholder === 'function'){
      Filters.initFaceTrackingPlaceholder && Filters.initFaceTrackingPlaceholder();
    }
  }catch(err){console.error('Camera error',err); alert('Camera access required for app');}

  // Post to Story button behavior
  const postStoryBtn = document.getElementById('postStoryBtn');
  if (postStoryBtn) {
    postStoryBtn.addEventListener('click', async () => {
      try {
        // prefer GL canvas snapshot if available
        const glCanvasEl = document.getElementById('glCanvas');
        let dataUrl = null;
        if (glCanvasEl && glCanvasEl.toDataURL) dataUrl = glCanvasEl.toDataURL('image/jpeg', 0.9);
        if (!dataUrl) {
          const c = document.createElement('canvas'); c.width = cameraVideo.videoWidth; c.height = cameraVideo.videoHeight; c.getContext('2d').drawImage(cameraVideo,0,0,c.width,c.height); dataUrl = c.toDataURL('image/jpeg',0.9);
        }
        const resp = await fetch('/api/stories', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: localUserId, dataUrl, caption: '' }) });
        const j = await resp.json();
        if (resp.ok) { alert('Posted to Story'); } else { alert('Story upload failed: '+(j.error||resp.status)); }
      } catch (err) { console.error('story post',err); alert('Upload failed'); }
    });
  }

  // Socket.IO live integration
  const socket = (window.io && io()) || null;
  // create or reuse a local user id
  let localUserId = localStorage.getItem('vibematch_user');
  if (!localUserId) { localUserId = 'user_' + Math.random().toString(36).slice(2,9); localStorage.setItem('vibematch_user', localUserId); }
  if (socket) { socket.emit('identify', { userId: localUserId }); socket.on('matched', (data) => { const otherId = data?.with; if(!otherId) return; // try to map to name
      const cardProfile = profilesById[otherId]; matchName.textContent = cardProfile ? cardProfile.name : otherId; matchModal.style.display='flex'; }); }

  // filter selection
  filterTray.querySelectorAll('.filter-bubble').forEach(b=>{
    b.addEventListener('click',()=>{
      filterTray.querySelectorAll('.filter-bubble').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const mode=b.dataset.filter;
      Filters.applyFilter(cameraVideo,mode);
    });
  });

  // capture action (photo snapshot)
  captureBtn.addEventListener('click',()=>{
    const canvas=document.createElement('canvas');
    canvas.width=cameraVideo.videoWidth; canvas.height=cameraVideo.videoHeight;
    const ctx=canvas.getContext('2d'); ctx.drawImage(cameraVideo,0,0,canvas.width,canvas.height);
    const dataUrl=canvas.toDataURL('image/jpeg');
    // show temporary preview or send to backend
    const win = window.open(); if(win) { win.document.body.style.margin='0'; const img = new Image(); img.src=dataUrl; img.style.width='100%'; win.document.body.appendChild(img);} else { console.log('Captured',dataUrl.slice(0,80)); }
  });

  // build deck from /api/profiles
  const profilesById = {};

  async function loadDeck(){
    try{
      const res = await fetch('/api/profiles'); const profiles = await res.json();
      profiles.reverse().forEach(p=>{ profilesById[p.id]=p; pushCard(p); });
    }catch(err){console.error('Deck load error',err)}
  }

  function pushCard(profile){
    const el=document.createElement('div'); el.className='card'; el.style.backgroundImage=`url(${profile.photo})`;
    el.dataset.id=profile.id;
    el.innerHTML=`<div class="meta"><div class="flex items-center justify-between"><div><div class="text-xl font-bold">${profile.name}, ${profile.age}<span class='match-pill'>${profile.match}% Match</span></div><div class='tags'>${(profile.interests||[]).map(t=>`<span class='tag'>${t}</span>`).join('')}</div></div></div></div>`;
    cardStack.appendChild(el);

    // drag/swipe behavior
    let start=null,shiftX=0; let offsetX=0; let offsetY=0;
    function onStart(e){ start = e.type==='touchstart'? e.touches[0].clientX : e.clientX; document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onEnd); document.addEventListener('touchmove',onMove); document.addEventListener('touchend',onEnd); }
    function onMove(e){ if(start===null) return; const x = e.type.includes('touch')? e.touches[0].clientX : e.clientX; shiftX = x - start; el.style.transform = `translate(${shiftX}px, ${Math.abs(shiftX)/4}px) rotate(${shiftX/20}deg)`; }
    function onEnd(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onEnd); document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onEnd); if(Math.abs(shiftX)>120){ // consider action
        const liked = shiftX>0; el.style.transition='transform 300ms ease, opacity 300ms ease'; el.style.transform = `translate(${liked?1000:-1000}px,0) rotate(${liked?40:-40}deg)`; setTimeout(()=>{ el.remove(); if(liked) onLike(profile); },350);
      } else { el.style.transition='transform 200ms ease'; el.style.transform='translate(0,0)'; setTimeout(()=>el.style.transition='none',250); }
      start=null; shiftX=0;
    }
    el.addEventListener('mousedown', onStart); el.addEventListener('touchstart', onStart);
  }

  function onLike(profile){
    // emit like to server via Socket.IO for live matching
    try{
      if (socket) socket.emit('deck_like', { fromUserId: localUserId, targetUserId: profile.id });
    }catch(e){console.warn('like emit failed',e)}
    // local fallback: show modal for high-match scores
    if(profile.match>=90){ matchName.textContent=profile.name; matchModal.style.display='flex'; }
  }

  closeModal.addEventListener('click',()=>matchModal.style.display='none');
  document.getElementById('msgBtn').addEventListener('click',()=>{ matchModal.style.display='none'; showPos(0); });

  await loadDeck();
  // init at camera center
  showPos(1);
});
