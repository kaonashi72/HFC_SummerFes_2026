(function(){
  const board = document.getElementById('board');
  const boardWrap = document.getElementById('board-wrap');
  const mainEl = document.getElementById('main');
  const leftEl = document.getElementById('left');
  const leftInnerEl = document.getElementById('left-inner');
  const sideEl = document.getElementById('side');
  const layoutBtn = document.getElementById('layout-btn');
  const controlsEl = document.querySelector('#topbar .controls');
  const remainingWrapEl = document.querySelector('#hud .hud-remaining');
  const timerEl = document.getElementById('timer');
  const remainingEl = document.getElementById('remaining');
  const startBtn = document.getElementById('start-btn');
  const undoBtn = document.getElementById('undo-btn');
  const resetBtn = document.getElementById('reset-btn');
  const clearOverlay = document.getElementById('clear-overlay');
  const clearTitleEl = document.getElementById('clear-title');
  const clearTimeEl = document.getElementById('clear-time');
  const clearCountEl = document.getElementById('clear-count');
  const bestNoteEl = document.getElementById('best-note');
  const saveRowEl = document.getElementById('save-row');
  const clearRestartBtn = document.getElementById('clear-restart');
  const fsBtn = document.getElementById('fullscreen-btn');
  const confettiRoot = document.getElementById('confetti');
  const pauseBtn = document.getElementById('pause-btn');
  const pauseOverlay = document.getElementById('pause-overlay');
  const pauseResumeBtn = document.getElementById('pause-resume');
  const pauseLabel = document.getElementById('pause-label');
  const bgmToggle = document.getElementById('bgm-toggle');
  const bgmVolWrap = document.getElementById('bgm-vol-wrap');
  const bgmVol = document.getElementById('bgm-vol');
  const bgmVolVal = document.getElementById('bgm-vol-val');
  const timeLimitEl = document.getElementById('time-limit');
  const leaderboardEl = document.getElementById('leaderboard');
  const nicknameEl = document.getElementById('nickname');
  const saveScoreBtn = document.getElementById('save-score');
  const saveIndicatorEl = document.getElementById('save-indicator');

  // left-to-right, top-to-bottom: 1-3 top row, 4-6 middle, 7-9 bottom
  let layout = [1,2,3,4,5,6,7,8,9];
  let hitOrder = [];
  let cells = {};
  let running = false;
  let paused = false;
  let startTime = 0;
  let elapsedBase = 0;
  let rafId = null;
  const BEST_KEY = 'strikeout_best_time';
  const LB_KEY = 'strikeout_leaderboard';
  const NICK_KEY = 'strikeout_last_nick';
  const LAYOUT_KEY = 'strikeout_layout_alt';
  const LIMIT_KEY = 'strikeout_time_limit_ms';
  let hasSavedThisClear = false;
  let savingScore = false;
  let gameOver = false;
  let timeLimitMs = 0;

  function setCssVar(name, value){
    try{
      document.documentElement.style.setProperty(name, value);
    }catch(e){}
  }

  function fitBoardToViewport(){
    if(!mainEl || !boardWrap) return;
    const mainRect = mainEl.getBoundingClientRect();
    if(!mainRect.width || !mainRect.height) return;

    const cs = getComputedStyle(mainEl);
    const cols = String(cs.gridTemplateColumns || '').trim().split(/\s+/).filter(Boolean).length;
    const colGap = parseFloat(cs.columnGap || cs.gap || '16') || 16;
    const sideRect = sideEl ? sideEl.getBoundingClientRect() : { width:0 };
    const leftRect = leftEl ? leftEl.getBoundingClientRect() : { width:0 };
    const gapsToSubtract = Math.max(0, cols - 1) * colGap;

    const wrapCs = getComputedStyle(boardWrap);
    const padX = (parseFloat(wrapCs.paddingLeft || '0') || 0) + (parseFloat(wrapCs.paddingRight || '0') || 0);
    const padY = (parseFloat(wrapCs.paddingTop || '0') || 0) + (parseFloat(wrapCs.paddingBottom || '0') || 0);

    const subtractW =
      (cols >= 2 ? (sideRect.width || 0) : 0) +
      (cols >= 3 ? (leftRect.width || 0) : 0);
    const availableW = Math.max(0, mainRect.width - subtractW - gapsToSubtract);
    const availableH = Math.max(0, mainRect.height);

    // We budget some space for gap between cells too (2 gaps for 3 cells).
    // Start from a safe guess, then compute gap from cell size.
    let cell = Math.floor(Math.min((availableW - padX) / 3, (availableH - padY) / 3));
    cell = Math.max(90, Math.min(240, cell));
    let cellGap = Math.round(Math.max(12, Math.min(28, cell * 0.12)));

    // Recalculate with gap budget to avoid tiny overflows.
    cell = Math.floor(Math.min((availableW - padX - cellGap*2) / 3, (availableH - padY - cellGap*2) / 3));
    cell = Math.max(90, Math.min(240, cell));
    cellGap = Math.round(Math.max(12, Math.min(28, cell * 0.12)));

    setCssVar('--cell', cell + 'px');
    setCssVar('--cell-gap', cellGap + 'px');
  }

  const originalPlacement = {
    controlsParent: controlsEl ? controlsEl.parentElement : null,
    controlsNext: controlsEl ? controlsEl.nextElementSibling : null,
    remainingParent: remainingWrapEl ? remainingWrapEl.parentElement : null,
    remainingNext: remainingWrapEl ? remainingWrapEl.nextElementSibling : null,
  };

  function restoreNode(node, parent, next){
    if(!node || !parent) return;
    try{
      if(next && next.parentNode === parent) parent.insertBefore(node, next);
      else parent.appendChild(node);
    }catch(e){}
  }

  function setAltLayout(on){
    document.body.classList.toggle('layout-alt', !!on);
    if(on){
      if(leftInnerEl && remainingWrapEl) leftInnerEl.appendChild(remainingWrapEl);
      if(leftInnerEl && controlsEl){
        controlsEl.classList.add('in-leftbar');
        leftInnerEl.appendChild(controlsEl);
      }
    }else{
      if(controlsEl) controlsEl.classList.remove('in-leftbar');
      restoreNode(remainingWrapEl, originalPlacement.remainingParent, originalPlacement.remainingNext);
      restoreNode(controlsEl, originalPlacement.controlsParent, originalPlacement.controlsNext);
    }
    try{ localStorage.setItem(LAYOUT_KEY, on ? '1' : '0'); }catch(e){}
    if(layoutBtn){
      const label = on ? '通常レイアウト' : '簡易レイアウト';
      layoutBtn.innerHTML = `<span class="btn-row"><span>${label}</span></span>`;
    }
    fitBoardToViewport();
  }

  function setSaveButtonState(state){
    if(!saveScoreBtn) return;
    saveScoreBtn.classList.remove('saved');
    if(state === 'idle'){
      saveScoreBtn.disabled = false;
      saveScoreBtn.innerHTML = `<span class="btn-row"><span>保存</span></span>`;
      return;
    }
    if(state === 'saving'){
      saveScoreBtn.disabled = true;
      saveScoreBtn.innerHTML = `<span class="btn-row"><span>保存中…</span></span>`;
      return;
    }
    if(state === 'saved'){
      saveScoreBtn.disabled = true;
      saveScoreBtn.classList.add('saved');
      saveScoreBtn.innerHTML = `<span class="btn-row"><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg><span>保存済み</span></span>`;
      return;
    }
  }
  const BGM_KEY = 'strikeout_bgm_on';
  const BGM_VOL_KEY = 'strikeout_bgm_vol';
  const BGM_DEFAULT_VOL = 0.18;
  let bgmDesiredVol = BGM_DEFAULT_VOL;
  let bgmIsDucking = false;

  function pulse(el){
    if(!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  function clearConfetti(){
    if(confettiRoot) confettiRoot.innerHTML = '';
  }

  function spawnConfetti(count = 120){
    if(!confettiRoot) return;
    clearConfetti();
    const colors = ['#ffd23f','#ff3b3b','#7cf6ff','#9b7bff','#ffffff'];
    const n = Math.min(180, Math.max(30, count|0));
    for(let i=0;i<n;i++){
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      const left = Math.random()*100;
      const w = 6 + Math.random()*10;
      const h = w * (1.2 + Math.random()*1.4);
      const dur = 1200 + Math.random()*1600;
      const delay = Math.random()*220;
      const drift = (Math.random()*2-1) * (60 + Math.random()*180);
      const spin = (Math.random()*2-1) * (540 + Math.random()*720);
      piece.style.left = left + 'vw';
      piece.style.width = w + 'px';
      piece.style.height = h + 'px';
      piece.style.background = colors[i % colors.length];
      piece.style.setProperty('--dur', dur + 'ms');
      piece.style.setProperty('--delay', delay + 'ms');
      piece.style.setProperty('--drift', drift + 'px');
      piece.style.setProperty('--spin', spin + 'deg');
      piece.style.opacity = (0.7 + Math.random()*0.3).toFixed(2);
      piece.style.transform = `translate3d(0,-10vh,0) rotate(${(Math.random()*180-90).toFixed(1)}deg)`;
      confettiRoot.appendChild(piece);
    }
    setTimeout(clearConfetti, 3800);
  }

  function buildBoard(){
    if(!board) return;
    board.innerHTML = '';
    cells = {};
    layout.forEach((num, idx)=>{
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.num = String(num);
      cell.style.setProperty('--delay', (idx*60) + 'ms');
      cell.classList.add('spawn');
      cell.innerHTML = `
        <div class="cell-inner">
          <div class="face front"><span class="num">${num}</span></div>
          <div class="face back"></div>
          <div class="spark"></div>
          <div class="ripple"></div>
        </div>`;
      cell.addEventListener('click', ()=> hit(num));
      board.appendChild(cell);
      cells[num] = cell;
    });
  }

  function audioCtx(){
    if(!window.__ac) window.__ac = new (window.AudioContext||window.webkitAudioContext)();
    return window.__ac;
  }

  function ensureAudioRunning(){
    try{
      const ctx = audioCtx();
      if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
    }catch(e){}
  }

  function stopBgm(){
    const bgm = window.__bgm;
    if(!bgm || !bgm.audio) return;
    try{
      if(bgm.duckTimer) clearTimeout(bgm.duckTimer);
      bgm.audio.pause();
      bgm.audio.currentTime = 0;
    }catch(e){}
    window.__bgm = null;
  }

  function setDesiredBgmVol(v){
    const vol = Math.max(0, Math.min(1, Number(v)));
    bgmDesiredVol = vol;
    if(bgmVol) bgmVol.value = String(Math.round(vol*100));
    if(bgmVolVal) bgmVolVal.textContent = String(Math.round(vol*100));
    try{ localStorage.setItem(BGM_VOL_KEY, String(vol)); }catch(e){}

    const bgm = window.__bgm;
    if(bgm && bgm.audio){
      const duckVol = Math.min(vol, Math.max(0.02, vol*0.35));
      bgm.audio.volume = bgmIsDucking ? duckVol : vol;
    }
  }

  function startBgm(){
    try{
      if(window.__bgm) return;
      const audio = new Audio('./cheering_pep_squad.mp3');
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = bgmDesiredVol;
      audio.playsInline = true;

      // Start (must be called from user gesture in most browsers)
      const p = audio.play();
      if(p && typeof p.catch === 'function') p.catch(()=>{});

      window.__bgm = { audio, duckTimer:null };
    }catch(e){}
  }

  function duckBgm(ms = 220){
    const bgm = window.__bgm;
    if(!bgm || !bgm.audio) return;
    try{
      if(bgm.duckTimer) clearTimeout(bgm.duckTimer);
      bgmIsDucking = true;
      const duckVol = Math.min(bgmDesiredVol, Math.max(0.02, bgmDesiredVol*0.35));
      bgm.audio.volume = duckVol;
      bgm.duckTimer = setTimeout(()=>{
        if(window.__bgm && window.__bgm.audio){
          bgmIsDucking = false;
          window.__bgm.audio.volume = bgmDesiredVol;
        }
      }, ms);
    }catch(e){}
  }

  function updateBgmUi(){
    const on = !!(window.__bgm && window.__bgm.audio);
    if(bgmToggle) bgmToggle.checked = on;
    if(bgmVolWrap) bgmVolWrap.setAttribute('aria-disabled', on ? 'false' : 'true');
    if(bgmVol) bgmVol.disabled = !on;
  }

  function setBgmOn(on){
    if(on){
      startBgm();
    }else{
      stopBgm();
    }
    updateBgmUi();
    try{ localStorage.setItem(BGM_KEY, on ? '1' : '0'); }catch(e){}
  }
  function playHitSound(){
    try{
      ensureAudioRunning();
      duckBgm(260);
      const ctx = audioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(320, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime+0.18);
      g.gain.setValueAtTime(0.28, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.2);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime+0.22);
    }catch(e){}
  }
  function playClearSound(){
    try{
      ensureAudioRunning();
      duckBgm(600);
      const ctx = audioCtx();
      [523.25,659.25,783.99,1046.5].forEach((freq,i)=>{
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        const t = ctx.currentTime + i*0.12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t+0.35);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t+0.4);
      });
    }catch(e){}
  }

  function remainingCount(){
    return 9 - hitOrder.length;
  }
  function updateRemaining(){
    if(!remainingEl) return;
    remainingEl.textContent = String(remainingCount());
    remainingEl.classList.toggle('zero', remainingCount()===0);
    pulse(remainingEl);
  }

  function formatTime(ms){
    const s = ms/1000;
    return s.toFixed(2).padStart(5,'0');
  }

  function limitLabel(ms){
    if(!ms) return 'なし';
    if(ms === 60000) return '1m';
    if(ms === 45000) return '45s';
    if(ms === 30000) return '30s';
    return Math.round(ms/1000) + 's';
  }

  function calcScore(ms){
    // kid-friendly: bigger is better, based on clear time
    const s = ms/1000;
    return Math.max(0, Math.round(10000 - (s * 180)));
  }

  function loadLeaderboard(){
    try{
      const raw = localStorage.getItem(LB_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      // migrate: ensure id exists
      list.forEach((r)=>{
        if(!r || typeof r !== 'object') return;
        if(!r.id) r.id = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
        if(typeof r.hits !== 'number') r.hits = 9;
        if(typeof r.limitMs !== 'number') r.limitMs = 0;
        if(!r.result) r.result = (r.hits >= 9 ? 'clear' : 'timeup');
      });
      return list;
    }catch(e){
      return [];
    }
  }

  function saveLeaderboard(list){
    try{
      localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 200)));
    }catch(e){}
  }

  function renderLeaderboard(){
    if(!leaderboardEl) return;
    const list = loadLeaderboard();
    if(list.length === 0){
      leaderboardEl.innerHTML = `<div class="lb-empty">まだ記録なしだよ〜</div>`;
      return;
    }
    const escapeHtml = (s)=> String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');

    const nameHtml = (raw)=>{
      const chars = Array.from(String(raw || 'NO NAME')).slice(0, 6);
      const line1 = chars.slice(0, 5).join('');
      const line2 = chars.slice(5).join('');
      return line2 ? `${escapeHtml(line1)}<br>${escapeHtml(line2)}` : escapeHtml(line1);
    };

    const pad2 = (n)=> String(n).padStart(2,'0');
    leaderboardEl.innerHTML = list.slice(0, 200).map((r, idx)=>{
      const id = String(r.id || '');
      const name = nameHtml(r.name);
      const t = formatTime(Number(r.timeMs || 0));
      const hits = Math.max(0, Math.min(9, Number(r.hits || 0)));
      const limitMs = Number(r.limitMs || 0);
      const rightLine1 = (hits >= 9 && !limitMs) ? `${t}s` : `抜き: ${hits}/9`;
      const rightLine2 = (hits >= 9 && !limitMs) ? '' : `時間: ${t}s${limitMs ? `（制限 ${limitLabel(limitMs)}）` : ''}`;
      const when = r.at ? new Date(r.at) : null;
      const meta = when
        ? `${pad2(when.getMonth()+1)}/${pad2(when.getDate())} ${pad2(when.getHours())}:${pad2(when.getMinutes())}`
        : '';
      return `
        <div class="lb-row">
          <div class="lb-left">
            <div class="lb-rank ${idx===0?'gold':idx===1?'silver':idx===2?'bronze':''}">${idx+1}</div>
            <div style="min-width:0;">
              <div class="lb-name">${name}</div>
              <div class="lb-meta">${meta}</div>
            </div>
          </div>
          <div class="lb-right">
            <div class="lb-time">${rightLine1}</div>
            ${rightLine2 ? `<div class="lb-meta">${rightLine2}</div>` : ``}
          </div>
          <div class="lb-actions">
            <button class="lb-del" data-id="${id}" title="削除" aria-label="削除">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-trash"></use></svg>
            </button>
          </div>
        </div>`;
    }).join('');
  }
  let lastTimerPaint = 0;
  function currentElapsed(){
    if(running){
      return elapsedBase + (performance.now() - startTime);
    }
    return elapsedBase;
  }
  function tick(){
    if(!running) return;
    const now = performance.now();
    const elapsed = elapsedBase + (now-startTime);
    if(timeLimitMs > 0 && elapsed >= timeLimitMs){
      timeUp();
      return;
    }
    if(timerEl && now - lastTimerPaint >= 33){
      if(timeLimitMs > 0){
        const remain = Math.max(0, timeLimitMs - elapsed);
        timerEl.textContent = formatTime(remain);
      }else{
        timerEl.textContent = formatTime(elapsed);
      }
      lastTimerPaint = now;
    }
    rafId = requestAnimationFrame(tick);
  }
  function startTimer(){
    if(running) return;
    running = true;
    startTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
  function stopTimer(){
    running = false;
    if(rafId) cancelAnimationFrame(rafId);
  }

  function updatePauseUi(){
    const canPause = (elapsedBase > 0 || running) && remainingCount() > 0;
    if(pauseBtn){
      pauseBtn.disabled = !canPause || gameOver;
      pauseBtn.classList.toggle('is-paused', paused);
      if(pauseLabel) pauseLabel.textContent = paused ? '再開' : 'ポーズ';
    }
    if(pauseOverlay){
      pauseOverlay.classList.toggle('show', paused);
      pauseOverlay.setAttribute('aria-hidden', paused ? 'false' : 'true');
    }
  }

  function pauseGame(){
    if(paused) return;
    if(!running && elapsedBase === 0) return;
    elapsedBase = currentElapsed();
    stopTimer();
    paused = true;
    if(timerEl) timerEl.textContent = formatTime(elapsedBase);
    updatePauseUi();
  }

  function resumeGame(){
    if(!paused) return;
    paused = false;
    startTime = performance.now();
    running = true;
    rafId = requestAnimationFrame(tick);
    updatePauseUi();
  }

  function hit(num){
    if(gameOver) return;
    if(paused) return;
    const cell = cells[num];
    if(!cell || cell.classList.contains('hit')) return;
    if(!running) startTimer();
    cell.classList.add('hit','bursting','rippling');
    setTimeout(()=>cell.classList.remove('bursting'), 500);
    setTimeout(()=>cell.classList.remove('rippling'), 550);
    hitOrder.push(num);
    playHitSound();
    updateRemaining();
    pulse(timerEl);
    if(remainingCount()===0){
      finishGame();
    }
  }

  function undo(){
    if(hitOrder.length===0) return;
    const last = hitOrder.pop();
    if(cells[last]) cells[last].classList.remove('hit');
    updateRemaining();
    if(remainingCount()>0 && clearOverlay){
      clearOverlay.classList.remove('show');
    }
  }

  function finishGame(){
    gameOver = true;
    // capture elapsed BEFORE stopping (stopTimer flips running=false)
    const elapsed = currentElapsed();
    stopTimer();
    elapsedBase = elapsed;
    paused = false;
    if(timerEl){
      timerEl.textContent = timeLimitMs > 0 ? formatTime(Math.max(0, timeLimitMs - elapsedBase)) : formatTime(elapsedBase);
    }
    playClearSound();
    document.body.classList.add('celebrate');
    setTimeout(()=>document.body.classList.remove('celebrate'), 900);
    spawnConfetti(140);
    if(clearTitleEl) clearTitleEl.textContent = 'CLEAR!';
    if(saveRowEl) saveRowEl.style.display = 'flex';
    const best = parseFloat(localStorage.getItem(BEST_KEY)||'Infinity');
    let noteText = '';
    if(elapsed < best){
      localStorage.setItem(BEST_KEY, String(elapsed));
      noteText = '🎉 ベストタイム更新！';
    }else{
      noteText = 'ベストタイム: ' + formatTime(best) + ' 秒';
    }
    if(clearTimeEl){
      const t = timeLimitMs > 0 ? (limitLabel(timeLimitMs) + ' / 残り: ' + formatTime(Math.max(0, timeLimitMs - elapsed)) + ' 秒') : ('タイム: ' + formatTime(elapsed) + ' 秒');
      clearTimeEl.textContent = t;
    }
    if(clearCountEl) clearCountEl.textContent = '抜いた数: 9 / 9';
    if(bestNoteEl) bestNoteEl.textContent = noteText;
    setTimeout(()=> clearOverlay && clearOverlay.classList.add('show'), 300);

    // nickname prompt
    try{
      const last = localStorage.getItem(NICK_KEY) || '';
      if(nicknameEl && !nicknameEl.value) nicknameEl.value = last;
      setTimeout(()=> nicknameEl && nicknameEl.focus(), 320);
    }catch(e){}
  }

  function resetGame(keepLayout){
    stopTimer();
    paused = false;
    gameOver = false;
    elapsedBase = 0;
    hitOrder = [];
    if(timerEl) timerEl.textContent = timeLimitMs > 0 ? formatTime(timeLimitMs) : '00.00';
    hasSavedThisClear = false;
    savingScore = false;
    if(saveIndicatorEl) saveIndicatorEl.style.display = 'none';
    setSaveButtonState('idle');
    if(saveRowEl) saveRowEl.style.display = 'flex';
    if(clearTitleEl) clearTitleEl.textContent = 'CLEAR!';
    if(nicknameEl) nicknameEl.disabled = false;
    if(clearOverlay) clearOverlay.classList.remove('show');
    if(pauseOverlay) pauseOverlay.classList.remove('show');
    clearConfetti();
    document.body.classList.remove('celebrate');
    // board numbers are always fixed (no shuffle)
    layout = [1,2,3,4,5,6,7,8,9];
    buildBoard();
    updateRemaining();
    updatePauseUi();
  }

  function timeUp(){
    if(gameOver) return;
    gameOver = true;
    // freeze at limit
    const elapsed = Math.min(timeLimitMs || currentElapsed(), currentElapsed());
    stopTimer();
    elapsedBase = elapsed;
    paused = false;
    if(timerEl) timerEl.textContent = '00.00';
    if(clearTitleEl) clearTitleEl.textContent = 'TIME UP!';
    if(clearTimeEl) clearTimeEl.textContent = '制限時間: ' + limitLabel(timeLimitMs) + '（終了）';
    const cleared = hitOrder.length;
    if(clearCountEl) clearCountEl.textContent = '抜いた数: ' + String(cleared) + ' / 9';
    if(bestNoteEl) bestNoteEl.textContent = 'おつかれさま〜！';
    if(saveRowEl) saveRowEl.style.display = 'flex';
    setSaveButtonState('idle');
    if(nicknameEl) nicknameEl.disabled = false;
    setTimeout(()=> clearOverlay && clearOverlay.classList.add('show'), 200);
    updatePauseUi();
  }

  if(startBtn) startBtn.addEventListener('click', ()=>{
    ensureAudioRunning();
    resetGame(true);
    startTimer();
    updatePauseUi();
  });
  if(undoBtn) undoBtn.addEventListener('click', undo);
  if(resetBtn) resetBtn.addEventListener('click', ()=> resetGame(true));
  if(clearRestartBtn) clearRestartBtn.addEventListener('click', ()=>{
    ensureAudioRunning();
    if(savingScore) return;
    if(remainingCount() === 0 && !hasSavedThisClear){
      const ok = window.confirm('記録をまだ保存してないよ〜。\n保存せずにもう一度遊ぶ？');
      if(!ok) return;
    }
    resetGame(true);
    // back to home state (timer should NOT auto-start)
  });

  document.addEventListener('keydown', (e)=>{
    if(e.key>='1' && e.key<='9'){
      ensureAudioRunning();
      if(paused) return;
      hit(parseInt(e.key,10));
    }
    if(e.key === ' '){
      if(paused) resumeGame();
      else pauseGame();
    }
  });

  if(fsBtn) fsBtn.addEventListener('click', ()=>{
    ensureAudioRunning();
    if(!document.fullscreenElement){
      document.documentElement.requestFullscreen().catch(()=>{});
    }else{
      document.exitFullscreen();
    }
  });

  if(pauseBtn){
    pauseBtn.addEventListener('click', ()=>{
      if(paused) resumeGame();
      else pauseGame();
    });
  }
  if(pauseResumeBtn){
    pauseResumeBtn.addEventListener('click', ()=>{
      resumeGame();
    });
  }

  if(bgmToggle){
    bgmToggle.addEventListener('change', ()=>{
      ensureAudioRunning();
      setBgmOn(!!bgmToggle.checked);
    });
    updateBgmUi();
  }

  if(bgmVol){
    bgmVol.addEventListener('input', ()=>{
      setDesiredBgmVol(Number(bgmVol.value)/100);
    });
  }

  // restore bgm preference (auto-start on first user gesture)
  try{
    const want = localStorage.getItem(BGM_KEY) === '1';
    const savedVol = parseFloat(localStorage.getItem(BGM_VOL_KEY) || '');
    if(Number.isFinite(savedVol)) bgmDesiredVol = Math.max(0, Math.min(1, savedVol));
    setDesiredBgmVol(bgmDesiredVol);
    if(want){
      if(bgmToggle) bgmToggle.checked = true;
      const auto = ()=>{
        ensureAudioRunning();
        setBgmOn(true);
      };
      window.addEventListener('pointerdown', auto, { once:true, capture:true });
      window.addEventListener('keydown', auto, { once:true, capture:true });
    }
  }catch(e){}

  if(layoutBtn){
    layoutBtn.addEventListener('click', ()=>{
      setAltLayout(!document.body.classList.contains('layout-alt'));
    });
  }
  try{
    const alt = localStorage.getItem(LAYOUT_KEY) === '1';
    if(alt) setAltLayout(true);
    else setAltLayout(false);
  }catch(e){
    setAltLayout(false);
  }

  function applyTimeLimit(ms){
    timeLimitMs = Math.max(0, Number(ms) || 0);
    try{ localStorage.setItem(LIMIT_KEY, String(timeLimitMs)); }catch(e){}
    if(timeLimitEl) timeLimitEl.value = String(timeLimitMs);
    // apply immediately to the next run; if game already started, reset to avoid weird mid-run cutoff
    if(running || elapsedBase > 0 || hitOrder.length > 0){
      resetGame(true);
    }else{
      if(timerEl) timerEl.textContent = timeLimitMs > 0 ? formatTime(timeLimitMs) : '00.00';
    }
    fitBoardToViewport();
  }

  if(timeLimitEl){
    timeLimitEl.addEventListener('change', ()=>{
      applyTimeLimit(timeLimitEl.value);
    });
  }
  try{
    const saved = parseInt(localStorage.getItem(LIMIT_KEY) || '0', 10);
    if(saved === 30000 || saved === 45000 || saved === 60000) applyTimeLimit(saved);
    else applyTimeLimit(0);
  }catch(e){
    applyTimeLimit(0);
  }

  buildBoard();
  fitBoardToViewport();
  updateRemaining();
  updatePauseUi();
  renderLeaderboard();

  let __fitTimer = null;
  function scheduleFit(){
    if(__fitTimer) clearTimeout(__fitTimer);
    __fitTimer = setTimeout(fitBoardToViewport, 60);
  }
  window.addEventListener('resize', scheduleFit, { passive:true });
  window.addEventListener('orientationchange', scheduleFit, { passive:true });
  document.addEventListener('fullscreenchange', scheduleFit);

  function submitScore(){
    if(!gameOver) return;
    if(savingScore || hasSavedThisClear) return;
    const hits = hitOrder.length;
    if(hits <= 0) return;
    savingScore = true;
    if(saveIndicatorEl) saveIndicatorEl.style.display = 'inline';
    setSaveButtonState('saving');
    if(nicknameEl) nicknameEl.disabled = true;

    const name = (nicknameEl && nicknameEl.value ? nicknameEl.value : '').trim().slice(0, 6) || 'NO NAME';
    const timeMs = Number(elapsedBase || 0);
    const score = calcScore(timeMs);
    const result = (hits >= 9) ? 'clear' : 'timeup';
    const row = { id: String(Date.now()) + '-' + Math.random().toString(16).slice(2), name, timeMs, score, hits, limitMs: timeLimitMs, result, at: Date.now() };
    const list = loadLeaderboard();
    list.push(row);
    // ranking: more hits is better, then faster is better
    list.sort((a,b)=> (Number(b.hits||0) - Number(a.hits||0)) || (Number(a.timeMs||0) - Number(b.timeMs||0)) || (a.at - b.at));
    saveLeaderboard(list);
    renderLeaderboard();
    try{ localStorage.setItem(NICK_KEY, name); }catch(e){}

    hasSavedThisClear = true;
    savingScore = false;
    if(saveIndicatorEl) saveIndicatorEl.style.display = 'none';
    setSaveButtonState('saved');
  }

  if(saveScoreBtn){
    saveScoreBtn.addEventListener('click', submitScore);
  }
  if(nicknameEl){
    nicknameEl.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        submitScore();
      }
    });
  }

  if(leaderboardEl){
    leaderboardEl.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('.lb-del') : null;
      if(!btn) return;
      const id = btn.getAttribute('data-id');
      if(!id) return;
      const ok = window.confirm('本当に削除しますか？');
      if(!ok) return;
      const list = loadLeaderboard().filter((r)=> String(r.id||'') !== String(id));
      saveLeaderboard(list);
      renderLeaderboard();
    });
  }
})();
