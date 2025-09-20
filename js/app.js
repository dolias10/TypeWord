// app.js — v3: monochrome UI, visible input bar, keystroke-based CPM (counts keydown keystrokes)
// API
const API_URL = 'https://korean-advice-open-api.vercel.app/api/advice';

const state = {
  sentences: [],
  idx: 0,
  charIndex: 0,         // position in characters
  typedKeystrokes: 0,   // counts each keydown that is a printable key (including jamo keystrokes)
  correctKeystrokes: 0, // approximated by characters matched after composition/input
  startAt: null,
  timer: null,
  composing: false,
  prevInputValue: '',
  history: []
};

// DOM
const trackEl = document.getElementById('track');
const cpmEl = document.getElementById('cpm');
const accEl = document.getElementById('acc');
const timeEl = document.getElementById('time');
const authorEl = document.getElementById('author');
const authorProfileEl = document.getElementById('authorProfile');
const nextPreviewEl = document.getElementById('next-preview');
const visibleInput = document.getElementById('visible-input');
const recentList = document.getElementById('recent-list');

async function fetchSentences(){
  try{
    const res = await fetch(API_URL);
    if(!res.ok) throw new Error('network');
    const data = await res.json();
    const items = Array.isArray(data) ? data : [data];
    state.sentences = items.map(it => ({text: (it.message||'').trim(), author: it.author||'익명', profile: it.authorProfile||''})).filter(s=>s.text.length>0);
    if(state.sentences.length===0) throw new Error('no data');
  }catch(e){
    console.warn('API 실패 — 로컬 문장 사용', e);
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
  state.prevInputValue = '';
  visibleInput.value = '';
  updateHighlight();
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
      sp.classList.add('current');
    }
  });
  // slide to make current near left
  const charWidth = 24;
  const viewport = document.querySelector('.sentence-viewport').clientWidth;
  const desiredLeft = Math.floor(viewport * 0.24);
  const shift = Math.max(0, state.charIndex * charWidth - desiredLeft);
  trackEl.style.transform = `translateX(${ -shift }px)`;
}

function startTimer(){
  if(state.timer) return;
  state.startAt = Date.now();
  state.timer = setInterval(()=>{
    const elapsed = Math.floor((Date.now()-state.startAt)/1000);
    timeEl.textContent = `${elapsed}`;
    const minutes = Math.max(0.0001, (Date.now()-state.startAt)/60000.0);
    const cpm = Math.round(state.typedKeystrokes / minutes);
    cpmEl.textContent = isFinite(cpm)? cpm : 0;
    const acc = state.typedKeystrokes>0 ? Math.round(10000*state.correctKeystrokes/state.typedKeystrokes)/100 : 100;
    accEl.textContent = `${acc}%`;
  },250);
}

function stopTimer(){ if(state.timer){ clearInterval(state.timer); state.timer = null; } }

function resetStats(){ state.typedKeystrokes = 0; state.correctKeystrokes = 0; state.startAt = null; stopTimer(); cpmEl.textContent='0'; timeEl.textContent='0'; accEl.textContent='100%'; }

function pushHistory(text){ state.history.unshift(text); if(state.history.length>6) state.history.pop(); renderHistory(); }
function renderHistory(){ recentList.innerHTML=''; state.history.forEach(t=>{ const li=document.createElement('li'); li.textContent=t; recentList.appendChild(li); }); }

function applyInputChange(newVal){
  // Compare newVal vs expected string from current charIndex
  const s = state.sentences[state.idx].text;
  const prev = state.prevInputValue || '';
  const added = newVal.length - prev.length;
  if(added > 0){
    const addedText = newVal.slice(prev.length);
    for(const ch of Array.from(addedText)){
      const expected = Array.from(s)[state.charIndex] || '';
      if(ch === expected){
        state.correctKeystrokes++;
        const sp = trackEl.querySelector(`.char[data-index="${state.charIndex}"]`);
        if(sp) sp.dataset.correct = '1';
      }else{
        const sp = trackEl.querySelector(`.char[data-index="${state.charIndex}"]`);
        if(sp) sp.dataset.correct = '0';
      }
      state.charIndex++;
    }
  }else if(added < 0){
    const removeCount = Math.min(state.charIndex, prev.length - newVal.length);
    for(let i=0;i<removeCount;i++){
      state.charIndex = Math.max(0, state.charIndex-1);
      const sp = trackEl.querySelector(`.char[data-index="${state.charIndex}"]`);
      if(sp) delete sp.dataset.correct;
    }
  }else{
    if(newVal !== prev){
      let p = 0;
      while(p < newVal.length && p < s.length && newVal[p] === Array.from(s)[p]) p++;
      state.charIndex = p;
      for(let i=p;i<newVal.length;i++){
        const ch = newVal[i];
        const expected = Array.from(s)[i] || '';
        const sp = trackEl.querySelector(`.char[data-index="${i}"]`);
        if(ch === expected){ state.correctKeystrokes++; if(sp) sp.dataset.correct='1'; }
        else { if(sp) sp.dataset.correct='0'; }
      }
    }
  }
  state.prevInputValue = newVal;
  updateHighlight();
  // check completion
  if(state.charIndex >= Array.from(s).length){
    finishSentence();
  }
}

function handleKeydownForCount(e){
  const key = e.key;
  if(key.length === 1 || key === 'Backspace' || key === 'Enter' || key === ' '){
    state.typedKeystrokes++;
    if(!state.startAt) startTimer();
  }
  if(key === 'Enter'){
    e.preventDefault();
    finishSentence();
  }
}

function finishSentence(){
  const s = state.sentences[state.idx].text;
  const acc = state.typedKeystrokes>0 ? Math.round(10000*state.correctKeystrokes/state.typedKeystrokes)/100 : 100;
  pushHistory(`${s} — 정확도 ${acc}%`);
  stopTimer();
  // advance
  state.idx = (state.idx + 1) % state.sentences.length;
  resetStats();
  renderSentence();
  visibleInput.value = '';
  state.prevInputValue = '';
}

visibleInput.addEventListener('compositionstart', ()=>{ state.composing = true; });
visibleInput.addEventListener('compositionend', (e)=>{
  state.composing = false;
  applyInputChange(visibleInput.value);
});

visibleInput.addEventListener('input', (e)=>{
  if(state.composing) return;
  applyInputChange(visibleInput.value);
});

visibleInput.addEventListener('keydown', (e)=>{
  handleKeydownForCount(e);
});

document.addEventListener('DOMContentLoaded', async ()=>{
  await fetchSentences();
  renderSentence();
  visibleInput.focus();
});