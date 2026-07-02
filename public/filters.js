// AR filter pipeline using MediaPipe FaceMesh when available, with CSS fallback
const Filters = (function(){
  let faceMesh = null;
  let camera = null;
  let mode = 'none';
  let videoEl = null;
  let glCanvas = null;
  let meshCanvas = null;
  let meshCtx = null;
  let gl = null;
  let program = null;
  let texture = null;
  let positionBuffer = null;
  let uModeLoc = null;

  function applyCssFallback(m) {
    if (!videoEl) return;
    switch(m){
      case 'beauty': videoEl.style.filter = 'brightness(1.06) saturate(1.05) contrast(1.04) blur(0.4px)'; break;
      case 'funny': videoEl.style.filter = 'contrast(1.2) hue-rotate(20deg)'; break;
      case 'cyber': videoEl.style.filter = 'contrast(1.4) saturate(1.3) hue-rotate(200deg)'; break;
      default: videoEl.style.filter = 'none';
    }
  }

  function onResults(results){
    if (!meshCtx) return;
    meshCtx.save();
    meshCtx.clearRect(0,0,meshCanvas.width,meshCanvas.height);
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length>0){
      for (const landmarks of results.multiFaceLandmarks){
        // draw mesh
        if (window.drawUtils && window.drawUtils.drawConnectors) {
          window.drawUtils.drawConnectors(meshCtx, landmarks, window.FaceMesh.FACEMESH_TESSELATION, {color: '#00FFB3', lineWidth: 1});
          window.drawUtils.drawLandmarks(meshCtx, landmarks, {color: '#FFEA00', lineWidth: 0.8});
        } else {
          // simple points
          meshCtx.fillStyle = '#00FFB3';
          for (const p of landmarks){ meshCtx.beginPath(); meshCtx.arc(p.x * meshCanvas.width, p.y * meshCanvas.height, 1.2, 0, Math.PI*2); meshCtx.fill(); }
        }

        // example: draw simple sunglasses overlay between eye landmarks when mode === 'funny'
        if (mode === 'funny'){
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];
          const w = Math.abs(rightEye.x - leftEye.x) * meshCanvas.width * 2.2;
          const h = w * 0.35;
          const cx = ((leftEye.x + rightEye.x)/2) * meshCanvas.width - w/2;
          const cy = ((leftEye.y + rightEye.y)/2) * meshCanvas.height - h/2;
          meshCtx.fillStyle = 'rgba(0,0,0,0.45)';
          meshCtx.fillRect(cx, cy, w, h);
          meshCtx.strokeStyle = 'rgba(163,230,53,0.95)'; meshCtx.lineWidth = 2;
          meshCtx.strokeRect(cx, cy, w, h);
        }
      }
    }
    meshCtx.restore();
  }

  function compileShader(gl, source, type){
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      const err = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader compile error: '+err);
    }
    return s;
  }

  function setupGL(canvas){
    gl = canvas.getContext('webgl');
    if(!gl) { console.warn('WebGL not available'); return; }
    const vs = `attribute vec2 a_position; varying vec2 v_uv; void main(){ v_uv=(a_position+1.0)*0.5; gl_Position = vec4(a_position,0,1); }`;
    const fs = `precision mediump float; varying vec2 v_uv; uniform sampler2D u_tex; uniform int u_mode; uniform float u_time; void main(){ vec2 uv=v_uv; vec2 texSize = vec2(640.0,480.0); vec2 px = 1.0/texSize; vec4 c = texture2D(u_tex, uv);
      if(u_mode==1){ // beauty: simple 5-tap gaussian-ish blur
        vec4 sum = vec4(0.0);
        sum += texture2D(u_tex, uv) * 0.4;
        sum += texture2D(u_tex, uv + vec2(px.x,0.0)) * 0.15;
        sum += texture2D(u_tex, uv - vec2(px.x,0.0)) * 0.15;
        sum += texture2D(u_tex, uv + vec2(0.0,px.y)) * 0.15;
        sum += texture2D(u_tex, uv - vec2(0.0,px.y)) * 0.15;
        c = sum;
        // gentle contrast and color boost
        c.rgb = clamp((c.rgb * 1.03 + 0.01), 0.0, 1.0);
      } else if(u_mode==2){ // funny: desaturate + wave
        float angle = 0.4 * sin(uv.y*30.0 + u_time*0.01); uv.x += angle*0.01; c = texture2D(u_tex, uv); float gray = dot(c.rgb, vec3(0.3,0.59,0.11)); c.rgb = mix(c.rgb, vec3(gray), 0.7);
      } else if(u_mode==3){ // danger: red tint with scanline
        float v = sin((uv.y + u_time*0.0005)*800.0)*0.02; vec3 tint = vec3(1.2,0.2,0.2); c.rgb = mix(c.rgb, c.rgb * tint, 0.35 + v);
      }
      gl_FragColor = c; }`;

    const vshader = compileShader(gl, vs, gl.VERTEX_SHADER);
    const fshader = compileShader(gl, fs, gl.FRAGMENT_SHADER);
    program = gl.createProgram(); gl.attachShader(program, vshader); gl.attachShader(program, fshader); gl.linkProgram(program);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){ throw new Error('GL Program link error: '+gl.getProgramInfoLog(program)); }

    positionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    uModeLoc = gl.getUniformLocation(program, 'u_mode');
    gl.useProgram(program);
  }

  async function init(videoElement, glCanvasElement, meshCanvasElement){
    videoEl = videoElement; glCanvas = glCanvasElement; meshCanvas = meshCanvasElement;
    glCanvas.width = videoEl.clientWidth || 640; glCanvas.height = videoEl.clientHeight || 480;
    meshCanvas.width = glCanvas.width; meshCanvas.height = glCanvas.height;
    meshCtx = meshCanvas.getContext('2d');

    try{
      setupGL(glCanvas);
    }catch(err){ console.warn('GL init failed', err); }

    if (window.FaceMesh && window.Camera && window.drawUtils){
      faceMesh = new window.FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
      faceMesh.setOptions({maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5});
      faceMesh.onResults(onResults);

      camera = new window.Camera(videoEl, {
        onFrame: async () => { await faceMesh.send({image: videoEl}); },
        width: 640,
        height: 480
      });
      camera.start();
      console.info('MediaPipe FaceMesh started');
    } else {
      console.warn('MediaPipe FaceMesh not available; falling back to CSS filters');
    }

    // start GL render loop if available
    function renderLoop(t){
      if (gl && texture){
        gl.viewport(0,0,glCanvas.width, glCanvas.height);
        gl.activeTexture(gl.TEXTURE0);
        try{ gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl); }catch(e){}
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const posLoc = gl.getAttribLocation(program, 'a_position'); gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1i(uModeLoc, mode==='beauty'?1: mode==='funny'?2: mode==='cyber'?3:0);
        const timeLoc = gl.getUniformLocation(program, 'u_time'); if(timeLoc) gl.uniform1f(timeLoc, t || 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
  }


  function applyFilter(videoElement, m){
    mode = m || 'none';
    // if GL not available, fall back to CSS filters
    if (!gl) applyCssFallback(mode);
  }

  function stop(){ if (camera && camera.stop) camera.stop(); if (faceMesh) faceMesh.close(); }

  return { init, applyFilter, stop };
})();

