// app.js — improved TypeWord with IME support, per-char highlight, word display, sliding track
const API_URL = 'https://korean-advice-open-api.vercel.app/api/advice';

const state = {
  sentences: [],
  idx: 0,
  charIndex: 0,
  typed: 0,
  correct: 0,
  startAt: null,
  timer: null,
  composing: false,
  history: []
};

// DOM
const trackEl = document.getElementById('track');
const cpmEl = document.getElementById('cpm');
const accEl = document.getElementById('acc');
const timeEl = document.getElementById('time');
const timeTopEl = document.getElementById('time-top');
const authorEl = document.getElementById('author');
const authorProfileEl = document.getElementById('authorProfile');
const nextPreviewEl = document.getElementById('next-preview');
const hiddenInput = document.getElementById('hidden-input');
const currentWordEl = document.getElementById('current-word');
const recentList = document.getElementById('recent-list');
const autoNextCheckbox = document.getElementById('autoNext');

// helpers
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

async function fetchSentences(){
  try{
    const res = await fetch(API_URL);
    if(!res.ok) throw new Error('Network');
    const data = await res.json();
    const items = Array.isArray(data) ? data : [data];
    state.sentences = items.map(it => ({text: (it.message||'').trim(), author: it.author||'익명', profile: it.authorProfile||''})).filter(s=>s.text.length>0);
    if(state.sentences.length===0) throw new Error('no data');
  }catch(e){
    console.warn('API 실패, 로컬 문장 사용', e);
    state.sentences = [
      {text:'반드시 이겨야 하는 건 아니지만 진실할 필요는 있다.', author:'에이브러햄 링컨', profile:'미국 16대 대통령'},
      {text:'바늘 도둑이 소 도둑 된다.', author:'속담', profile:''},
      {text:'가는 말이 고와야 오는 말이 곱다.', author:'속담', profile:''}
    ];
  }
}

function renderSentence(){
  const s = state.sentences[state.idx];
  if(!s) return;
  authorEl.textContent = `작성자: ${s.author}`;
  authorProfileEl.textContent = s.profile || '';
  nextPreviewEl.textContent = state.sentences[state.idx+1]? `다음: ${state.sentences[state.idx+1].text}` : '다음: —';

  // build spans
  trackEl.innerHTML = '';
  const chars = Array.from(s.text);
  chars.forEach((ch,i)=>{
    const sp = document.createElement('span');
    sp.className = 'char';
    sp.textContent = ch;
    sp.dataset.index = i;
    trackEl.appendChild(sp);
  });
  state.charIndex = 0;
  updateHighlight();
  updateCurrentWord();
}

function updateHighlight(){
  const spans = trackEl.querySelectorAll('.char');
  spans.forEach(sp=>{
    const i = Number(sp.dataset.index);
    sp.classList.remove('current','correct','incorrect');
    if(i < state.charIndex){
      if(sp.dataset.correct === '1') sp.classList.add('correct');
      else sp.classList.add('incorrect');
    }else if(i === state.charIndex){
      if(document.getElementById('showCaret')?.checked !== false) sp.classList.add('current');
    }
  });
  // slide: move so current char roughly 30% from left
  const charWidthEstimate = 26; // px estimate
  const containerWidth = document.querySelector('.sentence-viewport').clientWidth;
  const desiredLeft = Math.floor(containerWidth * 0.28);
  const shift = Math.max(0, state.charIndex * charWidthEstimate - desiredLeft);
  trackEl.style.transform = `translateX(${-shift}px)`;
}

function updateCurrentWord(){
  const s = state.sentences[state.idx].text;
  const chars = Array.from(s);
  const rest = chars.slice(state.charIndex).join('');
  const m = rest.match(/^\s*(\S+)/);
  const cur = m ? m[1] : '';
  currentWordEl.textContent = `현재 어절: ${cur || '—'}`;
}

function startTimer(){
  if(state.timer) return;
  state.startAt = Date.now();
  state.timer = setInterval(()=>{
    const elapsed = Math.floor((Date.now()-state.startAt)/1000);
    timeEl.textContent = `${elapsed}`;
    timeTopEl.textContent = `${elapsed}s`;
    const minutes = (Date.now()-state.startAt)/60000.0;
    const cpm = minutes>0 ? Math.round(state.correct / minutes) : 0;
    document.getElementById('cpm').textContent = isFinite(cpm)? cpm : 0;
    const acc = state.typed>0? Math.round(10000*state.correct/state.typed)/100 : 100;
    document.getElementById('acc').textContent = `${acc}%`;
  },250);
}

function stopTimer(){ if(state.timer){clearInterval(state.timer); state.timer = null; } }

function resetStats(){ state.typed = 0; state.correct = 0; state.startAt = null; stopTimer(); document.getElementById('cpm').textContent='0'; document.getElementById('time').textContent='0'; document.getElementById('acc').textContent='100%'; timeTopEl.textContent='0s'; }

function pushHistory(text){ state.history.unshift(text); if(state.history.length>6) state.history.pop(); renderHistory(); }
function renderHistory(){ recentList.innerHTML=''; state.history.forEach(t=>{ const li=document.createElement('li'); li.textContent=t; recentList.appendChild(li); }); }

function handleInputChar(ch){
  if(!state.startAt) startTimer();
  const s = state.sentences[state.idx].text;
  const expected = Array.from(s)[state.charIndex] || '';
  state.typed++;
  const curSpan = trackEl.querySelector(`.char[data-index="${state.charIndex}"]`);
  if(ch === expected){ state.correct++; if(curSpan) curSpan.dataset.correct = '1'; }
  else { if(curSpan) curSpan.dataset.correct = '0'; }
  state.charIndex++;
  updateHighlight();
  updateCurrentWord();

  // complete
  if(state.charIndex >= Array.from(s).length){
    const acc = state.typed>0? Math.round(10000*state.correct/state.typed)/100 : 100;
    pushHistory(`${s} — 정확도 ${acc}%`);
    stopTimer();
    setTimeout(()=>{
      if(autoNextCheckbox.checked) nextSentence(); else resetStats();
    },420);
  }
}

function handleBackspace(){
  if(state.charIndex===0) return;
  state.charIndex--;
  const sp = trackEl.querySelector(`.char[data-index="${state.charIndex}"]`);
  if(sp){ if(sp.dataset.correct === '1'){ state.correct = Math.max(0, state.correct-1); } if(state.typed>0) state.typed = Math.max(0, state.typed-1); delete sp.dataset.correct; }
  updateHighlight(); updateCurrentWord();
}

function nextSentence(){ state.idx = (state.idx+1) % state.sentences.length; resetStats(); renderSentence(); }

// IME handling
hiddenInput.addEventListener('compositionstart', ()=>{ state.composing = true; });
hiddenInput.addEventListener('compositionend', (e)=>{ state.composing = false; const text = e.data || hiddenInput.value || ''; for(const ch of Array.from(text)){ handleInputChar(ch); } hiddenInput.value=''; });

// keyboard handling
hiddenInput.addEventListener('keydown', (e)=>{
  if(state.composing) return;
  if(e.key === 'Backspace'){ e.preventDefault(); handleBackspace(); return; }
  if(e.key === 'Enter'){ e.preventDefault(); nextSentence(); return; }
  if(e.key.length === 1){ e.preventDefault(); handleInputChar(e.key); }
});

// focus to hidden input when clicking stage
document.getElementById('play-area').addEventListener('click', ()=> hiddenInput.focus());

// buttons
document.getElementById('btn-new').addEventListener('click', async ()=>{ resetStats(); await fetchSentences(); state.idx=0; renderSentence(); });
document.getElementById('btn-skip').addEventListener('click', ()=>{ nextSentence(); });
document.getElementById('btn-reset').addEventListener('click', ()=>{ resetStats(); renderSentence(); });

// init
(async function init(){ await fetchSentences(); renderSentence(); hiddenInput.focus(); })();
