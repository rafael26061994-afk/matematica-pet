// --- VARIÁVEIS DE ESTADO GLOBAL E CACHE DE ELEMENTOS ---
const screens = document.querySelectorAll('.screen');
const questionText = document.getElementById('question-text');
const answerOptions = document.querySelectorAll('.answer-option');
const timeBar = document.getElementById('time-bar');
const playerScoreElement = document.getElementById('player-score');
const playerXPElement = document.getElementById('player-xp');
const questionCounter = document.getElementById('question-counter');
const feedbackMessageElement = document.getElementById('feedback-message');
const alertSound = document.getElementById('alert-sound');
const librasAlert = document.getElementById('libras-alert');
// Remover mensagem visual de tempo baixo (mantém apenas som aos 5s finais)
if (librasAlert) librasAlert.textContent = '';


// Cache de botões e telas
const operationButtons = document.querySelectorAll('.operation-card');
const btnQuitGame = document.querySelector('.btn-quit-game');
const btnExtendTime = document.getElementById('btn-extend-time');
const btnShowAnswer = document.getElementById('btn-show-answer');
const btnVoltarHome = document.querySelectorAll('.btn-voltar-home');
const toggleVoiceRead = document.getElementById('toggle-voice-read');
const toggleNightMode = document.getElementById('toggle-night-mode');
const toggleLibras = document.getElementById('toggle-libras'); 
const modeRapidoBtn = document.getElementById('mode-rapido');
const modeEstudoBtn = document.getElementById('mode-estudo');
const levelButtons = document.querySelectorAll('.level-btn'); 

// Badge flutuante: Progresso do ciclo (Tabuada)
let cycleProgressBadge = null;

// Cache de elementos de erro
const btnTreinarErros = document.getElementById('btn-treinar-erros');
const errorCountMessage = document.getElementById('error-count-message');
const errorListContainer = document.getElementById('error-list-container');
const btnClearErrors = document.getElementById('btn-clear-errors');
const btnStartTraining = document.getElementById('btn-start-training');



// --- Helpers seguros (evitam quebrar quando algum botão não existir) ---
function safeOn(el, evt, fn) { if (el && el.addEventListener) el.addEventListener(evt, fn); }
function safeSetText(el, txt) { if (el) el.textContent = txt; }

// Variavel para síntese de voz (Web Speech API)
const synth = window.speechSynthesis;

// --- ESTADO DO JOGO ---
const gameState = {
    currentScreen: 'home-screen',
    currentOperation: '', 
    currentLevel: '', 
    isGameActive: false,
    score: 0,
    xp: 0,
    questionNumber: 0,
    totalQuestions: 20, 
    
    // Sessões especiais (campanha / minigame)
    sessionConfig: null,

    // Preferências de UI (texto/contraste/movimento)
    uiPrefs: { textScale: 1, highContrast: false, reduceMotion: false, layout: 'auto' },

    // Mentor (balão estilo Duolingo)
    mentor: { enabled: true, who: 'ronaldo', lastMsg: '' },
    wrongStreak: 0,
    forceEasy: 0,
    isVoiceReadActive: false,
    isRapidMode: true,
    errors: [],
    answerTimes: [],
    fastAnswers: 0,
    suspectSession: false,
 
    highScores: [], 

    // Timer (Modo Rápido)
    timer: null,
    timeLeft: 0, 
    maxTime: 0, 
    baseTimeStep: 1,      // 1 tick a cada 100ms (tempo normal)
    slowTimeStep: 0.5,    // 0.5 tick a cada 100ms (tempo mais lento)
    timeStep: 1,
    lowTimeAlerted: false,

    // Tentativas por questão (para permitir refazer)
    attemptsThisQuestion: 0,
    maxAttemptsPerQuestion: 2,
    answerLocked: false,

    // Treino de erros
    isTrainingErrors: false,
    trainingQueue: [],
    trainingIndex: 0,


    // Config da Tabuada (Multiplicação 0–20)
    multiplication: {
        mode: 'trail',      // 'trail' | 'direct'
        tabuada: 7,
        multMin: 0,
        multMax: 20,
        // Faixa de tabuadas por nível (Multiplicação)
        trailMin: 0,
        trailMax: 20,
        // Chave inclui faixa de tabuadas e multiplicadores
        trailRangeKey: '0-20|0-20',
        // Trilha: ordem embaralhada de TODAS as contas da faixa (ex.: 0–5 com ×0–10)
        // Formato: [[tabuada, multiplicador], ...]
        trailPairs: [],
        trailPairIndex: 0,
        // Modo direto: ordem embaralhada dos multiplicadores da tabuada escolhida
        roundMultipliers: [],
        roundPos: 0,
        pendingLevel: null
    },


    // Pools fixos (50 questões) para Adição/Subtração por nível
    addSubPools: {
        addition: { easy: [], medium: [], advanced: [] },
        subtraction: { easy: [], medium: [], advanced: [] },
        idx: { addition: { easy: 0, medium: 0, advanced: 0 }, subtraction: { easy: 0, medium: 0, advanced: 0 } },
        size: 50
    },



    acertos: 0,
    erros: 0
};



/* ===========================
   MODO ESTUDO — TRAVAS PET (v20.12)
   Sequência: Adição → Subtração → Multiplicação → Divisão → Potenciação → Radiciação
   Multiplicação (estudo): tabuadas 1→10 na ordem 1,2,5,10,3,4,6,7,8,9 com avanço por domínio (>=80%).
   Revisão final: cada erro precisa ser acertado 3x (aleatório).
=========================== */
const STUDY_KEY = 'pet_study_progress_v1';

function _studyDefault(){
  return {
    unlocked:{addition:true, subtraction:false, multiplication:false, division:false, potenciacao:false, radiciacao:false},
    mediumPass:{addition:0, subtraction:0, division:0, potenciacao:0, radiciacao:0},
    advUnlocked:{addition:false, subtraction:false, division:false, potenciacao:false, radiciacao:false},
    mul:{order:[1,2,5,10,3,4,6,7,8,9], idx:0, phase:'train', review:{}}
  };
}
function studyLoad(){
  try{ const raw=LS.get(STUDY_KEY); if(!raw) return _studyDefault();
       const obj=JSON.parse(raw); return Object.assign(_studyDefault(), obj);
  }catch(_){ return _studyDefault(); }
}
function studySave(st){ try{ LS.set(STUDY_KEY, JSON.stringify(st)); }catch(_){ } }
function isStudy(){ return gameState && gameState.isRapidMode===false; }
function studyCanOp(op){ const st=studyLoad(); return !!(st.unlocked && st.unlocked[op]); }
function studyLockUI(){
  try{ const st=studyLoad();
    operationButtons.forEach(btn=>{
      const op=btn.getAttribute('data-operation');
      const locked=isStudy() && st.unlocked && st.unlocked[op]===false;
      btn.classList.toggle('pet-locked', locked);
      btn.setAttribute('aria-disabled', locked?'true':'false');
    });
  }catch(_){ }
}
function studyCanAdvanced(op){ const st=studyLoad(); return !!(st.advUnlocked && st.advUnlocked[op]); }
function studyRegisterMedium(op, acc, suspect){
  if(!isStudy() || suspect) return;
  if(!Number.isFinite(acc) || acc<0.80) return;
  const st=studyLoad();
  if(st.mediumPass && (op in st.mediumPass)) st.mediumPass[op]=(st.mediumPass[op]||0)+1;
  if(st.mediumPass && st.mediumPass[op]>=2) st.advUnlocked[op]=true;
  if(op==='addition' && st.mediumPass[op]>=2) st.unlocked.subtraction=true;
  if(op==='subtraction' && st.mediumPass[op]>=2) st.unlocked.multiplication=true;
  if(op==='division' && st.mediumPass[op]>=2) st.unlocked.potenciacao=true;
  if(op==='potenciacao' && st.mediumPass[op]>=2) st.unlocked.radiciacao=true;
  studySave(st); studyLockUI();
}
function studyMulCurrent(){
  const st=studyLoad();
  const idx=Math.max(0, Math.min((st.mul.order.length-1), st.mul.idx||0));
  return st.mul.order[idx]||1;
}
function studyMulRecordError(q){
  try{ if(!isStudy()) return;
    if(!gameState.sessionConfig || gameState.sessionConfig.type!=='study_mul') return;
    if(!q || q.operacao!=='multiplication') return;
    const a=Number(q.num1), b=Number(q.num2);
    if(!Number.isFinite(a)||!Number.isFinite(b)) return;
    const key=`${a} x ${b}`;
    const st=studyLoad();
    if(!st.mul) st.mul=_studyDefault().mul;
    if(!(key in st.mul.review)) st.mul.review[key]=3;
    studySave(st);
  }catch(_){ }
}
function studyMulPickReviewPair(){
  const st=studyLoad();
  const keys=Object.keys(st.mul.review||{}).filter(k=> (st.mul.review[k]||0)>0);
  if(keys.length===0) return null;
  const k=keys[Math.floor(Math.random()*keys.length)];
  const m=k.match(/^(\d+) x (\d+)$/);
  if(!m) return null;
  return [parseInt(m[1],10), parseInt(m[2],10), k];
}
function studyMulOnCorrectReview(key){
  try{ const st=studyLoad(); if(!st.mul||!st.mul.review) return;
    if(key in st.mul.review){ st.mul.review[key]=Math.max(0,(st.mul.review[key]||0)-1); }
    studySave(st);
  }catch(_){ }
}
function studyStartMultiplication(){
  const st=studyLoad();
  if(!st.mul) st.mul=_studyDefault().mul;
  // se acabou treino, vai para revisão
  if(st.mul.phase==='train' && (st.mul.idx||0)>=st.mul.order.length) st.mul.phase='review';
  // se revisão sem pendências, conclui e libera divisão
  if(st.mul.phase==='review'){
    const pending=Object.keys(st.mul.review||{}).filter(k=> (st.mul.review[k]||0)>0);
    if(pending.length===0){
      st.mul.phase='done'; st.unlocked.division=true; studySave(st); studyLockUI();
      showFeedbackMessage('Multiplicação concluída! Divisão liberada no Modo Estudo.', 'incentive', 3200);
      exibirTela('home-screen');
      return;
    }
    gameState.sessionConfig={type:'study_mul', phase:'review'};
    gameState.multiplication.mode='direct'; gameState.multiplication.directLock=true;
    gameState.multiplication.lockTabuada=1; // placeholder, o gerador vai usar override
    startGame('multiplication','medium');
    gameState.totalQuestions=10;
    return;
  }
  // treino
  const t=studyMulCurrent();
  gameState.sessionConfig={type:'study_mul', phase:'train', tabuada:t};
  gameState.multiplication.mode='direct'; gameState.multiplication.directLock=true;
  gameState.multiplication.lockTabuada=t; gameState.multiplication.tabuada=t;
  startGame('multiplication', (t<=5?'easy':'medium'));
  gameState.totalQuestions=10;
}
function studyMulEndSession(acc, suspect){
  try{ const st=studyLoad(); if(!st.mul) st.mul=_studyDefault().mul;
    if(suspect){ studySave(st); return; }
    if(st.mul.phase==='train'){
      if(acc>=0.80) st.mul.idx=(st.mul.idx||0)+1;
      if(st.mul.idx>=st.mul.order.length) st.mul.phase='review';
      // ao concluir treino libera divisão apenas depois da revisão
    }
    if(st.mul.phase==='done') st.unlocked.division=true;
    studySave(st); studyLockUI();
  }catch(_){ }
}


// --- FUNÇÕES UTILITY E ACESSIBILIDADE ---

/** Exibe uma tela e oculta as outras */

/* ---------------------------- Onboarding (v20) --------------------------- */
const ONBOARD_KEY = 'pet_onboarded_v1';
function shouldShowOnboarding(){
  try{ return LS.get(ONBOARD_KEY) !== '1'; }catch(_){ return true; }
}
function markOnboardingDone(){
  try{ LS.set(ONBOARD_KEY,'1'); }catch(_){}
}
function showOnboarding(){
  const modal = document.getElementById('onboarding-modal');
  if(!modal) return;
  const title = document.getElementById('onb-title');
  const text = document.getElementById('onb-text');
  const nextBtn = document.getElementById('onb-next');
  const skipBtn = document.getElementById('onb-skip');
  const dots = [document.getElementById('onb-dot-1'),document.getElementById('onb-dot-2'),document.getElementById('onb-dot-3')];

  const steps = [
    {t:'PET: estudo curto e eficiente', d:'Você faz sessões de 10 a 20 minutos. Errar faz parte: o app te dá pistas e reforço, sem punição.'},
    {t:'Como avançar (domínio real)', d:'Você só conclui uma lição quando acerta bem e mantém estabilidade. Se travar, o app abre uma Missão de Reforço.'},
    {t:'Dica de ouro', d:'Não chute. Pense e use as estratégias (completar 10, vai‑um, empréstimo, âncoras da tabuada). Isso acelera seu progresso.'}
  ];
  let i=0;
  function render(){
    dots.forEach((el,idx)=>{ if(el) el.classList.toggle('active', idx===i); });
    if(title) title.textContent = steps[i].t;
    if(text) text.textContent = steps[i].d;
    if(nextBtn) nextBtn.textContent = (i===steps.length-1)?'Começar':'Próximo';
  }
  function close(){
    modal.classList.add('hidden');
    markOnboardingDone();
    try{ modal.setAttribute('aria-hidden','true'); }catch(_){}
  }
  if(skipBtn) skipBtn.onclick = close;
  if(nextBtn) nextBtn.onclick = ()=>{ if(i<steps.length-1){ i++; render(); } else { close(); } };
  modal.classList.remove('hidden');
  try{ modal.setAttribute('aria-hidden','false'); }catch(_){}
  render();
}
document.addEventListener('DOMContentLoaded', ()=>{
    wireDifficultiesModal();
    initSchoolStudentSelector();

  try{
    // A11y: garantir aria-label nas alternativas
    document.querySelectorAll('.answer-option').forEach((btn,idx)=>{
      if(btn && !btn.getAttribute('aria-label')) btn.setAttribute('aria-label', `Alternativa ${idx+1}`);
    });
  }catch(_){}
  initUIModePicker();
  if(shouldShowOnboarding()) showOnboarding();
});


/* --------------------------- Modo de uso (Celular/PC) --------------------------- */
const MODE_KEY = 'pet_ui_mode_v1'; // 'mobile' | 'pc'

// ===============================
// PET Escolar Offline v1 — Key resolver + seletor de aluno (per student)
// ===============================
const SCHOOL_KEY = 'pet_school_v1';

// Keys that should be scoped by active student (avoid mixing data on shared devices)
const PER_STUDENT_KEYS = new Set([
  'matemagica_profile_v1',
  'matemagica_sessions_v1',
  'matemagica_attempts_v1',
  'matemagica_mastery_v1',
  'matemagica_missions_v1',
  'matemagica_mult_progress_map_v1',
  'matemagica_path_progress_v1',
  'matemagica_daily_v1',
  'matemagica_mentor_v1',
  'matemagica_high_scores_v1',
  'matemagica_xp',
  'matemagica_errors',
  'matemagica_diff_focus',
  'matemagica_mult_cfg',
  'pet_study_progress_v1',
  'pet_seen_train_ids_v1'
]);

function schoolLoad(){
  try{ const raw = LS.get(SCHOOL_KEY); return raw ? JSON.parse(raw) : null; }catch(_){ return null; }
}
function schoolSave(obj){
  try{ LS.set(SCHOOL_KEY, JSON.stringify(obj)); }catch(_){ }
}
function activeStudentId(){
  const sch = schoolLoad();
  const sid = sch && sch.active && sch.active.studentId;
  return sid ? String(sid) : null;
}
function keyFor(baseKey){
  if(!baseKey || typeof baseKey !== 'string') return baseKey;
  if(!PER_STUDENT_KEYS.has(baseKey)) return baseKey;
  const sid = activeStudentId();
  if(!sid) return baseKey;
  return `${baseKey}__${sid}`;
}

// Storage facade (drop-in replacement)
const LS = {
  get(key){ try{ return LS.get(keyFor(key)); }catch(_){ return null; } },
  set(key, val){ try{ LS.set(keyFor(key), val); }catch(_){ } },
  remove(key){ try{ LS.remove(keyFor(key)); }catch(_){ } }
};

// UI: seletor de aluno (se existir no index)
function initSchoolStudentSelector(){
  try{
    const sel = document.getElementById('pet-student-select');
    const bar = document.getElementById('pet-school-bar');
    const warn = document.getElementById('pet-school-warning');
    if(!sel || !bar) return; // app não está em modo escola UI

    const sch = schoolLoad();
    const classes = (sch && Array.isArray(sch.classes)) ? sch.classes : [];
    const active = (sch && sch.active) ? sch.active : null;

    // Sem configuração
    if(classes.length === 0){
      bar.hidden = true;
      if(warn) warn.hidden = false;
      return;
    }

    // Build options (Turma • Aluno)
    const options = [];
    classes.forEach(c=>{
      (c.students||[]).forEach(st=>{
        options.push({
          classId: c.classId,
          studentId: st.studentId,
          label: `${c.className || c.classId} • ${st.name || st.studentId}`
        });
      });
    });

    if(options.length === 0){
      bar.hidden = true;
      if(warn) warn.hidden = false;
      return;
    }

    sel.innerHTML = options.map(o=>{
      const selected = active && active.studentId===o.studentId ? 'selected' : '';
      return `<option value="${o.studentId}" data-class="${o.classId}" ${selected}>${o.label}</option>`;
    }).join('');

    // Garantir active student válido
    if(!active || !active.studentId){
      const first = options[0];
      sch.active = { classId: first.classId, studentId: first.studentId };
      schoolSave(sch);
      sel.value = first.studentId;
    }

    sel.addEventListener('change', ()=>{
      const sid = sel.value;
      const opt = sel.options[sel.selectedIndex];
      const cid = opt ? opt.getAttribute('data-class') : null;
      const sch2 = schoolLoad() || { classes: [] };
      sch2.active = { classId: cid, studentId: sid };
      schoolSave(sch2);
      // reload para aplicar key scoping imediatamente
      try{ location.reload(); }catch(_){}
    });

    if(warn) warn.hidden = true;
    bar.hidden = false;
  }catch(_){}
}
// ===============================
function getDefaultMode(){
  try{
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.innerWidth && window.innerWidth < 900;
    return (coarse || narrow) ? 'mobile' : 'pc';
  }catch(_){ return 'mobile'; }
}
function getUIMode(){
  try{
    const v = LS.get(MODE_KEY);
    return (v==='mobile' || v==='pc') ? v : null;
  }catch(_){ return null; }
}
function setUIMode(mode){
  if(mode!=='mobile' && mode!=='pc') return;
  try{ LS.set(MODE_KEY, mode); }catch(_){}
  applyUIMode(mode);
}
function applyUIMode(mode){
  if(mode!=='mobile' && mode!=='pc') mode = getDefaultMode();
  document.body.dataset.uiMode = mode;
  document.body.classList.toggle('ui-mobile', mode==='mobile');
  document.body.classList.toggle('ui-pc', mode==='pc');

  const bM = document.getElementById('btn-mode-mobile');
  const bP = document.getElementById('btn-mode-pc');
  if(bM) bM.classList.toggle('active', mode==='mobile');
  if(bP) bP.classList.toggle('active', mode==='pc');
}
function initUIModePicker(){
  const saved = getUIMode();
  applyUIMode(saved || getDefaultMode());

  const bM = document.getElementById('btn-mode-mobile');
  const bP = document.getElementById('btn-mode-pc');
  if(bM) bM.addEventListener('click', ()=> setUIMode('mobile'));
  if(bP) bP.addEventListener('click', ()=> setUIMode('pc'));

  // PC: setas para navegar nas alternativas
  document.addEventListener('keydown', (e)=>{
    try{
      const mode = document.body.dataset.uiMode;
      if(mode!=='pc') return;
      const activeScreen = gameState.currentScreen;
      if(activeScreen!=='game-screen') return;
      const opts = Array.from(document.querySelectorAll('.answer-option')).filter(Boolean);
      if(opts.length===0) return;

      const key = e.key;
      const navKeys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
      if(!navKeys.includes(key) && key!=='Enter' && key!==' ') return;

      const focused = document.activeElement;
      let idx = opts.indexOf(focused);
      if(key==='Enter' || key===' '){
        if(idx>=0) { e.preventDefault(); focused.click(); }
        return;
      }
      e.preventDefault();
      if(idx<0) idx = 0;
      if(key==='ArrowRight' || key==='ArrowDown') idx = (idx+1) % opts.length;
      if(key==='ArrowLeft' || key==='ArrowUp') idx = (idx-1+opts.length) % opts.length;
      opts[idx].focus();
    }catch(_){}
  });
}

function exibirTela(id) {
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(id);
    if (targetScreen) {
        targetScreen.classList.add('active');
        gameState.currentScreen = id;
        try { setBottomNavActive(id); } catch (_) {}
}

    // Esconde o badge de progresso fora da tela de jogo
    if (id !== 'game-screen') {
        try { hideCycleProgressBadge(); } catch (_) {}
    }
    // Sempre que voltarmos para a home ou resultados, atualiza o botão de treino
    if (id === 'home-screen' || id === 'result-screen') {
        updateErrorTrainingButton();
    }
}

/** Reproduz o som de alerta */
function playAlertSound() {
    if (alertSound) {
        alertSound.currentTime = 0;
        alertSound.play().catch(e => console.error("Erro ao tocar áudio:", e));
    }
}

/** Função de Text-to-Speech (Leitura de Voz) */
function speak(text) {
    if (!gameState.isVoiceReadActive || !synth) return;

    // Evita cortar falas de forma agressiva (alguns navegadores podem “engolir” a primeira fala)
    try {
        if (synth.speaking || synth.pending) synth.cancel();
    } catch (_) {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0; 
    
    synth.speak(utterance);
}


/** Fala uma sequência de mensagens (pergunta → alternativas) de forma confiável. */
let __voiceQueueToken = 0;
function speakSequence(texts) {
    if (!gameState.isVoiceReadActive || !synth) return;
    if (!Array.isArray(texts) || texts.length === 0) return;

    // Token para evitar que uma sequência antiga continue após iniciar uma nova
    const token = ++__voiceQueueToken;

    // Interrompe qualquer leitura anterior
    try { synth.cancel(); } catch (_) {}

    let i = 0;

    const speakNext = () => {
        if (token !== __voiceQueueToken) return;
        if (!gameState.isVoiceReadActive || !synth) return;
        if (i >= texts.length) return;

        const utterance = new SpeechSynthesisUtterance(String(texts[i]));
        utterance.lang = 'pt-BR';
        utterance.rate = 1.0;

        utterance.onend = () => { i++; speakNext(); };
        utterance.onerror = () => { i++; speakNext(); };

        try { synth.speak(utterance); } catch (_) {}
    };

    // Pequeno delay após cancel() (melhora compatibilidade: em alguns navegadores a 1ª fala pode ser "comida")
    setTimeout(speakNext, 80);
}

/** Monta textos para leitura de voz: 1) pergunta 2) alternativas (1–4). */
function buildVoiceTextsForQuestion(questionObj) {
    if (!questionObj) return [];

    const qCore = (questionObj.voiceQuestion || questionObj.question || '').toString().replace(/\s+/g, ' ').trim();
    const opts = (questionObj.voiceOptions || questionObj.options || []).map(v => String(v));

    // Pergunta primeiro (sempre)
    const qText = qCore
        ? `Questão ${gameState.questionNumber}. Quanto é ${qCore}?`
        : `Questão ${gameState.questionNumber}.`;

    // Alternativas depois, uma por vez (mais claro e mais estável no TTS)
    const optionTexts = (opts.length === 4)
        ? [
            `Opção 1: ${opts[0]}.`,
            `Opção 2: ${opts[1]}.`,
            `Opção 3: ${opts[2]}.`,
            `Opção 4: ${opts[3]}.`
        ]
        : [];

    return [qText, ...optionTexts].filter(Boolean);
}

/** Lê novamente a questão atual (atalho: tecla R). */
function announceCurrentQuestion() {
    if (!gameState.currentQuestion) return;
    speakSequence(buildVoiceTextsForQuestion(gameState.currentQuestion));
}


/** Exibe mensagens de feedback */
function showFeedbackMessage(message, type, duration = 3000) {
    if (!feedbackMessageElement) return;

    feedbackMessageElement.className = 'feedback-message hidden';
    feedbackMessageElement.classList.add(type);
    feedbackMessageElement.textContent = message;

    setTimeout(() => {
        feedbackMessageElement.classList.remove('hidden');
        feedbackMessageElement.classList.add('show');
    }, 50);

    setTimeout(() => {
        feedbackMessageElement.classList.remove('show');
        setTimeout(() => feedbackMessageElement.classList.add('hidden'), 300);
    }, duration);
}


// --- LÓGICA DE PERSISTÊNCIA (Local Storage) ---
// --- PERFIL DO ESTUDANTE (opcional) ---
const PROFILE_STORAGE_KEY = 'matemagica_profile_v1';

// --- HISTÓRICO DE SESSÕES (para Relatório/Painel do Professor) ---
const SESSIONS_KEY = 'matemagica_sessions_v1';

function loadSessions() {
    try {
        const raw = LS.get(SESSIONS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

function saveSessions(arr) {
    try { LS.set(SESSIONS_KEY, JSON.stringify(arr)); } catch (_) {}
}

function appendSession(sessionObj) {
    const arr = loadSessions();
    arr.unshift(sessionObj);
    // limita histórico
    if (arr.length > 500) arr.length = 500;
    saveSessions(arr);
}


function loadStudentProfile() {
    try {
        const raw = LS.get(PROFILE_STORAGE_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        gameState.studentProfile = {
            name: String(obj?.name || '').trim(),
            turma: String(obj?.turma || '').trim(),
            escola: String(obj?.escola || '').trim()
        };
    } catch (e) {
        gameState.studentProfile = { name: '', turma: '', escola: '' };
    }
    return gameState.studentProfile;
}

function saveStudentProfile(profile) {
    const safe = {
        name: String(profile?.name || '').trim().slice(0, 50),
        turma: String(profile?.turma || '').trim().slice(0, 30),
        escola: String(profile?.escola || '').trim().slice(0, 60)
    };
    LS.set(PROFILE_STORAGE_KEY, JSON.stringify(safe));
    gameState.studentProfile = safe;
    return safe;
}

function getStudentProfile() {
    return gameState.studentProfile || loadStudentProfile();
}


// --- PROGRESSO POR TRILHA DA TABUADA (salva por faixa/nível) ---
const MULT_PROGRESS_KEY = 'matemagica_mult_progress_map_v1';

function loadMultProgressMap() {
    try {
        const raw = LS.get(MULT_PROGRESS_KEY);
        const map = raw ? JSON.parse(raw) : {};
        gameState.multiplication.progressByKey = (map && typeof map === 'object') ? map : {};
    } catch (e) {
        gameState.multiplication.progressByKey = {};
    }
    return gameState.multiplication.progressByKey;
}

function saveMultProgressMap() {
    try {
        LS.set(MULT_PROGRESS_KEY, JSON.stringify(gameState.multiplication.progressByKey || {}));
    } catch (e) {
        console.warn("Falha ao salvar progresso da tabuada por chave:", e);
    }
}

function getSavedTrailIndexForKey(key, expectedLen) {
    if (!gameState.multiplication.progressByKey) loadMultProgressMap();
    const idx = Number(gameState.multiplication.progressByKey?.[key] ?? 0);
    if (!Number.isFinite(idx) || idx < 0) return 0;
    if (Number.isInteger(expectedLen) && expectedLen > 0 && idx >= expectedLen) return 0; // ciclo completo -> reinicia
    return Math.floor(idx);
}

function setSavedTrailIndexForKey(key, idx) {
    if (!gameState.multiplication.progressByKey) loadMultProgressMap();
    const n = Number(idx);
    gameState.multiplication.progressByKey[key] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    saveMultProgressMap();
}


// --- MAPA (TRILHA) NO ESTILO DUOLINGO (clean) ---
const PATH_PROGRESS_KEY = 'matemagica_path_progress_v1';

function loadPathProgress() {
    try {
        const raw = LS.get(PATH_PROGRESS_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
        return {};
    }
}

function savePathProgress(obj) {
    try { LS.set(PATH_PROGRESS_KEY, JSON.stringify(obj || {})); } catch (e) {}
}

function getPathDone(operation, level) {
    const data = loadPathProgress();
    return Math.max(0, Math.min(10, Number(data?.[operation]?.[level] ?? 0)));
}

function setPathDone(operation, level, done) {
    const data = loadPathProgress();
    if (!data[operation]) data[operation] = {};
    data[operation][level] = Math.max(0, Math.min(10, Number(done) || 0));
    savePathProgress(data);
}

function ensureLearningMapUI() {
    const screen = document.getElementById('level-selection-screen');
    if (!screen) return;

    let card = document.getElementById('learning-map-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'learning-map-card';
        card.className = 'info-card map-card';
        card.innerHTML = `
            <div class="map-header">
                <h2>Trilha (mapa)</h2>
                <p class="map-sub">Visualize seu progresso e avance passo a passo.</p>
            </div>
            <div id="learning-map-rows" class="map-rows"></div>
        `;
        // insere após o header do level-selection
        const header = screen.querySelector('header');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(card, header.nextSibling);
        } else {
        gameState.wrongStreak = (gameState.wrongStreak || 0) + 1;
        if (gameState.wrongStreak >= 3) {
            // v19.1 — anti-frustração: próxima(s) questão(ões) mais fáceis sem avisar
            gameState.forceEasy = 2;
            gameState.wrongStreak = 0;
        try{ gameState.__tagStreak = {}; gameState.__inMicro = false; }catch(_){ }
        }
            screen.appendChild(card);
        }
    }
}

function renderLearningMapPreview(operation) {
    ensureLearningMapUI();
    const rowsEl = document.getElementById('learning-map-rows');
    if (!rowsEl) return;

    const levels = [
        { key: 'easy', label: 'Fácil' },
        { key: 'medium', label: 'Médio' },
        { key: 'advanced', label: 'Difícil' }
    ];

    const makeNodes = (done, total = 10) => {
        const nodes = [];
        for (let i = 0; i < total; i++) {
            let cls = 'map-node locked';
            if (i < done) cls = 'map-node done';
            if (i === done) cls = 'map-node current';
            nodes.push(`<span class="${cls}" aria-hidden="true"></span>`);
        }
        return nodes.join('');
    };

    rowsEl.innerHTML = levels.map(lvl => {
        let meta = '';
        let done = 0;

        if (operation === 'multiplication') {
            const r = getTabuadaRangeByLevel(lvl.key);
            const key = `${r.min}-${r.max}|${r.multMin}-${r.multMax}`;
            const bankSize = (r.max - r.min + 1) * (r.multMax - r.multMin + 1);
            const idx = getSavedTrailIndexForKey(key, bankSize);
            const ratio = bankSize > 0 ? (idx / bankSize) : 0;
            done = Math.max(0, Math.min(10, Math.floor(ratio * 10)));
            meta = `${idx}/${bankSize}`;
        } else {
            done = getPathDone(operation, lvl.key);
            meta = `${done}/10`;
        }

        return `
          <div class="map-row" data-level="${lvl.key}">
            <div class="map-label">${lvl.label}</div>
            <div class="map-nodes" aria-label="Progresso ${lvl.label}">${makeNodes(done, 10)}</div>
            <div class="map-meta">${meta}</div>
          </div>
        `;
    }).join('');

    // clique na linha -> seleciona o nível correspondente
    rowsEl.querySelectorAll('.map-row').forEach(row => {
        row.addEventListener('click', () => {
            const lvl = row.getAttribute('data-level');
            const btn = document.querySelector(`.level-card[data-level="${lvl}"]`);
            if (btn) btn.click();
        });
    });
}


// --- UI: botão Perfil do estudante (opcional) ---
function ensureProfileUI() {
    if (document.getElementById('btn-student-profile')) return;

    const bar = document.querySelector('.settings-bar');
    if (!bar) return;

    const btn = document.createElement('button');
    btn.id = 'btn-student-profile';
    btn.className = 'setting-btn';
    btn.type = 'button';
    btn.innerHTML = '<span class="icon">👤</span> Perfil';
    bar.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.id = 'profile-overlay';
    overlay.className = 'teacher-overlay hidden'; // reaproveita overlay
    overlay.innerHTML = `
      <div class="teacher-panel profile-panel" role="dialog" aria-modal="true" aria-label="Perfil do Estudante">
        <div class="teacher-panel-header">
          <h3>Perfil do estudante (opcional)</h3>
          <button id="profile-close" class="teacher-close" type="button" aria-label="Fechar">✕</button>
        </div>

        <p class="teacher-help">
          Preencha apenas se quiser que os resultados apareçam com identificação no relatório do professor.
        </p>

        <div class="teacher-panel-section">
          <label class="tp-label">Nome (ou apelido)</label>
          <input id="profile-name" class="tp-input" type="text" maxlength="50" placeholder="Ex.: Ana, João, Estudante 12">
          <label class="tp-label">Turma</label>
          <input id="profile-turma" class="tp-input" type="text" maxlength="30" placeholder="Ex.: 701, 8ºA">
          <label class="tp-label">Escola</label>
          <input id="profile-escola" class="tp-input" type="text" maxlength="60" placeholder="Ex.: E.M. ...">
          <div class="teacher-row" style="margin-top: 12px;">
            <button id="profile-save" class="btn-action" type="button">Salvar</button>
            <button id="profile-clear" class="btn-action btn-secondary" type="button">Limpar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const open = () => {
        loadStudentProfile();
        overlay.classList.remove('hidden');
        overlay.querySelector('#profile-name').value = gameState.studentProfile?.name || '';
        overlay.querySelector('#profile-turma').value = gameState.studentProfile?.turma || '';
        overlay.querySelector('#profile-escola').value = gameState.studentProfile?.escola || '';
    };
    const close = () => overlay.classList.add('hidden');

    btn.addEventListener('click', open);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#profile-close').addEventListener('click', close);

    overlay.querySelector('#profile-save').addEventListener('click', () => {
        saveStudentProfile({
            name: overlay.querySelector('#profile-name').value,
            turma: overlay.querySelector('#profile-turma').value,
            escola: overlay.querySelector('#profile-escola').value
        });
        showFeedbackMessage('Perfil salvo!', 'success', 1500);
        close();
    });

    overlay.querySelector('#profile-clear').addEventListener('click', () => {
        saveStudentProfile({ name: '', turma: '', escola: '' });
        overlay.querySelector('#profile-name').value = '';
        overlay.querySelector('#profile-turma').value = '';
        overlay.querySelector('#profile-escola').value = '';
        showFeedbackMessage('Perfil removido.', 'info', 1500);
    });
}


function carregarXP() {
    gameState.xp = parseInt(LS.get('matemagica_xp')) || 0;
    playerXPElement.textContent = `XP: ${gameState.xp}`;
}
function atualizarXP(amount) {
    gameState.xp += amount;
    playerXPElement.textContent = `XP: ${gameState.xp}`;
    LS.set('matemagica_xp', gameState.xp);
}

/** Carrega os erros do jogador do Local Storage. */
function carregarErros() {
    try {
        const errorsJson = LS.get('matemagica_errors');
        if (errorsJson) {
            gameState.errors = JSON.parse(errorsJson);
        }
    } catch (e) {
        console.error("Erro ao carregar erros do localStorage:", e);
        gameState.errors = [];
    }
}

/** Salva os erros atuais no Local Storage. */
function salvarErros() {
    try {
        // Limita o número de erros salvos para não sobrecarregar o localStorage
        const errorsToSave = gameState.errors.slice(-50); 
        LS.set('matemagica_errors', JSON.stringify(errorsToSave));
    } catch (e) {
        console.error("Erro ao salvar erros no localStorage:", e);
    }
}

// --- RANKING (Recordes + Histórico Local) ---
const RANKING_STORAGE_KEY = 'matemagica_high_scores_v1';

/** Carrega ranking (recordes) do localStorage */
function carregarRanking() {
    try {
        const raw = LS.get(RANKING_STORAGE_KEY);
        gameState.highScores = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(gameState.highScores)) gameState.highScores = [];
    } catch (e) {
        console.warn('Falha ao carregar ranking:', e);
        gameState.highScores = [];
    }
}

/** Salva ranking no localStorage */
function salvarRanking() {
    try {
        LS.set(RANKING_STORAGE_KEY, JSON.stringify(gameState.highScores || []));
    } catch (e) {
        console.warn('Falha ao salvar ranking:', e);
    }
}

/** Adiciona uma partida no histórico e mantém os melhores no topo */
function registrarPartidaNoRanking(entry) {
    if (!entry) return;

    // Normaliza campos
    const safe = {
        timestamp: entry.timestamp || Date.now(),
        score: Number(entry.score || 0),
        operation: entry.operation || 'unknown',
        level: entry.level || 'unknown',
        mode: entry.mode || (gameState.isRapidMode ? 'rapido' : 'estudo'),
        submode: entry.submode || '',
        acertos: Number(entry.acertos || 0),
        erros: Number(entry.erros || 0),
        total: Number(entry.total || 0),
        accuracy: Number(entry.accuracy || 0),
        studentName: (getStudentProfile().name || ''),
        studentTurma: (getStudentProfile().turma || ''),
        studentEscola: (getStudentProfile().escola || '')
    };

    gameState.highScores.unshift(safe);

    // Ordena por score desc, depois por acurácia desc, depois mais recente
    gameState.highScores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        return b.timestamp - a.timestamp;
    });

    // Mantém até 60 registros (suficiente para histórico local)
    if (gameState.highScores.length > 60) gameState.highScores = gameState.highScores.slice(0, 60);

    salvarRanking();
}

/** Renderiza o ranking na tela */
function renderRanking() {
    const container = document.getElementById('ranking-list-container');
    const noMsg = document.getElementById('no-records-message');
    if (!container || !noMsg) return;

    container.innerHTML = '';

    const list = gameState.highScores || [];
    if (list.length === 0) {
        noMsg.classList.remove('hidden');
        return;
    }
    noMsg.classList.add('hidden');

    // Mostra TOP 10 + Histórico recente (até 20)
    const top10 = list.slice(0, 10);
    const recent = list.slice(0, 20);

    const makeHeader = (txt) => {
        const h = document.createElement('h2');
        h.textContent = txt;
        h.style.margin = '14px 0 8px';
        h.style.fontSize = '1.1em';
        return h;
    };

    const makeItem = (e, idx) => {
        const item = document.createElement('div');
        item.className = 'ranking-item';
        const d = new Date(e.timestamp);
        const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const whoParts = [];
        if (e.studentName) whoParts.push(`Estudante: ${e.studentName}`);
        if (e.studentTurma) whoParts.push(`Turma: ${e.studentTurma}`);
        if (e.studentEscola) whoParts.push(`Escola: ${e.studentEscola}`);
        const whoStr = whoParts.length ? (whoParts.join(' • ') + ' • ') : '';

        const opMap = {
            addition: 'Adição (+)',
            subtraction: 'Subtração (−)',
            multiplication: 'Multiplicação (×)',
            division: 'Divisão (÷)',
            potenciacao: 'Potenciação',
            radiciacao: 'Radiciação'
        };

        const opLabel = opMap[e.operation] || e.operation;
        const lvlMap = { easy: 'Fácil', medium: 'Médio', advanced: 'Difícil' };
        const lvl = lvlMap[e.level] || e.level;

        item.innerHTML = `
            <div class="ranking-left">
                <div class="ranking-title"><strong>#${idx + 1}</strong> • ${opLabel} • ${lvl} • ${e.mode}${e.submode ? ' • ' + e.submode : ''}</div>
                <div class="ranking-meta">${whoStr}${dateStr} • Acertos: ${e.acertos}/${e.total} • Erros: ${e.erros} • Precisão: ${Math.round(e.accuracy)}%</div>
            </div>
            <div class="ranking-score">${e.score}</div>
        `;
        return item;
    };

    container.appendChild(makeHeader('Top 10 (Melhores pontuações)'));
    top10.forEach((e, idx) => container.appendChild(makeItem(e, idx)));

    container.appendChild(makeHeader('Histórico recente (últimas partidas)'));
    recent.forEach((e, idx) => container.appendChild(makeItem(e, idx)));
}

// --- PWA (Offline + Instalável) ---
function initPWA() {
    try {
        // Injeta o manifest sem mexer no layout do HTML
        if (!document.querySelector('link[rel="manifest"]')) {
            const link = document.createElement('link');
            link.rel = 'manifest';
            link.href = 'manifest.webmanifest';
            document.head.appendChild(link);
        }

        // Theme color para barra do navegador (especialmente mobile)
        if (!document.querySelector('meta[name="theme-color"]')) {
            const meta = document.createElement('meta');
            meta.name = 'theme-color';
            meta.content = '#111827';
            document.head.appendChild(meta);
        }

        // Service Worker (offline)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(err => {
                console.warn('Service Worker não registrado:', err);
            });
        }
    } catch (e) {
        console.warn('Falha initPWA:', e);
    }
}

// --- PAINEL DO PROFESSOR (Rede de Ensino) ---
const TEACHER_PREFS_KEY = 'matemagica_teacher_prefs_v1';

function loadTeacherPrefs() {
    try {
        const raw = LS.get(TEACHER_PREFS_KEY);
        const prefs = raw ? JSON.parse(raw) : {};
        if (prefs && typeof prefs === 'object') {
            if (prefs.projection) document.body.classList.add('projection-mode');
            if (prefs.lowStimulus) document.body.classList.add('low-stimulus');
        }
    } catch {}
}

function saveTeacherPrefs(prefs) {
    try { LS.set(TEACHER_PREFS_KEY, JSON.stringify(prefs || {})); } catch {}
}

function initTeacherPanel() {
    // Evita duplicar
    if (document.getElementById('teacher-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'teacher-fab';
    fab.className = 'teacher-fab';
    fab.type = 'button';
    fab.title = 'Painel do Professor';
    fab.setAttribute('aria-label', 'Abrir Painel do Professor');
    fab.textContent = '👩‍🏫';
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.id = 'teacher-panel-overlay';
    overlay.className = 'teacher-overlay hidden';
    overlay.innerHTML = `
      <div class="teacher-panel" role="dialog" aria-modal="true" aria-label="Painel do Professor">
        <div class="teacher-panel-header">
          <h2>Painel do Professor</h2>
          <button id="tp-close" class="btn-secondary" type="button">Fechar</button>
        </div>

        <div class="teacher-panel-section">
          <div class="teacher-row">
            <button id="tp-projection" class="btn-action btn-secondary" type="button">Modo Projeção</button>
            <button id="tp-low" class="btn-action btn-secondary" type="button">Baixo Estímulo</button>
          </div>
          <p class="teacher-help">Use <strong>Projeção</strong> no datashow e <strong>Baixo estímulo</strong> para reduzir animações e distrações.</p>
        </div>

        <div class="teacher-panel-section">
          <div class="teacher-row">
            <button id="tp-export" class="btn-action btn-secondary" type="button">Exportar Dados</button>
            <button id="tp-import" class="btn-action btn-secondary" type="button">Importar Dados</button>
          </div>
          <p class="teacher-help">Exporta/Importa: XP, Ranking e Erros (backup local, sem internet).</p>
        </div>

        <div class="teacher-panel-section">
          <button id="tp-reset" class="btn-secondary" type="button">Resetar dados do app (neste dispositivo)</button>
          <p class="teacher-help">Cuidado: apaga ranking, XP e erros salvos apenas deste dispositivo.</p>
        </div>
      
        <div class="teacher-panel-section">
          <details class="teacher-guide">
            <summary>Guia rápido (1 minuto)</summary>
            <ul>
              <li><strong>Modo Projeção</strong>: melhora a leitura no projetor (alto contraste e tamanhos maiores).</li>
              <li><strong>Baixo Estímulo</strong>: reduz animações e flashes (bom para foco).</li>
              <li><strong>Exportar Dados</strong>: gera um arquivo JSON com ranking, erros e XP (backup / levar para outro PC).</li>
              <li><strong>Importar Dados</strong>: restaura o backup no dispositivo.</li>
              <li><strong>Perfil do estudante</strong>: na tela inicial, toque em <strong>Perfil</strong> (opcional) para registrar nome/turma/escola no relatório.</li>
            </ul>
          </details>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const prefs = (() => {
        try { return JSON.parse(LS.get(TEACHER_PREFS_KEY) || '{}'); } catch { return {}; }
    })();

    const close = () => overlay.classList.add('hidden');
    const open = () => overlay.classList.remove('hidden');

    fab.addEventListener('click', () => {
        if (overlay.classList.contains('hidden')) open(); else close();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    overlay.querySelector('#tp-close').addEventListener('click', close);

    // Toggles
    const btnProj = overlay.querySelector('#tp-projection');
    const btnLow = overlay.querySelector('#tp-low');

    const refreshBtnStates = () => {
        btnProj.classList.toggle('active', !!prefs.projection);
        btnLow.classList.toggle('active', !!prefs.lowStimulus);
        btnProj.textContent = prefs.projection ? 'Projeção: ON' : 'Modo Projeção';
        btnLow.textContent = prefs.lowStimulus ? 'Baixo estímulo: ON' : 'Baixo Estímulo';
    };

    btnProj.addEventListener('click', () => {
        prefs.projection = !prefs.projection;
        document.body.classList.toggle('projection-mode', !!prefs.projection);
        saveTeacherPrefs(prefs);
        refreshBtnStates();
    });

    btnLow.addEventListener('click', () => {
        prefs.lowStimulus = !prefs.lowStimulus;
        document.body.classList.toggle('low-stimulus', !!prefs.lowStimulus);
        saveTeacherPrefs(prefs);
        refreshBtnStates();
    });

    // Export / Import
    const exportBtn = overlay.querySelector('#tp-export');
    const importBtn = overlay.querySelector('#tp-import');

    const downloadTextFile = (filename, text) => {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
    };

    exportBtn.addEventListener('click', () => {
        const payload = {
            version: 'v12',
            exportedAt: Date.now(),
            xp: gameState.xp,
            errors: gameState.errors || [],
            highScores: gameState.highScores || [],
            teacherPrefs: prefs || {}
        };
        downloadTextFile('matemagica_backup.json', JSON.stringify(payload, null, 2));
        showFeedbackMessage('Backup exportado!', 'success');
    });

    importBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(String(reader.result || '{}'));
                    if (data.xp != null) { gameState.xp = Number(data.xp) || 0; LS.set('matemagica_xp', String(gameState.xp)); }
                    if (Array.isArray(data.errors)) { gameState.errors = data.errors; salvarErros(); }
                    if (Array.isArray(data.highScores)) { gameState.highScores = data.highScores; salvarRanking(); }
                    if (data.teacherPrefs) { saveTeacherPrefs(data.teacherPrefs); loadTeacherPrefs(); }
                    showFeedbackMessage('Backup importado! Recarregando...', 'success', 2500);
                    setTimeout(() => location.reload(), 700);
                } catch (e) {
                    showFeedbackMessage('Arquivo inválido.', 'error');
                }
            };
            reader.readAsText(file);
            input.remove();
        });

        input.click();
    });

    // Reset
    overlay.querySelector('#tp-reset').addEventListener('click', () => {
        if (!confirm('Tem certeza? Isso apaga XP, ranking e erros deste dispositivo.')) return;
        try {
            LS.remove('matemagica_xp');
            LS.remove('matemagica_errors');
            LS.remove(RANKING_STORAGE_KEY);
            LS.remove(TEACHER_PREFS_KEY);
        } catch {}
        showFeedbackMessage('Dados apagados. Recarregando...', 'info', 2000);
        setTimeout(() => location.reload(), 700);
    });

    refreshBtnStates();
}


/** Atualiza a interface (botão e lista) de treinamento de erros. */
function updateErrorTrainingButton() {
    const errorCount = gameState.errors.length;
    const hasErrors = errorCount > 0;
    
    // Na tela de resultados, mostra o botão para treinar erros se houver erros
    if (btnTreinarErros) {
        btnTreinarErros.style.display = hasErrors ? 'inline-block' : 'none';
    }
    
    // Na tela de Treinamento de Erros, atualiza a mensagem e botões
    if (errorCountMessage) {
        errorCountMessage.textContent = hasErrors 
            ? `Você tem ${errorCount} erro(s) salvo(s) para treinar.`
            : 'Nenhum erro salvo ainda. Comece a jogar para identificarmos seus pontos fracos!';
    }
    
    if (btnStartTraining) {
        btnStartTraining.disabled = !hasErrors;
        btnStartTraining.textContent = hasErrors 
            ? `Começar Treinamento com ${errorCount} Erros`
            : 'Começar Treinamento';
    }
    
    if (btnClearErrors) {
        btnClearErrors.disabled = !hasErrors;
    }

    if (errorListContainer) {
        displayErrorList();
    }
}

/** Exibe a lista dos últimos erros na tela de treinamento. */
function displayErrorList() {
    if (!errorListContainer) return;

    errorListContainer.innerHTML = '';
    
    // Mostra apenas os 10 últimos erros (mais recentes)
    const errorsToShow = gameState.errors.slice(-10).reverse();

    if (errorsToShow.length === 0) {
        errorListContainer.innerHTML = '<p class="incentive-message" style="text-align: center;">Jogue o Modo Rápido e erre para ver seus erros aqui!</p>';
        return;
    }

    errorsToShow.forEach(error => {
        const item = document.createElement('div');
        item.classList.add('error-item');
        
        // Formata a data (opcional, para ser mais legível)
        const date = new Date(error.timestamp).toLocaleDateString('pt-BR');
        
        item.innerHTML = `
            <div>
                <strong>Questão: ${error.question}</strong>
                <p>Sua Resposta: <span class="wrong-answer">${error.userAnswer}</span></p>
                <p>Resposta Correta: <span class="correct-answer">${error.correctAnswer}</span></p>
            </div>
            <p style="font-size: 0.8em; color: var(--cor-texto-principal); opacity: 0.7;">
                ${error.operation.toUpperCase()} | Errado em: ${date}
            </p>
        `;
        errorListContainer.appendChild(item);
    });
}

// --- TREINAMENTO DE ERROS (Modo Professor / Reforço) ---
function buildQuestionFromError(err) {
    // Preferência: usar num1/num2 quando disponível
    const op = err.operation || 'addition';
    let num1 = err.num1;
    let num2 = err.num2;

    // Fallback: tentar extrair da string
    if ((num1 == null || num2 == null) && typeof err.question === 'string') {
        const q = err.question;
        const mAdd = q.match(/(\d+)\s*\+\s*(\d+)/);
        const mSub = q.match(/(\d+)\s*[−-]\s*(\d+)/);
        const mMul = q.match(/(\d+)\s*[x×]\s*(\d+)/);
        const mDiv = q.match(/(\d+)\s*[÷/]\s*(\d+)/);
        const mPow = q.match(/(\d+)\s*(?:\^|⁰|¹|²|³|⁴|⁵|⁶|⁷|⁸|⁹)/); // base pelo menos

        if (mAdd) { num1 = parseInt(mAdd[1]); num2 = parseInt(mAdd[2]); }
        else if (mSub) { num1 = parseInt(mSub[1]); num2 = parseInt(mSub[2]); }
        else if (mMul) { num1 = parseInt(mMul[1]); num2 = parseInt(mMul[2]); }
        else if (mDiv) { num1 = parseInt(mDiv[1]); num2 = parseInt(mDiv[2]); }
        else if (mPow) {
            // tenta achar expoente sobrescrito (último char numérico sobrescrito)
            const base = parseInt(q);
            const sup = q.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/);
            if (Number.isFinite(base) && sup) {
                num1 = base;
                // converte sobrescrito
                const map = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
                num2 = parseInt(sup[0].split('').map(c=>map[c]||'').join(''));
            }
        }
    }

    // monta um objeto de questão no formato do jogo
    // se num1/num2 faltarem, gera aleatória para não travar
    if (num1 == null || num2 == null) {
        const q = generateQuestion(op);
        q.answer = err.correctAnswer;
        q.question = err.question;
        q.voiceQuestion = err.question;
        return q;
    }

    // Gera opções plausíveis em torno da correta
    const correct = Number(err.correctAnswer);
    const options = new Set([correct]);
    while (options.size < 4) {
        const delta = randomInt(1, Math.max(3, Math.round(Math.abs(correct) * 0.25)));
        const sign = (Math.random() < 0.5) ? -1 : 1;
        const candidate = correct + sign * delta;
        options.add(candidate);
    }
    const opts = Array.from(options);
    shuffleArray(opts);

    let questionStr = '';
    let voiceQ = '';
    switch (op) {
case 'addition':
            // v19.2 — usa pool fixo (50) por nível
            const __pAdd = nextFromAddSubPool('addition', gameState.currentLevel);
            if (__pAdd) {
                num1 = __pAdd[0]; num2 = __pAdd[1];
                answer = num1 + num2;
                questionString = `${num1} + ${num2}`;
                questionSpeak = `${num1} mais ${num2}`;
                break;
            }

            questionStr = `${num1} + ${num2} = ?`;
            voiceQ = `Qual é o resultado de ${num1} mais ${num2}?`;
            break;
case 'subtraction':
            // v19.2 — usa pool fixo (50) por nível
            const __pSub = nextFromAddSubPool('subtraction', gameState.currentLevel);
            if (__pSub) {
                num1 = __pSub[0]; num2 = __pSub[1];
                answer = num1 - num2;
                questionString = `${num1} - ${num2}`;
                questionSpeak = `${num1} menos ${num2}`;
                break;
            }

            questionStr = `${num1} − ${num2} = ?`;
            voiceQ = `Qual é o resultado de ${num1} menos ${num2}?`;
            break;
        case 'multiplication':
            questionStr = `${num1} × ${num2} = ?`;
            voiceQ = `Qual é o resultado de ${num1} vezes ${num2}?`;
            break;
        case 'division':
            questionStr = `${num1} ÷ ${num2} = ?`;
            voiceQ = `Qual é o resultado de ${num1} dividido por ${num2}?`;
            break;
        case 'potenciacao': {
            const expSup = toSuperscript(num2);
            questionStr = `${num1}${expSup} = ?`;
            voiceQ = `${num1} elevado a ${num2}. Qual é o resultado?`;
            break;
        }
        case 'radiciacao':
            questionStr = `√${num1} = ?`;
            voiceQ = `Qual é a raiz quadrada de ${num1}?`;
            break;
        default:
            questionStr = `${err.question || ''}`;
            voiceQ = `${err.question || ''}`;
            break;
    }

    return {
        question: questionStr,
        voiceQuestion: voiceQ,
        answer: correct,
        options: opts,
        voiceOptions: opts,
        operacao: op,
        num1: num1,
        num2: num2,
        reviewKey: (gameState.multiplication && gameState.multiplication.__reviewKey) ? gameState.multiplication.__reviewKey : null
    };
}

function startErrorTraining() {
    if (!Array.isArray(gameState.errors) || gameState.errors.length === 0) {
        showFeedbackMessage('Sem erros para treinar.', 'info');
        return;
    }

    // Configura modo treinamento
    gameState.isTrainingErrors = true;
    gameState.isRapidMode = false; // treinamento sem tempo
    modeEstudoBtn.classList.add('active');
    modeRapidoBtn.classList.remove('active');
    stopTimer();

    // Desabilita "mostrar resposta" e "tempo" durante o treino (foco em acerto)
    if (btnShowAnswer) btnShowAnswer.disabled = true;
    if (btnExtendTime) btnExtendTime.disabled = true;

    // Monta fila (mais recentes primeiro) – pode ajustar se quiser
    const queue = gameState.errors.slice(0, 25).map(buildQuestionFromError);
    gameState.trainingQueue = queue;
    gameState.trainingIndex = 0;

    // Define total e inicia
    gameState.totalQuestions = queue.length;
    gameState.questionNumber = 0;
    gameState.score = 0;
    gameState.acertos = 0;
    gameState.answerTimes = [];
    gameState.fastAnswers = 0;
    gameState.suspectSession = false;
    gameState.__inMicro = false;
    gameState.__tagStreak = {};

    gameState.erros = 0;
    gameState.sessionStartTs = Date.now();
    
    // v19.2 — pools fixos para Adição/Subtração
    if (operation === 'addition' || operation === 'subtraction') {
        ensureAddSubPool(operation, level);
    }
gameState.isGameActive = true;
    gameState.isTrainingErrors = false;
    gameState.attemptsThisQuestion = 0;
    if (btnShowAnswer) btnShowAnswer.disabled = false;
    if (btnExtendTime) btnExtendTime.disabled = false;

    exibirTela('game-screen');
    nextTrainingQuestion();
}

function nextTrainingQuestion() {
    const q = gameState.trainingQueue[gameState.trainingIndex];
    if (!q) {
        endTraining();
        return;
    }

    gameState.questionNumber++;
    gameState.currentQuestion = q;
    gameState.attemptsThisQuestion = 0;

    // UI
    questionCounter.textContent = `Treino: ${gameState.trainingIndex + 1}/${gameState.trainingQueue.length}`;
    questionText.textContent = q.question;

    // Carrega opções
    answerOptions.forEach((btn, i) => {
        btn.classList.remove('correct', 'wrong');
        btn.disabled = false;
        const numEl = btn.querySelector('.option-number');
        const txtEl = btn.querySelector('.answer-text');
        if (numEl) numEl.textContent = `${i + 1})`;
        if (txtEl) txtEl.textContent = q.options[i];
    });

    // Progresso do ciclo: reusa badge existente
    updateCycleProgressUI();

    // Voz
    speakSequence(buildVoiceTextsForQuestion(q));
}

function endTraining() {
    gameState.isGameActive = false;
    gameState.__inMicro = false;
    gameState.isTrainingErrors = false;

    // Reabilita botões
    if (btnShowAnswer) btnShowAnswer.disabled = false;
    if (btnExtendTime) btnExtendTime.disabled = false;

    showFeedbackMessage('Treinamento concluído! 🎯', 'success', 2500);


// 4. Registrar sessão para Relatório/Painel do Professor (offline)
try {
    const durationSec = (function() {
        if (gameState.isRapidMode && Number.isFinite(gameState.maxTime) && Number.isFinite(gameState.timeLeft)) {
            const v = Math.max(0, Math.round(gameState.maxTime - gameState.timeLeft));
            return v;
        }
        const start = Number.isFinite(gameState.sessionStartTs) ? gameState.sessionStartTs : Date.now();
        return Math.max(0, Math.round((Date.now() - start) / 1000));
    })();

    appendSession({
        schemaVersion: '1.0',
        ts: Date.now(),
        operation: gameState.currentOperation,
        level: gameState.currentLevel,
        mode: gameState.isRapidMode ? 'rapido' : 'estudo',
        score: gameState.score,
        correct: gameState.acertos,
        wrong: gameState.erros,
        questions: (gameState.acertos + gameState.erros),
        xpDelta: xpGained,
        xpTotal: gameState.xp,
        durationSec,
        student: {
            name: String(gameState.studentProfile?.name || ''),
            turma: String(gameState.studentProfile?.turma || ''),
            escola: String(gameState.studentProfile?.escola || '')
        },
        multiplication: (gameState.currentOperation === 'multiplication' && gameState.multiplication) ? {
            mode: gameState.multiplication.mode || null,
            tabuada: Number.isInteger(gameState.multiplication.tabuada) ? gameState.multiplication.tabuada : null,
            trailRangeKey: gameState.multiplication.trailRangeKey || null,
            multMin: Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : null,
            multMax: Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : null,
            trailMin: Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : null,
            trailMax: Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : null
        } : null
    });
} catch (e) {
    console.warn('Falha ao registrar sessão:', e);
}

    exibirTela('result-screen');
}



// --- LÓGICA DO JOGO: GERAÇÃO DE QUESTÕES ---

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- v19.9 — BLUEPRINT + POOLS FIXOS (Base turma fraca) ---
// Objetivo: ter (1) pool fixo de 50 por nível e (2) gerador por regras seguindo as proporções.
// Observação: nível usa 'easy' | 'medium' | 'advanced' internamente; aceitamos 'hard' como sinônimo de 'advanced'.

function normLevelKey(lvl){
    if (!lvl) return 'medium';
    const s = String(lvl).toLowerCase();
    // aceita variações PT/EN com e sem acento
    if (s === 'hard' || s === 'difficult' || s === 'difícil' || s === 'dificil' || s === 'advanced') return 'advanced';
    if (s === 'easy' || s === 'facil' || s === 'fácil') return 'easy';
    if (s === 'medium' || s === 'medio' || s === 'médio') return 'medium';
    return s;
}

const PET_BLUEPRINT = {
    add: {
        easy:   { max: 20,  carryPct: 0.00, buckets: [
            { key:'complete10', n:15 }, { key:'doubles', n:10 }, { key:'plus123', n:10 }, { key:'to20', n:10 }, { key:'mix', n:5 }
        ]},
        medium: { max: 100, carryPct: 0.35, buckets: [
            { key:'plusTens', n:10 }, { key:'to100', n:8 }, { key:'comp', n:7 }, { key:'mixNoCarry', n:7 }, // 32 sem vai-um
            { key:'carryEasy', n:8 }, { key:'carry2d', n:6 }, { key:'carryTensAdj', n:4 }                 // 18 com vai-um
        ]},
        advanced:{ max: 200, carryPct: 0.70, buckets: [
            { key:'carry2d1d', n:10 }, { key:'carry2d2d', n:15 }, { key:'nearMark', n:6 }, { key:'compCarry', n:4 }, // 35
            { key:'tens', n:6 }, { key:'to200', n:5 }, { key:'mixNoCarry', n:4 }                                      // 15
        ]}
    },
    sub: {
        easy:   { max: 20,  borrowPct: 0.00, buckets: [
            { key:'minus123', n:12 }, { key:'to10', n:15 }, { key:'smallDiff', n:8 }, { key:'complete', n:10 }, { key:'mix', n:5 }
        ]},
        medium: { max: 100, borrowPct: 0.35, buckets: [
            { key:'minusTens', n:10 }, { key:'minusUnits', n:8 }, { key:'from100', n:7 }, { key:'mixNoBorrow', n:7 }, // 32
            { key:'borrow1d', n:8 }, { key:'borrow2d', n:8 }, { key:'nearMark', n:2 }                                  // 18
        ]},
        advanced:{ max: 200, borrowPct: 0.70, buckets: [
            { key:'borrow2d1d', n:10 }, { key:'borrow2d2d', n:15 }, { key:'nearMark', n:6 }, { key:'comp', n:4 }, // 35
            { key:'minusTens', n:6 }, { key:'from200', n:5 }, { key:'mixNoBorrow', n:4 }                              // 15
        ]}
    },
    mult: {
        easy:    { tabMin:1, tabMax:5, weights: {1:0.15,2:0.20,3:0.22,4:0.22,5:0.21} },
        medium:  { tabMin:6, tabMax:10, weights: {10:0.12,9:0.20,8:0.20,7:0.16,6:0.16,'mix':0.16} },
        advanced:{ tabMin:11, tabMax:20, weights: {11:0.12,12:0.12,13:0.10,14:0.10,15:0.08,16:0.08,17:0.08,18:0.08,19:0.08,20:0.08,'mix':0.08} }
    }
};

// Estado dos pools fixos
if (!gameState.pools) {
    gameState.pools = {
        cursor: { addition:{easy:0,medium:0,advanced:0}, subtraction:{easy:0,medium:0,advanced:0}, multiplication:{easy:0,medium:0,advanced:0} },
        fixed:  { addition:{easy:[],medium:[],advanced:[]}, subtraction:{easy:[],medium:[],advanced:[]}, multiplication:{easy:[],medium:[],advanced:[]} }
    };
}

function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// --- Geradores por bucket (adição) ---
function genAdd(levelKey, bucketKey){
    const cfg = PET_BLUEPRINT.add[levelKey];
    const max = cfg.max;

    let a=0,b=0;

    const pick = (min,maxi)=>randomInt(min,maxi);

    if (levelKey === 'easy'){
        // tudo <=20, sem vai-um
        if (bucketKey==='complete10'){
            const au = pick(0,9);
            const bu = 10-au;
            a = au; b = bu;
            if (Math.random()<0.4){ a = pick(0,9); b = 10-a; } // variação
        } else if (bucketKey==='doubles'){
            const x = pick(1,10);
            a = x; b = (Math.random()<0.5)? x : Math.max(0, Math.min(20, x + (Math.random()<0.5?1:-1)));
        } else if (bucketKey==='plus123'){
            a = pick(0,20);
            b = randChoice([1,2,3]);
            if (a+b>20) a = 20-b;
        } else if (bucketKey==='to20'){
            const target = 20;
            a = pick(0,20);
            b = target - a;
            if (b<0){ b = pick(0,20-a); }
        } else { // mix
            a = pick(0,20);
            b = pick(0,20);
            if (a+b>20){ a = pick(0,20); b = pick(0,20-a); }
        }
        // garante sem vai-um (unidades)
        if ((a%10)+(b%10) >= 10){
            // ajusta b pra evitar carry
            const au=a%10;
            b = Math.min(b, 9-au);
        }
        return [a,b];
    }

    // medium/advanced
    const limit = max;
    const makeNoCarry2d = ()=>{
        for (let i=0;i<80;i++){
            const at = pick(0, Math.floor(limit/10));
            const bt = pick(0, Math.floor(limit/10));
            const au = pick(0,9);
            const bu = pick(0,9-au); // sem vai-um
            a = at*10+au;
            b = bt*10+bu;
            if (a<=limit && b<=limit && a+b<=limit) return [a,b];
        }
        a=pick(0,limit); b=pick(0,limit-a); return [a,b];
    };
    const makeCarry = (twoDigitsB=true)=>{
        for (let i=0;i<120;i++){
            const at = pick(0, Math.floor(limit/10));
            const bt = pick(0, Math.floor(limit/10));
            const au = pick(0,9);
            const bu = pick(Math.max(10-au,0),9); // força carry nas unidades
            a = at*10+au;
            if (twoDigitsB){
                const btu = pick(0, Math.floor(limit/10));
                b = btu*10 + bu;
            } else {
                b = bu; // 1 dígito
            }
            if (a<=limit && b<=limit && a+b<=limit) return [a,b];
        }
        // fallback
        return makeNoCarry2d();
    };

    if (levelKey==='medium'){
        if (bucketKey==='plusTens'){
            a = pick(0,100);
            b = randChoice([10,20,30,40]);
            if (a+b>100) a = 100-b;
            return [a,b];
        } else if (bucketKey==='to100'){
            a = pick(0,100);
            b = 100-a;
            if (b<0){ b = pick(0,100-a); }
            return [a,b];
        } else if (bucketKey==='comp'){
            // compensação: 49+6 => 50+5
            a = randChoice([29,39,49,59,69,79,89,99]);
            b = pick(1,9);
            if (a+b>100){ a -= 10; }
            return [a,b];
        } else if (bucketKey==='mixNoCarry'){
            return makeNoCarry2d();
        } else if (bucketKey==='carryEasy'){
            // 2d + 1d com carry
            return makeCarry(false);
        } else if (bucketKey==='carry2d'){
            return makeCarry(true);
        } else if (bucketKey==='carryTensAdj'){
            a = randChoice([59,69,79,89,99]);
            b = randChoice([11,12,13,14,15,16,17,18,19]);
            if (a+b>100){ a -= 10; }
            // garante carry
            if ((a%10)+(b%10) < 10) b += (10-((a%10)+(b%10)));
            if (a+b>100) b -= 10;
            return [a,b];
        }
        return makeNoCarry2d();
    }

    // advanced
    if (bucketKey==='carry2d1d'){
        return makeCarry(false);
    } else if (bucketKey==='carry2d2d'){
        return makeCarry(true);
    } else if (bucketKey==='nearMark'){
        a = randChoice([98,99,149,150,199]);
        b = pick(1,9);
        if (a+b>200) a -= 10;
        // força carry em parte
        return [a,b];
    } else if (bucketKey==='compCarry'){
        a = randChoice([79,89,99,109,119,129,139,149,159,169,179,189,199]);
        b = randChoice([12,13,14,15,16,17,18,19]);
        if (a+b>200) a -= 10;
        if ((a%10)+(b%10) < 10) b += (10-((a%10)+(b%10)));
        if (a+b>200) b -= 10;
        return [a,b];
    } else if (bucketKey==='tens'){
        a = randChoice([100,110,120,130,140,150,160,170,180,190]);
        b = randChoice([10,20,30,40,50]);
        if (a+b>200) b = 200-a;
        return [a,b];
    } else if (bucketKey==='to200'){
        a = pick(0,200);
        b = 200-a;
        if (b<0) b = pick(0,200-a);
        return [a,b];
    } else if (bucketKey==='mixNoCarry'){
        return makeNoCarry2d();
    }
    return makeCarry(true);
}

// --- Geradores por bucket (subtração) ---
function genSub(levelKey, bucketKey){
    const cfg = PET_BLUEPRINT.sub[levelKey];
    const max = cfg.max;

    let a=0,b=0;
    const pick=(min,maxi)=>randomInt(min,maxi);

    if (levelKey==='easy'){
        if (bucketKey==='minus123'){
            a = pick(0,20);
            b = randChoice([1,2,3]);
            if (a-b<0) a = b;
        } else if (bucketKey==='to10'){
            a = pick(0,20);
            b = pick(0,10);
            if (a-b<0) a = b;
        } else if (bucketKey==='smallDiff'){
            b = pick(0,20);
            a = Math.min(20, b + pick(0,3));
        } else if (bucketKey==='complete'){
            a = 20;
            b = pick(0,20);
        } else { // mix
            a = pick(0,20);
            b = pick(0,a);
        }
        // sem empréstimo
        if ((a%10) < (b%10)){
            b = (Math.floor(b/10)*10) + pick(0, a%10);
        }
        return [a,b];
    }

    const limit=max;
    const makeNoBorrow2d=()=>{
        for (let i=0;i<120;i++){
            const at = pick(0, Math.floor(limit/10));
            const bt = pick(0, at);
            const au = pick(0,9);
            const bu = pick(0, au); // garante sem empréstimo
            a = at*10+au;
            b = bt*10+bu;
            if (a<=limit && b<=a) return [a,b];
        }
        a=pick(0,limit); b=pick(0,a); return [a,b];
    };
    const makeBorrow=(twoDigitsB=true)=>{
        for (let i=0;i<160;i++){
            const at = pick(1, Math.floor(limit/10)); // precisa ter dezena pra emprestar
            const bt = pick(0, at);
            const au = pick(0,9);
            const bu = pick(au+1,9); // força empréstimo
            a = at*10 + au;
            if (twoDigitsB){
                const btu = pick(0, bt);
                b = btu*10 + bu;
            } else {
                b = bu;
            }
            if (a<=limit && b<=a) return [a,b];
        }
        return makeNoBorrow2d();
    };

    if (levelKey==='medium'){
        if (bucketKey==='minusTens'){
            a = randChoice([40,50,60,70,80,90,100]);
            b = randChoice([10,20,30,40,50]);
            if (b>a) b = 10;
            return [a,b];
        } else if (bucketKey==='minusUnits'){
            a = pick(10,100);
            b = pick(1,9);
            if (a-b<0) a = b+10;
            return [a,b];
        } else if (bucketKey==='from100'){
            a = 100;
            b = pick(0,100);
            return [a,b];
        } else if (bucketKey==='mixNoBorrow'){
            return makeNoBorrow2d();
        } else if (bucketKey==='borrow1d'){
            return makeBorrow(false);
        } else if (bucketKey==='borrow2d'){
            return makeBorrow(true);
        } else if (bucketKey==='nearMark'){
            a = randChoice([70,80,90,100]);
            b = randChoice([48,59,67,78,89]);
            if (b>a) b = a-1;
            // garante empréstimo quando possível
            if ((a%10) >= (b%10)) b = (Math.floor(b/10)*10) + ((a%10)+1);
            if (b>a) b = a-1;
            return [a,b];
        }
        return makeNoBorrow2d();
    }

    // advanced
    if (bucketKey==='borrow2d1d'){
        return makeBorrow(false);
    } else if (bucketKey==='borrow2d2d'){
        return makeBorrow(true);
    } else if (bucketKey==='nearMark'){
        a = randChoice([100,150,200]);
        b = randChoice([67,98,136,149,187]);
        if (b>a) b = a-1;
        if ((a%10) >= (b%10)) b = (Math.floor(b/10)*10) + ((a%10)+1);
        if (b>a) b = a-1;
        return [a,b];
    } else if (bucketKey==='comp'){
        // compensação: 82-19 = 82-20+1 (mas aqui só gera o par)
        a = randChoice([82,92,102,112,122,132,142,152,162,172,182,192]);
        b = randChoice([19,29,39,49,59,69,79,89,99]);
        if (b>a) b = a-1;
        // força empréstimo
        if ((a%10) >= (b%10)) b = (Math.floor(b/10)*10) + ((a%10)+1);
        if (b>a) b = a-1;
        return [a,b];
    } else if (bucketKey==='minusTens'){
        a = randChoice([120,130,140,150,160,170,180,190,200]);
        b = randChoice([10,20,30,40,50,60,70,80,90]);
        if (b>a) b = 10;
        return [a,b];
    } else if (bucketKey==='from200'){
        a = 200;
        b = pick(0,200);
        return [a,b];
    } else if (bucketKey==='mixNoBorrow'){
        return makeNoBorrow2d();
    }
    return makeBorrow(true);
}

// --- Multiplicação: gerador por pesos (nível) ---
function genMultPair(levelKey){
    const cfg = PET_BLUEPRINT.mult[levelKey];
    // define multiplicador dentro da faixa atual (config do app)
    const multMin = Number.isInteger(gameState.multiplication?.multMin) ? gameState.multiplication.multMin : 0;
    const multMax = Number.isInteger(gameState.multiplication?.multMax) ? gameState.multiplication.multMax : 20;

    const pickM = ()=>randomInt(multMin, multMax);

    if (levelKey === 'easy'){
        // Escolhe tabuada 0-5 com pesos
        const r=Math.random();
        let acc=0;
        const order=[0,1,2,3,4,5];
        for (const t of order){
            acc += (cfg.weights[t]||0);
            if (r<=acc) return [t, pickM()];
        }
        return [randChoice(order), pickM()];
    }

    const r=Math.random();
    let acc=0;
    const order = (levelKey==='medium') ? [10,9,8,7,6,'mix'] : [11,12,13,14,15,16,17,18,19,20,'mix'];
    for (const k of order){
        acc += (cfg.weights[k]||0);
        if (r<=acc){
            if (k==='mix'){
                // pega qualquer tabuada no range
                return [randomInt(cfg.tabMin, cfg.tabMax), pickM()];
            }
            return [k, pickM()];
        }
    }
    return [randomInt(cfg.tabMin,cfg.tabMax), pickM()];
}

// --- Construção de pools fixos (50) a partir do blueprint ---
function buildFixedPoolAdd(levelKey){
    const buckets = PET_BLUEPRINT.add[levelKey].buckets;
    const out=[];
    buckets.forEach(b=>{
        for (let i=0;i<b.n;i++){
            const [a,bv]=genAdd(levelKey,b.key);
            out.push([a,bv]);
        }
    });
    return shuffleArray(out).slice(0,50);
}
function buildFixedPoolSub(levelKey){
    const buckets = PET_BLUEPRINT.sub[levelKey].buckets;
    const out=[];
    buckets.forEach(b=>{
        for (let i=0;i<b.n;i++){
            const [a,bv]=genSub(levelKey,b.key);
            out.push([a,bv]);
        }
    });
    return shuffleArray(out).slice(0,50);
}
function buildFixedPoolMult(levelKey){
    const out=[];
    // 50 pares seguindo pesos (com mistura)
    for (let i=0;i<50;i++){
        out.push(genMultPair(levelKey));
    }
    return shuffleArray(out);
}

function ensureFixedPools(){
    ['easy','medium','advanced'].forEach(lvl=>{
        if (!Array.isArray(gameState.pools.fixed.addition[lvl]) || gameState.pools.fixed.addition[lvl].length!==50){
            gameState.pools.fixed.addition[lvl]=buildFixedPoolAdd(lvl);
            gameState.pools.cursor.addition[lvl]=0;
        }
        if (!Array.isArray(gameState.pools.fixed.subtraction[lvl]) || gameState.pools.fixed.subtraction[lvl].length!==50){
            gameState.pools.fixed.subtraction[lvl]=buildFixedPoolSub(lvl);
            gameState.pools.cursor.subtraction[lvl]=0;
        }
        if (!Array.isArray(gameState.pools.fixed.multiplication[lvl]) || gameState.pools.fixed.multiplication[lvl].length!==50){
            gameState.pools.fixed.multiplication[lvl]=buildFixedPoolMult(lvl);
            gameState.pools.cursor.multiplication[lvl]=0;
        }
    });
}

function nextFromFixedPool(opKey, levelKey){
    ensureFixedPools();
    const lvl = normLevelKey(levelKey);
    const pool = gameState.pools.fixed[opKey]?.[lvl] || [];
    let cur = gameState.pools.cursor[opKey]?.[lvl] || 0;
    if (cur >= pool.length) return null;
    const item = pool[cur];
    gameState.pools.cursor[opKey][lvl] = cur + 1;
    return item;
}

function maybeRebuildFixedPool(opKey, levelKey){
    const lvl = normLevelKey(levelKey);
    ensureFixedPools();
    const cur = gameState.pools.cursor[opKey][lvl];
    if (cur >= 50){
        // recompõe novo pool para evitar decorar
        if (opKey==='addition') gameState.pools.fixed.addition[lvl]=buildFixedPoolAdd(lvl);
        if (opKey==='subtraction') gameState.pools.fixed.subtraction[lvl]=buildFixedPoolSub(lvl);
        if (opKey==='multiplication') gameState.pools.fixed.multiplication[lvl]=buildFixedPoolMult(lvl);
        gameState.pools.cursor[opKey][lvl]=0;
    }
}

function pickBucketKey(buckets){
    const total = buckets.reduce((s,b)=>s+(b.n||0),0);
    let r = Math.random()*total;
    for (const b of buckets){
        r -= (b.n||0);
        if (r<=0) return b.key;
    }
    return buckets[0]?.key || 'mix';
}


function toSuperscript(num) {
    // Converte número inteiro para caracteres sobrescritos Unicode (ex.: 3 -> ³, 12 -> ¹²)
    const map = {
        '0': '⁰','1': '¹','2': '²','3': '³','4': '⁴','5': '⁵','6': '⁶','7': '⁷','8': '⁸','9': '⁹','-': '⁻'
    };
    return String(num).split('').map(ch => map[ch] ?? ch).join('');
}


// --- HELPERS (Tabuada e UI) ---
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function rangeInclusive(min, max) {
    const out = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
}



// Mapeia 
// Normaliza nomes de nível vindos da UI/estado (ex.: 'hard' -> 'advanced')
function normalizeLevelKey(level) {
    if (!level) return 'medium';
    const l = String(level).toLowerCase();
    if (l === 'hard' || l === 'difficult' || l === 'difícil' || l === 'dificil') return 'advanced';
    if (l === 'easy' || l === 'facil' || l === 'fácil') return 'easy';
    if (l === 'medium' || l === 'medio' || l === 'médio') return 'medium';
    if (l === 'advanced') return 'advanced';
    return l;
}

// nível → faixa de tabuadas (Multiplicação)
function getTabuadaRangeByLevel(level) {
    level = normalizeLevelKey(level);
switch (level) {
        case 'easy':
            // Fácil: tabuadas 1–5, multiplicadores 1–10
            return { min: 1, max: 5, multMin: 1, multMax: 10, label: 'Fácil (1–5 | ×1–10)' };
        case 'medium':
            // Médio: tabuadas 6–10, multiplicadores 1–10
            return { min: 6, max: 10, multMin: 1, multMax: 10, label: 'Médio (6–10 | ×1–10)' };
        case 'advanced':
            // Avançado: tabuadas 11–20, multiplicadores 1–20
            return { min: 11, max: 20, multMin: 1, multMax: 20, label: 'Avançado (11–20 | ×1–20)' };
        default:
            return { min: 1, max: 5, multMin: 1, multMax: 10, label: 'Fácil (1–5 | ×1–10)' };
    }
}

function loadMultiplicationConfig() {
    try {
        const raw = LS.get('matemagica_mult_cfg');
        if (!raw) return;
        const cfg = JSON.parse(raw);
        if (!cfg || typeof cfg !== 'object') return;

        if (typeof cfg.mode === 'string') gameState.multiplication.mode = cfg.mode;
        if (Number.isInteger(cfg.tabuada)) gameState.multiplication.tabuada = cfg.tabuada;

        if (Number.isInteger(cfg.trailMin)) gameState.multiplication.trailMin = cfg.trailMin;
        if (Number.isInteger(cfg.trailMax)) gameState.multiplication.trailMax = cfg.trailMax;
        if (Number.isInteger(cfg.multMin)) gameState.multiplication.multMin = cfg.multMin;
        if (Number.isInteger(cfg.multMax)) gameState.multiplication.multMax = cfg.multMax;

        // chave (tabuadas|multiplicadores)
        if (typeof cfg.trailRangeKey === 'string') gameState.multiplication.trailRangeKey = cfg.trailRangeKey;

        // trilha (pares)
        const tabMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
        const tabMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
        const multMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 1;
        const multMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 10;
        const expectedLen = Math.max(0, (tabMax - tabMin + 1)) * Math.max(0, (multMax - multMin + 1));

        if (Array.isArray(cfg.trailPairs) && cfg.trailPairs.length === expectedLen) {
            gameState.multiplication.trailPairs = cfg.trailPairs;
        }
        if (Number.isInteger(cfg.trailPairIndex)) gameState.multiplication.trailPairIndex = cfg.trailPairIndex;

        // saneia índice
        if (gameState.multiplication.trailPairIndex < 0 || gameState.multiplication.trailPairIndex >= expectedLen) {
            gameState.multiplication.trailPairIndex = 0;
        }
    } catch (e) {
        console.warn("Falha ao carregar config de multiplicação:", e);
    }
}

function saveMultiplicationConfig() {
    try {
        const payload = {
            mode: gameState.multiplication.mode,
            tabuada: gameState.multiplication.tabuada,
            trailMin: gameState.multiplication.trailMin,
            trailMax: gameState.multiplication.trailMax,
            multMin: gameState.multiplication.multMin,
            multMax: gameState.multiplication.multMax,
            trailRangeKey: gameState.multiplication.trailRangeKey,
            trailPairs: gameState.multiplication.trailPairs,
            trailPairIndex: gameState.multiplication.trailPairIndex
        };
        LS.set('matemagica_mult_cfg', JSON.stringify(payload));
    
        // também salva o progresso por faixa (para o mapa e para alternar níveis sem perder o ponto)
        try { setSavedTrailIndexForKey(gameState.multiplication.trailRangeKey, gameState.multiplication.trailPairIndex); } catch (_) {}
} catch (e) {
        console.warn("Falha ao salvar config de multiplicação:", e);
    }
}

function buildTrailPairs(tabMin, tabMax, multMin, multMax) {
    const pairs = [];
    for (let t = tabMin; t <= tabMax; t++) {
        for (let m = multMin; m <= multMax; m++) {
            pairs.push([t, m]);
        }
    }
    return pairs;
}

function ensureTrailPairs(tabMin = gameState.multiplication.trailMin, tabMax = gameState.multiplication.trailMax, multMin = gameState.multiplication.multMin, multMax = gameState.multiplication.multMax) {
    // sanitiza
    if (!Number.isInteger(tabMin)) tabMin = 0;
    if (!Number.isInteger(tabMax)) tabMax = 20;
    if (tabMin > tabMax) [tabMin, tabMax] = [tabMax, tabMin];

    if (!Number.isInteger(multMin)) multMin = 0;
    if (!Number.isInteger(multMax)) multMax = 20;
    if (multMin > multMax) [multMin, multMax] = [multMax, multMin];

    const tabCount = (tabMax - tabMin + 1);
    const multCount = (multMax - multMin + 1);
    const expectedLen = Math.max(0, tabCount) * Math.max(0, multCount);

    const key = `${tabMin}-${tabMax}|${multMin}-${multMax}`;
    const sameKey = gameState.multiplication.trailRangeKey === key;

    if (!Array.isArray(gameState.multiplication.trailPairs) ||
        gameState.multiplication.trailPairs.length !== expectedLen ||
        !sameKey
    ) {
        gameState.multiplication.trailPairs = shuffleArray(buildTrailPairs(tabMin, tabMax, multMin, multMax));
        // Restaura o ponto do ciclo dessa faixa (se existir)
        const savedIdx = getSavedTrailIndexForKey(key, expectedLen);
        gameState.multiplication.trailPairIndex = savedIdx;


        gameState.multiplication.trailMin = tabMin;
        gameState.multiplication.trailMax = tabMax;
        gameState.multiplication.multMin = multMin;
        gameState.multiplication.multMax = multMax;
        gameState.multiplication.trailRangeKey = key;
        saveMultiplicationConfig();
    }

    // garante índice válido
    if (!Number.isInteger(gameState.multiplication.trailPairIndex) || gameState.multiplication.trailPairIndex < 0 || gameState.multiplication.trailPairIndex >= expectedLen) {
        gameState.multiplication.trailPairIndex = 0;
    }
}

function getNextTrailPair() {
    ensureTrailPairs();
    const pairs = Array.isArray(gameState.multiplication.trailPairs) ? gameState.multiplication.trailPairs : [];
    if (pairs.length === 0) return [0, 0];

    if (gameState.multiplication.trailPairIndex >= pairs.length) {
        // completou o ciclo → nova ordem aleatória
        const tabMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
        const tabMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
        const multMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 1;
        const multMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 10;
        gameState.multiplication.trailPairs = shuffleArray(buildTrailPairs(tabMin, tabMax, multMin, multMax));
        gameState.multiplication.trailPairIndex = 0;
    }

    const pair = gameState.multiplication.trailPairs[gameState.multiplication.trailPairIndex];
    gameState.multiplication.trailPairIndex++;
    saveMultiplicationConfig();
    return pair;
}

function getTrailPairsBankSize(tabMin, tabMax, multMin, multMax) {
    const tCount = Math.max(0, (tabMax - tabMin + 1));
    const mCount = Math.max(0, (multMax - multMin + 1));
    return tCount * mCount;
}

// Modo direto: multiplicadores embaralhados para a tabuada escolhida
function prepareRoundMultipliersForCurrentLevel() {
    const multMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 10;
    const multMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 1;
    gameState.multiplication.roundMultipliers = shuffleArray(rangeInclusive(multMin, multMax));
    gameState.multiplication.roundPos = 0;
}

function getNextRoundMultiplier() {
    const multMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 10;
    const multMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 1;
    const expectedLen = (multMax - multMin + 1);

    if (!Array.isArray(gameState.multiplication.roundMultipliers) || gameState.multiplication.roundMultipliers.length !== expectedLen) {
        prepareRoundMultipliersForCurrentLevel();
    }
    if (gameState.multiplication.roundPos >= gameState.multiplication.roundMultipliers.length) {
        prepareRoundMultipliersForCurrentLevel();
    }
    const v = gameState.multiplication.roundMultipliers[gameState.multiplication.roundPos];
    gameState.multiplication.roundPos++;
    return v;
}

// --- UI: Progresso do ciclo (Tabuada) ---
function ensureCycleProgressBadge() {
    if (cycleProgressBadge) return cycleProgressBadge;
    const el = document.createElement('div');
    el.id = 'mm-cycle-progress';
    el.className = 'mm-cycle-progress';
    el.style.display = 'none';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    cycleProgressBadge = el;
    return el;
}

function hideCycleProgressBadge() {
    const el = ensureCycleProgressBadge();
    el.style.display = 'none';
}

function updateCycleProgressUI() {
    const el = ensureCycleProgressBadge();

    const isMultiplication = (gameState.currentOperation === 'multiplication');
    const hasMultCfg = !!(gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail'));
    const isGameScreen = (gameState.currentScreen === 'game-screen');

    if (!isGameScreen || !isMultiplication || !hasMultCfg) {
        el.style.display = 'none';
        return;
    }

    // Trilha: mostra progresso do ciclo (ex.: 34/66)
    if (gameState.multiplication.mode === 'trail') {
        const tMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
        const tMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
        const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
        const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
        const bankSize = getTrailPairsBankSize(tMin, tMax, mMin, mMax);

        const current = Math.min(Math.max(Number(gameState.multiplication.trailPairIndex || 0), 0), bankSize);
        el.textContent = `Progresso do ciclo: ${current}/${bankSize}`;
        el.style.display = 'inline-flex';
        return;
    }

    // Direto: mostra progresso da tabuada (ex.: 6/11)
    const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
    const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
    const total = Math.max(0, (mMax - mMin + 1));
    const current = Math.min(Math.max(Number(gameState.multiplication.roundPos || 0), 0), total);
    el.textContent = `Progresso da tabuada: ${current}/${total}`;
    el.style.display = 'inline-flex';
}



// Modal: escolha de Tabuada / Trilha
function ensureMultiplicationModal() {
    if (document.getElementById('mm-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'mm-modal-overlay';
    overlay.className = 'mm-modal-overlay hidden';
    overlay.innerHTML = `
        <div class="mm-modal" role="dialog" aria-modal="true" aria-label="Configuração da multiplicação">
            <div class="mm-modal-header">
                <h2>Multiplicação — Tabuada</h2>
                <button class="mm-close" type="button" aria-label="Fechar">✕</button>
            </div>
            <p class="mm-sub" id="mm-range-line">Nível: —</p>
            <p class="mm-sub">Escolha como você quer treinar:</p>

            <div class="mm-actions">
                <button type="button" class="mm-btn mm-primary" data-mm="trail">🗺️ Trilha automática</button>
                <button type="button" class="mm-btn" data-mm="direct">🎯 Escolher tabuada</button>
            </div>

            <div class="mm-direct hidden" aria-label="Escolher tabuada">
                <p class="mm-sub2" id="mm-direct-title">Selecione a tabuada:</p>
                <div class="mm-grid" id="mm-grid"></div>
            </div>

            <div class="mm-footer">
                <small id="mm-footer-tip">Dica: a trilha percorre as tabuadas desta faixa em uma ordem aleatória.</small>
            </div>
        </div>
`;
    document.body.appendChild(overlay);

    const getCurrentRange = () => getTabuadaRangeByLevel(gameState.multiplication.pendingLevel || gameState.currentLevel || 'medium');

    const renderRangeTexts = () => {
        const r = getCurrentRange();
        const rangeLine = overlay.querySelector('#mm-range-line');
        const footerTip = overlay.querySelector('#mm-footer-tip');
        const directTitle = overlay.querySelector('#mm-direct-title');
        if (rangeLine) rangeLine.textContent = `Nível: ${r.label} — Tabuadas ${r.min} a ${r.max} — Multiplicadores ${r.multMin} a ${r.multMax}`;
        if (footerTip) footerTip.textContent = `Dica: a trilha percorre as tabuadas de ${r.min} a ${r.max} em ordem aleatória, usando multiplicadores de ${r.multMin} a ${r.multMax} (também em ordem aleatória).`;
        if (directTitle) directTitle.textContent = `Selecione a tabuada (${r.min} a ${r.max}):`;
    };

    const renderTabuadaGrid = () => {
        const r = getCurrentRange();
        const grid = overlay.querySelector('#mm-grid');
        if (!grid) return;
        grid.innerHTML = '';
        for (let i = r.min; i <= r.max; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mm-grid-btn';
            b.textContent = String(i);
            b.addEventListener('click', () => {
                // 🔒 Modo direto (Escolher tabuada) é estrito:
                // - fixa a tabuada escolhida
                // - usa multiplicadores 1–10
                // - força o nível coerente com a tabuada (evita “vazar” para 6–10/11–20)
                const levelForTabuada = (n) => (n <= 5 ? 'easy' : (n <= 10 ? 'medium' : 'advanced'));
                const lvl = levelForTabuada(i);

                gameState.multiplication.mode = 'direct';
                gameState.multiplication.tabuada = i;
                gameState.multiplication.directLock = true;
                gameState.multiplication.lockTabuada = i;
                gameState.multiplication.directMultipliers = [];
                gameState.multiplication.pendingLevel = lvl;
                gameState.currentLevel = lvl;

                // multiplicadores fixos por tabuada (direto):
                // - 0–10: x 1..10
                // - 11–20: x 1..20
                const maxMul = (i >= 11 ? 20 : 10);
                gameState.multiplication.multMin = 1;
                gameState.multiplication.multMax = maxMul;
                gameState.multiplication.roundMultipliers = null;
                gameState.multiplication.roundPos = 0;

                // faixa de exibição coerente com o nível calculado
                const rr = getTabuadaRangeByLevel(lvl);
                gameState.multiplication.trailMin = rr.min;
                gameState.multiplication.trailMax = rr.max;
                gameState.multiplication.trailRangeKey = `${rr.min}-${rr.max}|1-${gameState.multiplication.multMax}`;

                saveMultiplicationConfig();
                close();
                startGame('multiplication', lvl);
            });
            b.addEventListener('pointerup', (ev) => { ev.preventDefault(); ev.stopPropagation(); b.click(); });
            grid.appendChild(b);
        }
    };

    // Render inicial (atualiza quando abrir)
    renderRangeTexts();

    const close = () => overlay.classList.add('hidden');
    overlay.querySelector('.mm-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });


    // Clique explícito (evita “tocar em um e executar o outro” em alguns celulares)
    const btnTrail = overlay.querySelector('[data-mm="trail"]');
    const btnDirect = overlay.querySelector('[data-mm="direct"]');

    const handleTrail = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const r = getCurrentRange();
        gameState.multiplication.mode = 'trail';
        gameState.multiplication.directLock = false;
        gameState.multiplication.lockTabuada = null;
        gameState.multiplication.directMultipliers = [];
        ensureTrailPairs(r.min, r.max, r.multMin, r.multMax);
        saveMultiplicationConfig();
        close();
        startGame('multiplication', gameState.multiplication.pendingLevel || gameState.currentLevel || 'medium');
    };

    const handleDirect = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const directBox = overlay.querySelector('.mm-direct');
        if (directBox) directBox.classList.remove('hidden');
        renderRangeTexts();
        renderTabuadaGrid();
    };

    const bindClick = (btn, handler) => {
        if (!btn) return;
        btn.addEventListener('click', handler);
        btn.addEventListener('pointerup', (ev) => { ev.preventDefault(); ev.stopPropagation(); handler(ev); });
        btn.addEventListener('touchend', (ev) => { ev.preventDefault(); ev.stopPropagation(); handler(ev); }, { passive: false });
    };

    bindClick(btnTrail, handleTrail);
    bindClick(btnDirect, handleDirect);

    // Botões principais
}

function openMultiplicationConfig(level) {
    ensureMultiplicationModal();
    gameState.multiplication.pendingLevel = level;

    // Ajusta a faixa do nível apenas para exibição (não aplica na config ainda)
    const r = getTabuadaRangeByLevel(level);
    gameState.multiplication.trailMin = r.min;
    gameState.multiplication.trailMax = r.max;
    // A escolha (trilha vs tabuada) define o resto.

    const overlay = document.getElementById('mm-modal-overlay');
    if (!overlay) return;

    // Atualiza textos do modal para a faixa do nível
    const rangeLine = overlay.querySelector('#mm-range-line');
    const footerTip = overlay.querySelector('#mm-footer-tip');
    const directTitle = overlay.querySelector('#mm-direct-title');
    if (rangeLine) rangeLine.textContent = `Nível: ${r.label} — Tabuadas ${r.min} a ${r.max} — Multiplicadores ${r.multMin} a ${r.multMax}`;
    if (footerTip) footerTip.textContent = `Dica: a trilha percorre as tabuadas de ${r.min} a ${r.max} em ordem aleatória, usando multiplicadores de ${r.multMin} a ${r.multMax} (também em ordem aleatória).`;
    if (directTitle) directTitle.textContent = `Selecione a tabuada (${r.min} a ${r.max}):`;

    overlay.classList.remove('hidden');
}

/**
 * Gera uma questão matemática baseada na operação e nível de dificuldade.
 * @param {string} operation - A operação matemática.
 * @returns {object} { question: string, answer: number, options: number[] }
 */

/**
 * v19.2 — Gera pools fixos (50) de Adição/Subtração por nível para reduzir repetição e dar previsibilidade.
 * Mantém restrições mais leves para turma fraca (Base 6º–7º: easy/medium <= 20).
 */
function buildAddSubPool(operation, level, size = 50) {
    const pairs = [];
    const seen = new Set();

    const isBaseSafe = (typeof isCampaignBase === 'function') && isCampaignBase() && (level === 'easy' || level === 'medium');
    const maxBase = 20;

    // Faixas por nível (modo livre e reforço)
    const ranges = {
        easy:   { min: 0,  max: isBaseSafe ? maxBase : 30 },
        medium: { min: 0,  max: isBaseSafe ? maxBase : 120 },
        advanced:{ min: 0, max: 500 }
    };
    const r = ranges[level] || ranges.medium;

    let guard = 0;
    while (pairs.length < size && guard < size * 80) {
        guard++;

        let a, b;
        if (operation === 'addition') {
            // easy: parte sem vai-um; medium: mistura; advanced: mais amplitude
            if (level === 'easy') {
                const au = randomInt(0, 9);
                const bu = randomInt(0, 9-au); // sem vai-um
                const at = randomInt(0, Math.floor(r.max / 10));
                const bt = randomInt(0, Math.floor(r.max / 10));
                a = at * 10 + au;
                b = bt * 10 + bu;
                if (isBaseSafe && (a + b) > maxBase) continue;
            } else if (level === 'medium') {
                // 55% com vai-um para consolidar
                const wantCarry = Math.random() < 0.55;
                if (wantCarry) {
                    const au = randomInt(0, 9);
                    const bu = randomInt(Math.max(10 - au, 0), 9);
                    const at = randomInt(0, Math.floor(r.max / 10));
                    const bt = randomInt(0, Math.floor(r.max / 10));
                    a = at * 10 + au;
                    b = bt * 10 + bu;
                } else {
                    a = randomInt(r.min, r.max);
                    b = randomInt(r.min, r.max);
                }
                if (isBaseSafe && (a + b) > maxBase) continue;
            } else {
                a = randomInt(r.min, r.max);
                b = randomInt(r.min, r.max);
            }
            const key = `${a}+${b}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push([a, b]);
        } else {
            // subtraction: garante resultado >= 0
            if (level === 'easy') {
                a = randomInt(0, r.max);
                b = randomInt(0, Math.min(a, r.max));
            } else if (level === 'medium') {
                const wantBorrow = Math.random() < 0.55;
                if (wantBorrow) {
                    // força empréstimo nas unidades: u1 < u2
                    const u2 = randomInt(1, 9);
                    const u1 = randomInt(0, u2 - 1);
                    const t1 = randomInt(0, Math.floor(r.max / 10));
                    const t2 = randomInt(0, Math.min(t1, Math.floor(r.max / 10)));
                    a = t1 * 10 + u1;
                    b = t2 * 10 + u2;
                    if (a < b) { const tmp = a; a = b; b = tmp; }
                } else {
                    a = randomInt(r.min, r.max);
                    b = randomInt(r.min, r.max);
                    if (a < b) { const tmp = a; a = b; b = tmp; }
                }
            } else {
                a = randomInt(r.min, r.max);
                b = randomInt(r.min, r.max);
                if (a < b) { const tmp = a; a = b; b = tmp; }
            }
            if (isBaseSafe && a > maxBase) { a = randomInt(0, maxBase); b = randomInt(0, a); }
            const key = `${a}-${b}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push([a, b]);
        }
    }

    // fallback: se por algum motivo não completou, preenche repetindo
    while (pairs.length < size && pairs.length > 0) pairs.push(pairs[pairs.length % pairs.length]);
    return pairs;
}

function ensureAddSubPool(operation, level) {
    if (!gameState.addSubPools) return;
    const lvl = (normalizeLevelKey(level) === 'easy' || normalizeLevelKey(level) === 'medium' || normalizeLevelKey(level) === 'advanced') ? normalizeLevelKey(level) : 'medium';
    const cur = gameState.addSubPools[operation] && gameState.addSubPools[operation][lvl];
    const idx = gameState.addSubPools.idx && gameState.addSubPools.idx[operation] ? gameState.addSubPools.idx[operation][lvl] : 0;
    if (!cur || cur.length !== gameState.addSubPools.size || idx >= cur.length) {
        gameState.addSubPools[operation][lvl] = buildAddSubPool(operation, lvl, gameState.addSubPools.size);
        gameState.addSubPools.idx[operation][lvl] = 0;
    }
}

function nextFromAddSubPool(operation, level) {
    if (!gameState.addSubPools) return null;
    const lvl = (normalizeLevelKey(level) === 'easy' || normalizeLevelKey(level) === 'medium' || normalizeLevelKey(level) === 'advanced') ? normalizeLevelKey(level) : 'medium';
    ensureAddSubPool(operation, lvl);
    const arr = gameState.addSubPools[operation][lvl];
    const i = gameState.addSubPools.idx[operation][lvl] || 0;
    const pair = arr && arr[i] ? arr[i] : null;
    gameState.addSubPools.idx[operation][lvl] = i + 1;
    return pair;
}


function generateQuestion(operation) {
    let num1, num2, answer, questionString, questionSpeak;
    
    // Define o fator de dificuldade baseado no nível
    let diffFactor;
    switch (gameState.currentLevel) {
        case 'easy':
            diffFactor = 1;
            break;
        case 'medium':
            diffFactor = 2;
            break;
        case 'advanced':
            diffFactor = 3;
            break;
        default:
            diffFactor = 1;
    } 

    switch (operation) {
        case 'addition':
            {
                const effectiveLevel = (gameState.multiplication && gameState.multiplication.pendingLevel) ? gameState.multiplication.pendingLevel : gameState.currentLevel;
                const lvl = normLevelKey(effectiveLevel);
                const useFixed = Math.random() < 0.70;
                let pair = null;
                if (useFixed) pair = nextFromFixedPool('addition', lvl);
                if (!pair) {
                    const key = pickBucketKey(PET_BLUEPRINT.add[lvl].buckets);
                    pair = genAdd(lvl, key);
                }
                num1 = pair[0];
                num2 = pair[1];
                answer = num1 + num2;
                questionString = `${num1} + ${num2}`;
                questionSpeak = `${num1} mais ${num2}`;
                maybeRebuildFixedPool('addition', lvl);
            }
            break;
case 'subtraction':
            {
                const effectiveLevel = (gameState.multiplication && gameState.multiplication.pendingLevel) ? gameState.multiplication.pendingLevel : gameState.currentLevel;
                const lvl = normLevelKey(effectiveLevel);
                const useFixed = Math.random() < 0.70;
                let pair = null;
                if (useFixed) pair = nextFromFixedPool('subtraction', lvl);
                if (!pair) {
                    const key = pickBucketKey(PET_BLUEPRINT.sub[lvl].buckets);
                    pair = genSub(lvl, key);
                }
                num1 = pair[0];
                num2 = pair[1];
                answer = num1 - num2;
                questionString = `${num1} - ${num2}`;
                questionSpeak = `${num1} menos ${num2}`;
                maybeRebuildFixedPool('subtraction', lvl);
            }
            break;
case 'multiplication':
            {
                const effectiveLevel = (gameState.multiplication && gameState.multiplication.pendingLevel) ? gameState.multiplication.pendingLevel : gameState.currentLevel;
                const lvl = normLevelKey(effectiveLevel);
                const range = PET_BLUEPRINT.mult[lvl] || PET_BLUEPRINT.mult.easy;

                const mulState = gameState.multiplication || (gameState.multiplication = {});
                // sempre atualiza a faixa da trilha para exibição (não interfere no modo direto)
                mulState.trailMin = range.tabMin;
                mulState.trailMax = range.tabMax;

                const isDirect = (mulState.mode === 'direct') || (mulState.directLock === true);

                if (isDirect) {
                    // Modo Estudo (revisão): usa apenas erros pendentes, 3 acertos por erro
                    if (isStudy() && gameState.sessionConfig && gameState.sessionConfig.type==='study_mul' && gameState.sessionConfig.phase==='review') {
                        const picked = studyMulPickReviewPair();
                        if (picked) {
                            num1 = picked[0];
                            num2 = picked[1];
                            mulState.__reviewKey = picked[2];
                        }
                    }

                    if (num1 != null && num2 != null) {
                        mulState.directLock = true;
                    } else {
                    // 🔒 Modo direto: tabuada FIXA escolhida pelo estudante, SEM qualquer ajuste por nível
                    const t = Number.isInteger(mulState.lockTabuada) ? mulState.lockTabuada
                            : (Number.isInteger(mulState.tabuada) ? mulState.tabuada : 1);

                    mulState.directLock = true;
                    mulState.lockTabuada = t;
                    mulState.tabuada = t;

                    // multiplicadores fixos por tabuada:
                    // - 0–10: x 1..10
                    // - 11–20: x 1..20
                    const maxMul = (t >= 11 ? 20 : 10);

                    mulState.multMin = 1;
                    mulState.multMax = maxMul;
                    if (!Array.isArray(mulState.directMultipliers) || mulState.directMultipliers.length === 0) {
                        mulState.directMultipliers = [];
                        for (let k = 1; k <= maxMul; k++) mulState.directMultipliers.push(k);
                        shuffleArray(mulState.directMultipliers);
                    }
                    const mVal = mulState.directMultipliers.pop();

num1 = t;
                    num2 = mVal;
                    }
                } else {
                    // Trilha: 70% pool fixo (50) + 30% gerador por regras (anti-decor)
                    const useFixed = Math.random() < 0.70;
                    let pair = null;
                    if (useFixed) pair = nextFromFixedPool('multiplication', lvl);
                    if (!pair) pair = genMultPair(lvl);

                    // garante tabuada na faixa
                    if (pair[0] < range.tabMin || pair[0] > range.tabMax) pair[0] = randomInt(range.tabMin, range.tabMax);

                    num1 = pair[0];
                    num2 = pair[1];

                    // não sobrescreve tabuada caso o modo direto tenha sido travado
                    if (!mulState.directLock) mulState.tabuada = num1;

                    maybeRebuildFixedPool('multiplication', lvl);
                }

                answer = num1 * num2;
                questionString = `${num1} x ${num2}`;
                questionSpeak = `${num1} vezes ${num2}`;
            }
            break;
case 'division':
            let divisor = randomInt(2, diffFactor < 3 ? 8 : 12);
            let quotient = randomInt(2, diffFactor < 3 ? 10 : 20);
            num1 = divisor * quotient;
            num2 = divisor;
            answer = quotient;
            questionString = `${num1} ÷ ${num2}`;
            questionSpeak = `${num1} dividido por ${num2}`;
            break;
        case 'potenciacao':
            // Potências: exibir como 2³ e ler como “2 elevado a 3” no modo voz
            num1 = randomInt(2, diffFactor < 3 ? 5 : 8);
            num2 = randomInt(2, diffFactor < 3 ? 4 : 5);
            answer = Math.pow(num1, num2);
            questionString = `${num1}${toSuperscript(num2)}`;
            questionSpeak = `${num1} elevado a ${num2}`;
            break;
        case 'radiciacao':
            // Raízes quadradas maiores no nível avançado
            answer = randomInt(2, diffFactor < 3 ? 12 : 15);
            num1 = answer * answer;
            questionString = `√${num1}`;
            questionSpeak = `raiz quadrada de ${num1}`;
            break;
        default:
            return { question: "Erro", answer: 0, options: [0, 1, 2, 3] };
    }

    // Gera as opções de resposta
    const options = [answer];
    while (options.length < 4) {
        let diffFactorOptions = Math.max(1, Math.round(Math.abs(answer) * 0.1));
        let incorrect = answer + randomInt(-5 * diffFactorOptions, 5 * diffFactorOptions);
        
        if (incorrect >= 0 && !options.includes(incorrect) && incorrect !== answer) {
            options.push(incorrect);
        }
    }

    // Embaralha as opções
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }

    
    // Texto para leitura em voz (se não definido, usa o mesmo do display)
    if (!questionSpeak) questionSpeak = questionString;

return { 
        question: questionString + ' = ?',
        voiceQuestion: questionSpeak, 
        answer: answer, 
        options: options,
        // Informação extra para salvar erro
        operacao: operation,
        num1: num1,
        num2: num2,
        reviewKey: (gameState.multiplication && gameState.multiplication.__reviewKey) ? gameState.multiplication.__reviewKey : null
    };
}


// --- LÓGICA DE CONTROLE DE FLUXO E ESTADO DE JOGO ---

/**
 * Inicia o jogo após a seleção da operação e do nível.
 * @param {string} operation - A operação selecionada.
 * @param {string} level - O nível selecionado ('easy', 'medium', 'advanced').
 */
function startGame(operation, level) {
    if (!operation || !level) {
        showFeedbackMessage("Erro: Operação ou Nível não selecionados!", 'error');
        exibirTela('home-screen');
        return;
    }

    // 1. Resetar o estado do jogo
    gameState.currentOperation = operation;
    gameState.currentLevel = level;
 
    
    // mantém nível pendente para a multiplicação (evita faixa errada no 'Escolher tabuada')
    if(operation === 'multiplication' && gameState.multiplication){
        gameState.multiplication.pendingLevel = level;
        // No modo 'Escolher tabuada', multiplicadores são fixos por tabuada:
        // - 0–10: x 1..10
        // - 11–20: x 1..20
        if (gameState.multiplication.mode === 'direct' || gameState.multiplication.directLock === true) {
            const t = Number.isInteger(gameState.multiplication.lockTabuada) ? gameState.multiplication.lockTabuada
                : (Number.isInteger(gameState.multiplication.tabuada) ? gameState.multiplication.tabuada : 1);
            const maxMul = (t >= 11 ? 20 : 10);
            gameState.multiplication.multMin = 1;
            gameState.multiplication.multMax = maxMul;
        }
    }
gameState.isGameActive = true;
    gameState.score = 0;
    gameState.questionNumber = 0;
    gameState.acertos = 0;
    gameState.answerTimes = [];
    gameState.fastAnswers = 0;
    gameState.suspectSession = false;
    gameState.__inMicro = false;
    gameState.__tagStreak = {};

    gameState.erros = 0;
    gameState.sessionStartTs = Date.now();
    
    
    const __cfg = gameState.sessionConfig;
    if (__cfg && typeof __cfg.forceRapidMode === 'boolean') {
        gameState.isRapidMode = __cfg.forceRapidMode;
    }

    gameState.totalQuestions = gameState.isRapidMode ? 20 : Infinity;

    
    if (__cfg && Number.isFinite(__cfg.totalQuestions)) {
        gameState.totalQuestions = Math.max(1, Math.floor(__cfg.totalQuestions));
    }

    // Mostra/oculta o timer conforme modo (Estudo/Defasagem sem pressão)
    const __timerContainer = document.getElementById('timer-container');
    if (__timerContainer) __timerContainer.style.display = gameState.isRapidMode ? 'block' : 'none';
// --- Configuração especial: Tabuada da Multiplicação (por níveis) ---
if (operation === 'multiplication' && gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail')) {
    const r = getTabuadaRangeByLevel(level);

    // Sempre registra a faixa do nível (para UI e trilha)
    gameState.multiplication.trailMin = r.min;
    gameState.multiplication.trailMax = r.max;

    // 🔒 Direto (Escolher tabuada) é ESTRITO:
    // - tabuada fixa escolhida
    // - multiplicadores fixos 1–10 (independente do nível)
    // - NÃO sobrescreve com a faixa do nível (isso causava vazamento/bug)
    if (gameState.multiplication.mode === 'direct') {
        gameState.multiplication.multMin = 1;
        gameState.multiplication.multMax = 10;
        gameState.multiplication.trailRangeKey = `${r.min}-${r.max}|1-10`;

        
        // Direto: embaralha 1–10 e percorre sem repetir até completar
        prepareRoundMultipliersForCurrentLevel();

        // Sessão = 10 questões (1..10)
        gameState.totalQuestions = (gameState.multiplication.multMax - gameState.multiplication.multMin + 1);
        saveMultiplicationConfig();
    } else {
        // Trilha: aplica faixa do nível para tabuadas e multiplicadores
        gameState.multiplication.multMin = r.multMin;
        gameState.multiplication.multMax = r.multMax;
        gameState.multiplication.trailRangeKey = `${r.min}-${r.max}|${r.multMin}-${r.multMax}`;

        // Trilha: TODAS as contas do nível, em ordem aleatória (sem repetir até completar)
        ensureTrailPairs(r.min, r.max, r.multMin, r.multMax);

        // Se já houver progresso salvo no ciclo, joga apenas o restante para fechar o ciclo.
        const bankSize = getTrailPairsBankSize(r.min, r.max, r.multMin, r.multMax);
        const idx = Number.isInteger(gameState.multiplication.trailPairIndex) ? gameState.multiplication.trailPairIndex : 0;
        const remaining = Math.max(0, bankSize - idx);
        gameState.totalQuestions = remaining > 0 ? remaining : bankSize;

        saveMultiplicationConfig();
    }
}

    // 2. Configura o tempo máximo baseado no nível e acessibilidade
    let baseTime;
    switch (level) {
        case 'easy':
            baseTime = 150; // 15s (10 ticks/s)
            break;
        case 'medium':
            baseTime = 300; // 30s
            break;
        case 'advanced':
            baseTime = 450; // 45s
            break;
        default:
            baseTime = 300;
    }

    // Regra de Acessibilidade: Dobra o tempo se o Modo Rápido estiver ativo E Acessibilidade (Voz ou Libras) estiver ativa
    const isLibrasActive = document.body.classList.contains('libras-mode');
    const isAccessibilityActive = gameState.isVoiceReadActive || isLibrasActive;
    
    // Atualiza o tempo máximo. Se não for Modo Rápido, o tempo é infinito
    if (gameState.isRapidMode) {
        gameState.maxTime = isAccessibilityActive ? baseTime * 2 : baseTime;
    } else {
        gameState.maxTime = Infinity;
    }
    
    gameState.timeLeft = gameState.maxTime;


    // 3. Atualizar UI do Game Header
    playerScoreElement.textContent = `0 Pontos`;
    
    // 4. Configurações de UI para Modo Estudo vs Rápido
    const timeContainer = timeBar.parentElement;
    if (!gameState.isRapidMode) {
        timeContainer.style.display = 'none';
        btnExtendTime.style.display = 'none';
        btnShowAnswer.style.display = 'block'; // Ajuda é foco no modo Estudo
    } else {
        timeContainer.style.display = 'block';
        btnExtendTime.style.display = 'block';
        btnShowAnswer.style.display = 'block';
        timeBar.style.width = '100%';
        timeBar.style.backgroundColor = 'var(--cor-sucesso)';
    }

    // 5. Iniciar o ciclo de perguntas
    nextQuestion();
    
    // 6. Iniciar o Timer (Se for Modo Rápido)
    if (gameState.isRapidMode) {
        startTimer();
    }

    // 7. Mudar para a tela de jogo
    exibirTela('game-screen');

    // Mentor: plano curto (opcional)
    try { mentorPlanMessage(); } catch (_) {}

    // Mostra/atualiza o progresso do ciclo da Tabuada (se aplicável)
    updateCycleProgressUI();
}


function nextQuestion() {
    // Fim de jogo (Modo Rápido) OU rodada completa da Tabuada (modo direto/trilha)
    const isTabuadaRound = (gameState.currentOperation === 'multiplication' && gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail'));
    const isFiniteSession = Number.isFinite(gameState.totalQuestions) && gameState.totalQuestions !== Infinity;
    if (((gameState.isRapidMode || isFiniteSession) && gameState.questionNumber >= gameState.totalQuestions) || (isTabuadaRound && gameState.questionNumber >= gameState.totalQuestions)) {
        endGame();
        return;
    }
gameState.questionNumber++;
    
    // 1. Gerar nova questão 
    const newQ = generateQuestion(gameState.currentOperation);
    gameState.currentQuestion = newQ;
    // ID estável para anti-vazamento (treino vs validação)
    // Se for validação: evita itens vistos recentemente no treino
    try{
      if(gameState.sessionConfig && gameState.sessionConfig.validation===true){
        let tries=0;
        while(tries<12 && isRecentlySeenInTrain(newQ, 14)){
          const reroll = generateQuestion(gameState.currentOperation);
          newQ.question = reroll.question; newQ.answer = reroll.answer; newQ.options = reroll.options; newQ.voiceOptions = reroll.voiceOptions;
          newQ.operacao = reroll.operacao; newQ.num1 = reroll.num1; newQ.num2 = reroll.num2;
          const a = (newQ.num1!=null)?newQ.num1:''; const b=(newQ.num2!=null)?newQ.num2:'';
          newQ.id = `${gameState.currentOperation}|${a}|${b}`;
          tries++;
        }
      }
    }catch(_){ }

    try{
      if(!newQ.id){
        const a = (newQ.num1!=null)?newQ.num1:'';
        const b = (newQ.num2!=null)?newQ.num2:'';
        newQ.id = `${gameState.currentOperation}|${a}|${b}`;
      }
      if(!newQ.skillTag){ newQ.skillTag = computeSkillTag(newQ, null); }
      // Marca como visto no treino (exceto validação)
      if(!(gameState.sessionConfig && gameState.sessionConfig.validation===true)) rememberTrainItem(newQ);
    }catch(_){ }
    gameState.qStartTs = Date.now();
    gameState.attemptsThisQuestion = 0;
    // 2. Atualizar UI
    const totalDisplay = (gameState.isRapidMode || isTabuadaRound || isFiniteSession) ? gameState.totalQuestions : '∞';
    questionCounter.textContent = `Questão: ${gameState.questionNumber}/${totalDisplay}`;
    questionText.textContent = newQ.question;

    // Atualiza badge de progresso do ciclo (Tabuada)
    updateCycleProgressUI();
    
    // 3. Atualizar opções de resposta
    answerOptions.forEach((btn, index) => {
        // Garante o prefixo "1) 2) 3) 4)" (menor que o número da resposta)
        let idxSpan = btn.querySelector('.answer-index');
        const txtSpan = btn.querySelector('.answer-text');
        if (!idxSpan) {
            idxSpan = document.createElement('span');
            idxSpan.className = 'answer-index';
            btn.insertBefore(idxSpan, txtSpan);
        }
        idxSpan.textContent = `${index + 1})`;

        // Usa o texto da opção gerada
        txtSpan.textContent = newQ.options[index];
        btn.classList.remove('correct', 'wrong');
        btn.disabled = false;
    });

    // 4. Leitura de Voz
    announceCurrentQuestion();
}


/** Salva a pergunta que foi respondida incorretamente e persiste no localStorage. */
function saveError(question, userAnswer) {
    const errorData = {
        question: question.question,
        correctAnswer: question.answer,
        userAnswer: userAnswer,
        operation: question.operacao,
        num1: question.num1 ?? null,
        num2: question.num2 ?? null,
        // para potenciação, num2 é o expoente
        timestamp: Date.now(),
        level: gameState.currentLevel,
        mode: gameState.isRapidMode ? 'rapido' : 'estudo',
        skillTag: (gameState.v17 && gameState.v17.currentSkillTag) ? gameState.v17.currentSkillTag : null
    };
    try{ studyMulRecordError(question); }catch(_){ }
    gameState.errors.unshift(errorData);
    salvarErros();
}



/* ------------------ Pedagogia: skillTag + explicação (v20) ------------------ */
const TRAIN_SEEN_KEY = 'pet_seen_train_ids_v1';
function loadSeenTrain(){
  try{ return JSON.parse(LS.get(TRAIN_SEEN_KEY) || '{}'); }catch(_){ return {}; }
}
function saveSeenTrain(map){
  try{ LS.set(TRAIN_SEEN_KEY, JSON.stringify(map)); }catch(_){}
}
function rememberTrainItem(q){
  try{
    if(!q || !q.id) return;
    const map = loadSeenTrain();
    map[q.id] = Date.now();
    saveSeenTrain(map);
  }catch(_){}
}
function isRecentlySeenInTrain(q, days=14){
  try{
    if(!q || !q.id) return false;
    const map = loadSeenTrain();
    const ts = map[q.id];
    if(!ts) return false;
    const ms = days*24*60*60*1000;
    return (Date.now()-ts) < ms;
  }catch(_){ return false; }
}
function normLevelKey(lvl){
  const v = String(lvl||'').toLowerCase();
  if(v==='fácil' || v==='facil' || v==='easy') return 'easy';
  if(v==='médio' || v==='medio' || v==='medium') return 'medium';
  if(v==='difícil' || v==='dificil' || v==='hard' || v==='advanced') return 'hard';
  return v || 'easy';
}
function computeSkillTag(q, userAnswer){
  const op = q?.operacao || q?.operation || gameState.currentOperation;
  const a = Number(q?.num1); const b = Number(q?.num2);
  if(op==='addition'){
    const uSum = (a%10)+(b%10);
    if(((a+b)%10)===0 || ((a+b)%20)===0) return 'ADD_C10';
    if(uSum>=10) return 'ADD_CARRY';
    return 'ADD_BASIC';
  }
  if(op==='subtraction'){
    if((a%10) < (b%10)) return 'SUB_BORROW';
    return 'SUB_NO_BORROW';
  }
  if(op==='multiplication'){
    const maxF = Math.max(a,b);
    if(a===9 || b===9) return 'MUL_9_ANCHOR';
    if(maxF>=11) return 'MUL_DIST_11_20';
    // confunde com soma?
    const sum = a+b;
    if(Number.isFinite(userAnswer) && (userAnswer===sum || Math.abs(userAnswer-sum)<=1)) return 'MUL_VS_ADD';
    return 'MUL_BASIC';
  }
  if(op==='division'){ return 'DIV_SHARE'; }
  return null;
}
function buildExplanation(q, tag){
  const op = q?.operacao || gameState.currentOperation;
  const a = Number(q?.num1); const b = Number(q?.num2);
  if(op==='addition' && tag==='ADD_C10'){
    const need = (10-(a%10))%10;
    if(need>0 && need<=9){
      return `${a} + ${b}: complete 10 primeiro. ${a} precisa de ${need} para virar ${a+need}. Depois some o resto.`;
    }
    return `${a} + ${b}: procure completar 10 (ou 20) e depois somar o que sobrou.`;
  }
  if(op==='addition' && tag==='ADD_CARRY'){
    const uSum=(a%10)+(b%10);
    return `${a} + ${b}: as unidades dão ${uSum}. Como passou de 10, troque 10 unidades por 1 dezena (vai‑um).`;
  }
  if(op==='subtraction' && tag==='SUB_BORROW'){
    return `${a} − ${b}: nas unidades não dá. Pegue 1 dezena e transforme em 10 unidades (empréstimo).`;
  }
  if(op==='subtraction' && tag==='SUB_NO_BORROW'){
    return `${a} − ${b}: dá para tirar nas unidades. Não precisa emprestar.`;
  }
  if(op==='multiplication' && tag==='MUL_VS_ADD'){
    return `${a} × ${b}: multiplicar é repetir grupos iguais (não é somar os fatores). Pense em ${a} grupos de ${b}.`;
  }
  if(op==='multiplication' && tag==='MUL_9_ANCHOR'){
    const n = (a===9)?b:a;
    return `9 × ${n}: use a âncora 10×${n} − ${n}.`;
  }
  if(op==='multiplication' && tag==='MUL_DIST_11_20'){
    const big=Math.max(a,b), n=Math.min(a,b);
    const rest = big-10;
    return `${big} × ${n}: quebre em 10×${n} + ${rest}×${n}.`;
  }
  if(op==='division'){
    return `${a} ÷ ${b}: dividir é repartir igualmente. Pense em grupos do mesmo tamanho.`;
  }
  return 'Use uma estratégia: pense antes de marcar.';
}
/* microcorreções: 5 itens dirigidos por tag */
function generateMicroSet(tag, level){
  const lvl = normLevelKey(level || gameState.currentLevel);
  const out=[];
  function pushQ(op,a,b){
    const q = generateQuestion(op); // base
    // overwrite if possible by building from numbers
    try{
      const built = buildQuestionFromNumbers(op,a,b);
      if(built) return out.push(built);
    }catch(_){}
    // fallback: keep generated
    out.push(q);
  }
  if(tag==='ADD_C10'){
    [[6,4],[8,2],[7,3],[14,6],[12,8]].forEach(([a,b])=>pushQ('addition',a,b));
  } else if(tag==='ADD_CARRY'){
    [[23,8],[37,6],[28,17],[46,18],[49,12]].forEach(([a,b])=>pushQ('addition',a,b));
  } else if(tag==='SUB_BORROW'){
    [[52,7],[41,9],[61,28],[70,46],[120,57]].forEach(([a,b])=>pushQ('subtraction',a,b));
  } else if(tag==='SUB_NO_BORROW'){
    [[54,12],[87,23],[69,14],[75,25],[92,41]].forEach(([a,b])=>pushQ('subtraction',a,b));
  } else if(tag==='MUL_VS_ADD'){
    [[2,4],[3,4],[4,3],[5,2],[5,4]].forEach(([a,b])=>pushQ('multiplication',a,b));
  } else if(tag==='MUL_9_ANCHOR'){
    [[9,4],[9,6],[9,7],[9,8],[9,9]].forEach(([a,b])=>pushQ('multiplication',a,b));
  } else if(tag==='MUL_DIST_11_20'){
    [[11,6],[12,7],[15,8],[18,6],[14,9]].forEach(([a,b])=>pushQ('multiplication',a,b));
  } else if(tag==='DIV_SHARE'){
    [[12,3],[15,5],[18,6],[20,4],[24,6]].forEach(([a,b])=>pushQ('division',a,b));
  }
  return out.slice(0,5).map(q=>{
    // ensure no timer in micro
    return q;
  });
}
function startMicroCorrection(tag){
  if(!tag) return;
  // evita loop infinito
  if(gameState.__inMicro) return;
  gameState.__inMicro = true;
  // sem tempo
  gameState.isTrainingErrors = true;
  gameState.isRapidMode = false;
  stopTimer();
  if(btnShowAnswer) btnShowAnswer.disabled = true;
  if(btnExtendTime) btnExtendTime.disabled = true;
  // fila dirigida
  const qs = generateMicroSet(tag, gameState.currentLevel);
  gameState.trainingQueue = qs.map(buildQuestionFromErrorSafe);
  gameState.trainingIndex = 0;
  gameState.totalQuestions = gameState.trainingQueue.length;
  gameState.questionNumber = 0;
  showFeedbackMessage(buildExplanation(gameState.currentQuestion, tag), 'info', 3200);
  // inicia
  nextTrainingQuestion(true);
}
/* helpers para fila dirigida */
function buildQuestionFromErrorSafe(q){
  // q pode vir como objeto questão já pronto
  if(q && q.question && q.options) return q;
  return q;
}

function handleAnswer(selectedAnswer, selectedButton) {
    if (!gameState.isGameActive) return;
    if (gameState.answerLocked) return;
    if (selectedButton && selectedButton.disabled) return;

    const q = gameState.currentQuestion;
    if (!q) return;

    const isTraining = !!gameState.isTrainingErrors;
    const isCorrect = selectedAnswer === q.answer;

    // Tempo de resposta (anti-chute)
    const dt = (gameState.qStartTs ? (Date.now() - gameState.qStartTs) : null);
    if (dt != null) {
        gameState.answerTimes.push(dt);
        if (dt < 600) gameState.fastAnswers = (gameState.fastAnswers || 0) + 1;
    }


    // Trava clique duplo muito rápido
    gameState.answerLocked = true;
    setTimeout(() => { gameState.answerLocked = false; }, 220);

    // Em treino: sem timer. No jogo: só para o timer quando for finalizar a questão.
    if (isTraining) {
        stopTimer();
    }

function buildQuestionFromNumbers(op, a, b){
  a = Number(a); b = Number(b);
  if(!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const operacao = op;
  let questionStr = '';
  let answer = 0;
  if(op==='addition'){ questionStr = `${a} + ${b} = ?`; answer = a+b; }
  else if(op==='subtraction'){ questionStr = `${a} - ${b} = ?`; answer = a-b; }
  else if(op==='multiplication'){ questionStr = `${a} × ${b} = ?`; answer = a*b; }
  else if(op==='division'){ questionStr = `${a} ÷ ${b} = ?`; answer = Math.floor(a/b); }
  else return null;
  const opts = generateOptions(answer, op);
  return { question: questionStr, answer, options: opts, voiceOptions: opts, operacao, num1:a, num2:b, id: `${op}|${a}|${b}`, skillTag: null };
}

    // Estilo: destaca o botão clicado
    if (selectedButton) {
        selectedButton.classList.remove('correct', 'wrong');
        selectedButton.classList.add(isCorrect ? 'correct' : 'wrong');
    }

    if (isCorrect) {
        // Modo Estudo (revisão multiplicação): decrementar contagem de revisão
        if (isStudy() && gameState.sessionConfig && gameState.sessionConfig.type==='study_mul' && gameState.sessionConfig.phase==='review') {
            const k = question.reviewKey || (question.num1 + ' x ' + question.num2);
            studyMulOnCorrectReview(k);
        }

        gameState.wrongStreak = 0;
        try{ gameState.__tagStreak = {}; gameState.__inMicro = false; }catch(_){ }
        // Finaliza (correto)
        if (gameState.isRapidMode && !isTraining) stopTimer();

        // Desabilita todos os botões
        answerOptions.forEach(btn => btn.disabled = true);

        // Marca a correta (caso tenha clicado em outra por algum bug)
        answerOptions.forEach(btn => {
            const v = parseInt(btn.querySelector('.answer-text').textContent);
            if (v === q.answer) btn.classList.add('correct');
        });

        // Pontos e XP (menos pontos se acertar depois de errar)
        gameState.acertos++;
        const baseGain = gameState.isRapidMode ? 20 * gameState.questionNumber : 10;
        const multiplier = (gameState.attemptsThisQuestion === 0) ? 1 : 0.7;
        const scoreGain = Math.round(baseGain * multiplier);
        const xpGain = gameState.isRapidMode ? 5 : 2;

        gameState.score += scoreGain;
        atualizarXP(xpGain);
        playerScoreElement.textContent = `${gameState.score} Pontos`;

        // Se acertou, repõe o tempo total para a próxima questão
        if (gameState.isRapidMode && !isTraining) {
            gameState.timeStep = gameState.baseTimeStep;
            gameState.lowTimeAlerted = false;
            gameState.timeLeft = gameState.maxTime;
            timeBar.style.width = '100%';
            timeBar.style.backgroundColor = 'var(--cor-sucesso)';
            librasAlert.classList.add('hidden');
        }

        showFeedbackMessage(
            (gameState.attemptsThisQuestion === 0) ? 'RESPOSTA CORRETA!' : 'CORRETA (após tentar de novo)!',
            'success'
        );

        if (isTraining) {
            // Avança só quando acertar
            setTimeout(() => {
                gameState.trainingIndex++;
                nextTrainingQuestion();
            }, 900);
            return;
        }

        // Próxima questão no jogo
        setTimeout(() => {
            if (gameState.isRapidMode) startTimer();
            nextQuestion();
        }, 1100);

        return;
    }

    // ERRO
    gameState.attemptsThisQuestion++;

    // Salva erro (mesmo que depois acerte, isso ajuda a mapear as dificuldades)
    gameState.erros++;
    atualizarXP(-2);
    saveError(q, selectedAnswer);

    // Feedback explicativo + microcorreção por erro recorrente
    const tag = computeSkillTag(q, selectedAnswer);
    try{ gameState.v17 = gameState.v17 || {}; gameState.v17.currentSkillTag = tag; }catch(_){ }
    const expl = buildExplanation(q, tag);
    if(!isTraining) showFeedbackMessage(expl, 'warning', 2600);
    gameState.__tagStreak = gameState.__tagStreak || {};
    gameState.__tagStreak[tag] = (gameState.__tagStreak[tag] || 0) + 1;
    // gatilho: 2 seguidos do mesmo tipo
    if(gameState.__tagStreak[tag] >= 2){
      setTimeout(()=>{ startMicroCorrection(tag); }, 450);
      gameState.__tagStreak[tag] = 0;
    }


    // No treino: não revela a resposta; deixa refazer até acertar
    if (isTraining) {
        // Desabilita só a alternativa errada (evita repetir a mesma)
        if (selectedButton) selectedButton.disabled = true;
        showFeedbackMessage('Ainda não. Tente outra alternativa!', 'warning', 1600);
        return;
    }

    // No jogo normal: permite refazer 1 vez (2 tentativas no total)
    if (gameState.attemptsThisQuestion < gameState.maxAttemptsPerQuestion) {
        if (selectedButton) selectedButton.disabled = true; // não deixa clicar de novo na mesma
        showFeedbackMessage('Quase! Tente outra alternativa.', 'warning', 1600);

        // Mantém o tempo correndo normalmente (não para o timer)
        if (gameState.isRapidMode) {
            // nada a fazer; o timer já está rodando
        }
        return;
    }

    // Finaliza (errou todas as tentativas)
    if (gameState.isRapidMode) stopTimer();

    // Revela a correta
    answerOptions.forEach(btn => {
        const v = parseInt(btn.querySelector('.answer-text').textContent);
        if (v === q.answer) btn.classList.add('correct');
        btn.disabled = true;
    });

    showFeedbackMessage('RESPOSTA INCORRETA!', 'warning', 1800);

    // Próxima questão (sem repor tempo)
    setTimeout(() => {
        if (gameState.isRapidMode) startTimer();
        nextQuestion();
    }, 1200);
}


function endGame() {
    gameState.isGameActive = false;
    gameState.__inMicro = false;
    if (gameState.isRapidMode) stopTimer();

    // 1. Calcular XP Ganhos na Rodada (apenas para exibição)
    const xpGained = gameState.acertos * (gameState.isRapidMode ? 5 : 2) - gameState.erros * 2 - gameState.erros * 0;
    
    // --- Anti-chute: marca sessão suspeita ---
    try{
        const total = (gameState.acertos||0)+(gameState.erros||0);
        const acc = total>0 ? (gameState.acertos/total) : 0;
        const fast = gameState.fastAnswers || 0;
        const median = (()=>{ const arr=(gameState.answerTimes||[]).slice().sort((a,b)=>a-b); if(arr.length===0) return null; return arr[Math.floor(arr.length/2)]; })();
        gameState.suspectSession = (total>=8 && acc<0.6 && (fast/Math.max(1,total))>0.55) || (median!=null && median<550 && acc<0.6);
    }catch(_){ gameState.suspectSession=false; }

    // 2. Atualizar UI de Resultados
    document.getElementById('final-score').textContent = gameState.score;
    document.getElementById('total-hits').textContent = gameState.acertos;
    document.getElementById('total-misses').textContent = gameState.erros;
    document.getElementById('xp-gained').textContent = `+${xpGained}`;
    document.getElementById('xp-total').textContent = gameState.xp;

    const studySuggestion = document.getElementById('study-suggestion');
    if (gameState.erros > gameState.acertos / 2) {
         studySuggestion.textContent = `Você teve muitos erros! Recomendamos usar o Modo Estudo para treinar a ${gameState.currentOperation} (Nível ${gameState.currentLevel.toUpperCase()}).`;
    } else if (gameState.score > 1000 && gameState.currentLevel === 'advanced') {
         studySuggestion.textContent = `Fantástico! Você está dominando a ${gameState.currentOperation} no Nível Avançado! Tente outro desafio.`;
    } else {
         studySuggestion.textContent = 'Continue praticando para alcançar o próximo nível de mestre!';
    }


    
    // --- Meta do dia + sequência (streak) ---
    try {
        const attempts = (gameState.acertos || 0) + (gameState.erros || 0);
        updateDailyProgress(attempts);
    } catch (_) {}

    // --- Campanha: marca lição como concluída e avança ---
    try {
        if (gameState.sessionConfig && gameState.sessionConfig.type === 'campaign') {
            completeCampaignLesson(gameState.sessionConfig, {acertos: gameState.acertos, erros: gameState.erros, suspect: !!gameState.suspectSession});
        }
    } catch (_) {}


    // Modo Estudo: travas de domínio e sequência PET
    try {
        const total = (gameState.acertos || 0) + (gameState.erros || 0);
        const accuracy = total > 0 ? (gameState.acertos || 0) / total : 0;
        const suspect = !!gameState.suspectSession;

        if (isStudy()) {
            if (gameState.sessionConfig && gameState.sessionConfig.type === 'study_mul') {
                studyMulEndSession(accuracy, suspect);
                const st = studyLoad();
                if (st.mul && st.mul.phase === 'done') {
                    st.unlocked.division = true;
                }
                studySave(st);
                studyLockUI();
            } else {
                // trava médio → avançado e sequência entre operações
                if (gameState.currentLevel === 'medium') {
                    registerStudyMediumPass(gameState.currentOperation, accuracy, suspect);
                }
            }
        }
    } catch (_) {}

    // Limpa sessão especial após concluir (evita “vazar” para modo livre)
    if (gameState.sessionConfig && gameState.sessionConfig.type) {
        gameState.sessionConfig = null;
    }

    // 3. Mudar para a tela de resultado
    const sugg = document.getElementById('study-suggestion');
    if (sugg) {
        if (gameState.currentOperation === 'multiplication' && gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail')) {
            const modeLabel = gameState.multiplication.mode === 'trail' ? 'Trilha automática' : 'Tabuada escolhida';

            if (gameState.multiplication.mode === 'trail') {
                const tMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
                const tMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
                const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
                const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
                const bankSize = getTrailPairsBankSize(tMin, tMax, mMin, mMax);
                const restante = Math.max(0, bankSize - (gameState.multiplication.trailPairIndex || 0));
                sugg.textContent =
                    `${modeLabel}: Tabuadas ${tMin}–${tMax} com multiplicadores ${mMin}–${mMax}. ` +
                    `A trilha não repete contas até completar (total ${bankSize}). ` +
                    `Faltam ${restante} para fechar o ciclo atual.`;
            } else {
                const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
                const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
                sugg.textContent =
                    `${modeLabel}: Tabuada do ${gameState.multiplication.tabuada} (×${mMin}–${mMax}). ` +
                    `Dica: use “Treinar Erros” para fixar onde você errou.`;
            }
        } else {
            sugg.textContent = '';
        }
    }
    // Ranking: registra partida (histórico local)
    try {
        const total = (gameState.totalQuestions && gameState.totalQuestions !== '∞') ? Number(gameState.totalQuestions) : Number(gameState.questionNumber);
        const attemptsTotal = Math.max(1, gameState.acertos + gameState.erros);
        const accuracy = (gameState.acertos / attemptsTotal) * 100;

        const submode = (gameState.currentOperation === 'multiplication')
            ? (gameState.multiplication.mode === 'direct' ? `Direto (Tabuada ${gameState.multiplication.tabuada})` : `Trilha (${gameState.multiplication.trailMin}–${gameState.multiplication.trailMax})`)
            : '';

        registrarPartidaNoRanking({
            score: gameState.score,
            operation: gameState.currentOperation,
            level: gameState.currentLevel,
            mode: gameState.isRapidMode ? 'rapido' : 'estudo',
            submode,
            acertos: gameState.acertos,
            erros: gameState.erros,
            total: total,
            accuracy: accuracy
        });
    } catch (e) { console.warn('Falha ao registrar ranking:', e); }

    // Atualiza a Trilha (mapa): para níveis não-tabuada, 1 sessão aprovada = +1 etapa
    try {
        const attemptsTotal2 = Math.max(1, gameState.acertos + gameState.erros);
        const accuracy2 = (gameState.acertos / attemptsTotal2) * 100;
        const passed = (accuracy2 >= 70) && (attemptsTotal2 >= 10);

        if (gameState.currentOperation !== 'multiplication') {
            if (passed) {
                const cur = getPathDone(gameState.currentOperation, gameState.currentLevel);
                setPathDone(gameState.currentOperation, gameState.currentLevel, cur + 1);
            }
        } else if (gameState.multiplication && gameState.multiplication.mode === 'trail') {
            const tMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
            const tMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
            const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
            const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
            const bankSize2 = getTrailPairsBankSize(tMin, tMax, mMin, mMax);
            setSavedTrailIndexForKey(gameState.multiplication.trailRangeKey, Math.max(0, Number(gameState.multiplication.trailPairIndex) || 0));
        }
    } catch (_) {}



// 4. Registrar sessão para Relatório/Painel do Professor (offline)
try {
    const durationSec = (function() {
        if (gameState.isRapidMode && Number.isFinite(gameState.maxTime) && Number.isFinite(gameState.timeLeft)) {
            const v = Math.max(0, Math.round(gameState.maxTime - gameState.timeLeft));
            return v;
        }
        const start = Number.isFinite(gameState.sessionStartTs) ? gameState.sessionStartTs : Date.now();
        return Math.max(0, Math.round((Date.now() - start) / 1000));
    })();

    appendSession({
        schemaVersion: '1.0',
        ts: Date.now(),
        operation: gameState.currentOperation,
        level: gameState.currentLevel,
        mode: gameState.isRapidMode ? 'rapido' : 'estudo',
        score: gameState.score,
        correct: gameState.acertos,
        wrong: gameState.erros,
        questions: (gameState.acertos + gameState.erros),
        xpDelta: xpGained,
        xpTotal: gameState.xp,
        durationSec,
        student: {
            name: String(gameState.studentProfile?.name || ''),
            turma: String(gameState.studentProfile?.turma || ''),
            escola: String(gameState.studentProfile?.escola || '')
        },
        multiplication: (gameState.currentOperation === 'multiplication' && gameState.multiplication) ? {
            mode: gameState.multiplication.mode || null,
            tabuada: Number.isInteger(gameState.multiplication.tabuada) ? gameState.multiplication.tabuada : null,
            trailRangeKey: gameState.multiplication.trailRangeKey || null,
            multMin: Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : null,
            multMax: Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : null,
            trailMin: Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : null,
            trailMax: Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : null
        } : null
    });
} catch (e) {
    console.warn('Falha ao registrar sessão:', e);
}

    exibirTela('result-screen');
}


// --- LÓGICA DO TEMPORIZADOR ---

function startTimer() {
    if (gameState.timer) clearInterval(gameState.timer);
    if (!gameState.isRapidMode) return; // Não iniciar timer no modo estudo

    // Ajustamos o intervalo para rodar a cada 100ms (10 Ticks por segundo)
    gameState.timer = setInterval(() => {
        if (!gameState.isGameActive) {
            clearInterval(gameState.timer);
            return;
        }

        gameState.timeLeft -= gameState.timeStep;

        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.timer);
            playAlertSound();
            (function(){
            const cfg = gameState.sessionConfig;
            if (cfg && cfg.type === 'mission'){
                try{ if (typeof window.__setMissionDone === 'function') window.__setMissionDone(cfg.missionType || ''); }catch(e){}
                showFeedbackMessage("Missão concluída ✅", 'success', 2500);
            } else if (cfg && cfg.type === 'minigame'){
                showFeedbackMessage("Minigame concluído ✅", 'success', 2500);
            } else {
                showFeedbackMessage("Tempo encerrado. Treino concluído ✅", 'success', 2500);
            }
        })();
            endGame(); 
            return;
        }
        
        const percentage = (gameState.timeLeft / gameState.maxTime) * 100;
        
        // Atualiza a barra de progresso
        timeBar.style.width = `${percentage}%`;

                // Alerta: sem mensagem visual (apenas som aos 5s finais)
        if (librasAlert) librasAlert.classList.add('hidden');

        // Mantém cores do timer para feedback visual
        if (percentage < 25) {
            timeBar.style.backgroundColor = 'var(--cor-erro)';
        } else if (percentage < 50) {
            timeBar.style.backgroundColor = 'var(--cor-secundaria)';
        } else {
            timeBar.style.backgroundColor = 'var(--cor-sucesso)';
        }

        // Som de alerta aos 5 segundos finais (toca 1x por questão)
        const fiveSecThreshold = 5 * 10 * gameState.timeStep; // 10 ticks = 1 segundo
        if (gameState.timeLeft <= fiveSecThreshold && gameState.timeLeft > 0) {
            if (!gameState.lowTimeAlerted) {
                playAlertSound();
                gameState.lowTimeAlerted = true;
            }
        } else {
            gameState.lowTimeAlerted = false;
        }

    }, 100); 
}

function stopTimer() {
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
}


// --- LISTENERS DE EVENTOS ---

function attachEventListeners() {
    
    // 1. Seleção de Operação (Vai para a tela de Nível)
    operationButtons.forEach(button => {
        button.addEventListener('click', () => {
            const op = button.getAttribute('data-operation');
            // Modo Estudo: sequência travada
            if(isStudy() && !studyCanOp(op)){
                showFeedbackMessage('No Modo Estudo, você precisa seguir a ordem: Adição → Subtração → Multiplicação → Divisão → Potenciação → Radiciação.', 'warn', 3800);
                return;
            }
            gameState.currentOperation = op;

            // Multiplicação (Modo Estudo): trilha de tabuadas + revisão
            if(isStudy() && op === 'multiplication'){
                studyStartMultiplication();
                return;
            }

            exibirTela('level-selection-screen');
            try {
                const mapName = {addition:'Adição',subtraction:'Subtração',multiplication:'Multiplicação',division:'Divisão',potenciacao:'Potenciação',radiciacao:'Radiciação'};
                const name = mapName[op] || op;
                const h = document.querySelector('#level-selection-screen h1');
                if (h) h.textContent = `${name} — escolha o nível`;
            } catch (_) {}
            try { renderLearningMapPreview(gameState.currentOperation); } catch (_) {}
            // Em estudo, atualiza locks visuais
            try { studyLockUI(); } catch (_) {}
            speak(`Operação ${gameState.currentOperation} selecionada. Agora escolha o nível!`);
            showFeedbackMessage(`Operação ${gameState.currentOperation.toUpperCase()} selecionada. Agora escolha o nível!`, 'info', 2500);
        });
    });
    
    // 2. Seleção de Nível (Inicia o Jogo)
    levelButtons.forEach(button => {
        button.addEventListener('click', () => {
            const level = button.getAttribute('data-level');
            if(isStudy() && (level==='advanced' || level==='hard') && !studyCanAdvanced(gameState.currentOperation)) {
                showFeedbackMessage('No Modo Estudo, o nível avançado só libera depois de você dominar o nível médio (2 sessões com ≥80%).', 'warn', 3600);
                return;
            }

            // Inicia o jogo com a operação já salva e o nível recém-clicado
            if (gameState.currentOperation === 'multiplication') {
                openMultiplicationConfig(level);
            } else {
                startGame(gameState.currentOperation, level);
            } 
        });
    });

    // Botão para voltar da tela de nível para a home (Mudar Operação)
    btnVoltarHome.forEach(button => {
        // Garantindo que apenas os botões de voltar da home usem o ID 'btn-voltar-home'
        // Os demais botões de voltar home já devem ter o listener anexado.
        button.addEventListener('click', () => {
            stopTimer(); // Para o timer se estiver ativo (ex: saindo do jogo)
                    exibirTela('home-screen');
        });
    });

    // 3. Botão de Quit Game (na tela de jogo)
    btnQuitGame.addEventListener('click', () => {
        stopTimer();
        if (gameState.isGameActive) {
            showFeedbackMessage("Rodada cancelada.", 'warning', 2000);
            gameState.isGameActive = false;
    gameState.__inMicro = false;
        }
        exibirTela('home-screen');
    });

    // 4. Opções de Resposta
    answerOptions.forEach(button => {
        button.addEventListener('click', (e) => {
            // O texto do botão é a resposta
            const answer = parseInt(e.currentTarget.querySelector('.answer-text').textContent); 
            handleAnswer(answer, e.currentTarget);
        });
    });

    
    // 4.1 Responder pelo teclado (1,2,3,4) ou NumPad (1–4)
    document.addEventListener('keydown', (e) => {
        if (!gameState.isGameActive) return;

        // não captura se estiver digitando em algum campo (caso exista futuramente)
        const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;

        let idx = null;
        if (e.key === '1' || e.code === 'Numpad1') idx = 0;
        if (e.key === '2' || e.code === 'Numpad2') idx = 1;
        if (e.key === '3' || e.code === 'Numpad3') idx = 2;
        if (e.key === '4' || e.code === 'Numpad4') idx = 3;

        if (idx !== null) {
            e.preventDefault();
            const btn = answerOptions[idx];
            if (btn && !btn.disabled) btn.click();
        }

        // Atalho extra: R repete a leitura da questão (modo voz)
        if ((e.key === 'r' || e.key === 'R') && gameState.isVoiceReadActive && gameState.currentQuestion) {
            e.preventDefault();
            announceCurrentQuestion();
}
    });

// 5. Toggle Modo Rápido/Estudo
    modeRapidoBtn.addEventListener('click', () => {
        gameState.isRapidMode = true;
        modeRapidoBtn.classList.add('active');
        modeEstudoBtn.classList.remove('active');
        showFeedbackMessage("Modo Rápido (20 Questões com Tempo) selecionado!", 'incentive', 2500);
        studyLockUI();
    });

    modeEstudoBtn.addEventListener('click', () => {
        gameState.isRapidMode = false;
        modeEstudoBtn.classList.add('active');
        modeRapidoBtn.classList.remove('active');
        showFeedbackMessage("Modo Estudo (Infinito, Sem Tempo) selecionado! Use o botão 'Mostrar Resposta' para aprender.", 'incentive', 2500);
        studyLockUI();
    });

    // 6. Toggle Leitura de Voz
    if (toggleVoiceRead) {
        toggleVoiceRead.addEventListener('click', () => {
            const isActive = !gameState.isVoiceReadActive;
            gameState.isVoiceReadActive = isActive;
            toggleVoiceRead.classList.toggle('active', isActive);
            // Ajuste imediato do tempo no Modo Rápido quando a voz é ativada/desativada
            try {
                if (gameState.isRapidMode && Number.isFinite(gameState.baseTime)) {
                    const librasOn = document.body.classList.contains('libras-mode');
                    const accOn = !!isActive || librasOn;
                    const newMax = accOn ? (gameState.baseTime * 2) : gameState.baseTime;
                    const prevMax = gameState.maxTime;
                    gameState.maxTime = newMax;
                    if (isActive && prevMax === gameState.baseTime) {
                        gameState.timeLeft = Math.min(gameState.maxTime, gameState.timeLeft * 2);
                    } else {
                        gameState.timeLeft = Math.min(gameState.timeLeft, gameState.maxTime);
                    }
                    updateTimeBar();
                }
            } catch (_) {}
            if(synth) synth.cancel();
            speak(`Leitura de Voz ${isActive ? 'ativada' : 'desativada'}!`);
            showFeedbackMessage(`Leitura de Voz ${isActive ? 'ativada' : 'desativada'}!`, 'info', 2000);
        });
    }
    
    // 7. Toggle Modo Libras 
    if (toggleLibras) {
        toggleLibras.addEventListener('click', () => {
            const isActive = document.body.classList.toggle('libras-mode');
            toggleLibras.classList.toggle('active', isActive);
            const message = isActive 
                ? 'Modo Libras (Acessibilidade) ATIVADO! O tempo de jogo será dobrado no Modo Rápido.'
                : 'Modo Libras DESATIVADO.';
            showFeedbackMessage(message, 'info', 3000);
        });
    }

    // 8. Lógica para Dark/Light Mode
    if (toggleNightMode) {
         toggleNightMode.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');
            toggleNightMode.querySelector('.icon').textContent = isDarkMode ? '☀️' : '🌙';
        });
    }

    // 9. Botões de Ação do Jogo (Estender Tempo / Ajuda)
    btnExtendTime.addEventListener('click', () => {
        const cost = 100;
        if (gameState.xp >= cost) {
            atualizarXP(-cost);
            // Adiciona 50 ticks (+5 segundos)
            gameState.timeLeft = Math.min(gameState.maxTime, gameState.timeLeft + 50); 
            showFeedbackMessage("Tempo estendido! +5 segundos!", 'success');
        } else {
             showFeedbackMessage(`XP insuficiente. Você precisa de ${cost} XP!`, 'error');
        }
    });

    btnShowAnswer.addEventListener('click', () => {
        const cost = 250;
        if (gameState.xp >= cost) {
            atualizarXP(-cost);
            // Mostra a resposta correta e desabilita os botões para forçar o avanço
            answerOptions.forEach(btn => {
                const answerElement = btn.querySelector('.answer-text');
                if (parseInt(answerElement.textContent) === gameState.currentQuestion.answer) {
                    btn.classList.add('correct');
                }
                btn.disabled = true; 
            });
            stopTimer();
            showFeedbackMessage(`A resposta correta era ${gameState.currentQuestion.answer}. Treine mais!`, 'warning', 3500);

             // Avança para a próxima questão após 3 segundos
            setTimeout(() => {
                if (gameState.isRapidMode) startTimer();
                nextQuestion();
            }, 3000);

        } else {
             showFeedbackMessage(`XP insuficiente. Você precisa de ${cost} XP!`, 'error');
        }
    });
    
    // 10. Navegação para Ranking e Erros
    document.getElementById('btn-show-ranking').addEventListener('click', () => {
        carregarRanking();
        renderRanking();
        exibirTela('ranking-screen');
    });

    const btnClearRanking = document.getElementById('btn-clear-ranking');
    if (btnClearRanking) {
        btnClearRanking.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar o ranking?')) {
                gameState.highScores = [];
                salvarRanking();
                renderRanking();
                showFeedbackMessage('Ranking limpo!', 'info');
            }
        });
    }

    
    // Botão para ir para a tela de treinamento de erros (da tela de resultados)
    if (btnTreinarErros) {
        btnTreinarErros.addEventListener('click', () => {
            updateErrorTrainingButton(); // Atualiza a lista e mensagem
            exibirTela('error-training-screen');
        });
    }

    // Botão para limpar a lista de erros salvos
    if (btnClearErrors) {
        btnClearErrors.addEventListener('click', () => {
            if (confirm("Tem certeza que deseja limpar todos os erros salvos?")) {
                gameState.errors = [];
                salvarErros();
                showFeedbackMessage("Erros salvos limpos com sucesso!", 'info');
                updateErrorTrainingButton();
            }
        });
    }

    if (btnStartTraining) {
        safeOn(btnStartTraining, 'click', () => {
            startErrorTraining();
        });
    }


    // Inicialização final
    exibirTela(gameState.currentScreen);

}



/* =========================================================================
   REDESIGN v16 — Campanha, Meta do dia, Mentor, Bottom Nav, UI prefs
   ========================================================================= */

const DAILY_KEY = 'matemagica_daily_v1';
const UI_PREFS_KEY = 'matemagica_ui_prefs_v2';
const CAMPAIGN_KEY = 'matemagica_campaign_v1';
const MENTOR_KEY = 'matemagica_mentor_v1';

// Campanhas (MVP): cada lição aponta para operação + nível + modo + quantidade
const CAMPAIGNS = {
    base: {
        id: 'base',
        name: 'Base (6º–7º)',
        desc: 'Foco em defasagem: sem pressa, com tática e repetição inteligente.',
        units: [
            { title: 'Unidade 1 — Fundamentos', sub: 'Somar/subtrair até 20', lessons: [
                { title: 'Somar até 20', operation: 'addition', level: 'easy', mode: 'study', total: 10 },
                { title: 'Subtrair até 20', operation: 'subtraction', level: 'easy', mode: 'study', total: 10 },
            ]},
            { title: 'Unidade 2 — Reagrupamento', sub: 'Vai-um e empréstimo', lessons: [
                { title: 'Somar com vai-um', operation: 'addition', level: 'medium', mode: 'study', total: 10 },
                { title: 'Subtrair com empréstimo', operation: 'subtraction', level: 'medium', mode: 'study', total: 10 },
            ]},
            { title: 'Unidade 3 — Tabuadas', sub: '0–5 → 6–10', lessons: [
                { title: 'Tabuadas 0–5', operation: 'multiplication', level: 'easy', mode: 'study', total: 10 },
                { title: 'Tabuadas 6–10', operation: 'multiplication', level: 'medium', mode: 'study', total: 10 },
            ]},
            { title: 'Unidade 4 — Divisão', sub: 'Volta na multiplicação', lessons: [
                { title: 'Divisão exata', operation: 'division', level: 'easy', mode: 'study', total: 10 },
                { title: 'Divisão com resto', operation: 'division', level: 'medium', mode: 'study', total: 10 },
            ]},
            { title: 'Unidade 5 — Potência & Raiz', sub: 'Padrões (quadrados perfeitos)', lessons: [
                { title: 'Potências (quadrados)', operation: 'potenciacao', level: 'easy', mode: 'study', total: 10 },
                { title: 'Raízes (quadrados)', operation: 'radiciacao', level: 'easy', mode: 'study', total: 10 },
            ]},
        ],
    },
    reforco: {
        id: 'reforco',
        name: 'Reforço (8º–9º)',
        desc: 'Arcade leve: velocidade opcional e mistura estratégica.',
        units: [
            { title: 'Unidade 1 — Aquecimento', sub: 'Operações mistas', lessons: [
                { title: 'Adição (médio)', operation: 'addition', level: 'medium', mode: 'rapid', total: 10 },
                { title: 'Subtração (médio)', operation: 'subtraction', level: 'medium', mode: 'rapid', total: 10 },
            ]},
            { title: 'Unidade 2 — Multiplicação', sub: '10×n e ajusta', lessons: [
                { title: 'Tabuadas 6–10', operation: 'multiplication', level: 'medium', mode: 'rapid', total: 10 },
                { title: 'Tabuadas 11–20', operation: 'multiplication', level: 'advanced', mode: 'rapid', total: 10 },
            ]},
            { title: 'Unidade 3 — Divisão', sub: 'Exata e com resto', lessons: [
                { title: 'Divisão exata', operation: 'division', level: 'medium', mode: 'rapid', total: 10 },
                { title: 'Divisão com resto', operation: 'division', level: 'advanced', mode: 'rapid', total: 10 },
            ]},
            { title: 'Unidade 4 — Potência & Raiz', sub: 'Padrões e checagens', lessons: [
                { title: 'Potência (médio)', operation: 'potenciacao', level: 'medium', mode: 'rapid', total: 10 },
                { title: 'Raiz (médio)', operation: 'radiciacao', level: 'medium', mode: 'rapid', total: 10 },
            ]},
        ],
    }
};

function todayStr() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/* ------------------------- Meta do dia / streak ------------------------- */

function loadDaily() {
    try {
        const raw = LS.get(DAILY_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        if (!obj || typeof obj !== 'object') return {};
        return obj;
    } catch (_) {
        return {};
    }
}

function saveDaily(obj) {
    try { LS.set(DAILY_KEY, JSON.stringify(obj || {})); } catch (_) {}
}

function updateDailyProgress(addQuestions) {
    const goal = 10;
    const t = todayStr();
    const data = loadDaily();
    const last = data.lastDate || '';
    const doneToday = (data.date === t) ? Number(data.done || 0) : 0;

    // streak: conta dias com prática (>=1 questão)
    let streak = Number(data.streak || 0);
    if (data.date !== t) {
        // Mudou o dia: decide se mantém streak
        const prev = data.date;
        data.date = t;
        data.done = 0;

        if (prev) {
            const prevDate = new Date(prev + "T00:00:00");
            const curDate = new Date(t + "T00:00:00");
            const diffDays = Math.round((curDate - prevDate) / (1000*60*60*24));
            if (diffDays === 1 && Number(data.prevHadPractice || 0) === 1) {
                // mantém (vai ser incrementado quando praticar hoje)
            } else if (diffDays >= 1) {
                streak = 0;
            }
        } else {
            streak = 0;
        }
        data.streak = streak;
        data.prevHadPractice = 0;
    }

    const inc = Math.max(0, Number(addQuestions) || 0);
    if (inc > 0) {
        data.done = Math.max(0, doneToday) + inc;

        // Se hoje é o primeiro treino do dia, incrementa streak
        if (Number(data.prevHadPractice || 0) === 0) {
            data.streak = Math.max(0, Number(data.streak || 0)) + 1;
            data.prevHadPractice = 1;
        }
    }

    saveDaily(data);
    updateHomeDailyUI();
}

function updateHomeDailyUI() {
    const elText = document.getElementById('daily-progress-text');
    const elBar = document.getElementById('daily-progress-bar');
    const elStreak = document.getElementById('streak-text');
    if (!elText || !elBar || !elStreak) return;

    const goal = 10;
    const t = todayStr();
    const data = loadDaily();
    const done = (data.date === t) ? Number(data.done || 0) : 0;
    const streak = Number(data.streak || 0);

    elText.textContent = `Meta do dia: ${Math.min(done, goal)}/${goal}`;
    elStreak.textContent = `Sequência: ${streak}`;
    const pct = Math.max(0, Math.min(100, (done / goal) * 100));
    elBar.style.width = `${pct}%`;
}

/* ------------------------------- Campanha ------------------------------- */

function loadCampaignState() {
    try {
        const raw = LS.get(CAMPAIGN_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        if (!obj || typeof obj !== 'object') return {};
        return obj;
    } catch (_) {
        return {};
    }
}

function saveCampaignState(state) {
    try { LS.set(CAMPAIGN_KEY, JSON.stringify(state || {})); } catch (_) {}
}

function getSelectedCampaignId() {
    const st = loadCampaignState();
    return (st.selected === 'reforco') ? 'reforco' : 'base';
}

function setSelectedCampaignId(id) {
    const st = loadCampaignState();
    st.selected = (id === 'reforco') ? 'reforco' : 'base';
    if (!st.progress) st.progress = {};
    if (!st.progress[st.selected]) st.progress[st.selected] = { unit: 0, lesson: 0, done: {} };
    saveCampaignState(st);
    renderCampaignScreen();
    updateHomeCampaignUI();
}

function getCampaignProgress(campaignId) {
    const st = loadCampaignState();
    if (!st.progress) st.progress = {};
    if (!st.progress[campaignId]) st.progress[campaignId] = { unit: 0, lesson: 0, done: {} };
    saveCampaignState(st);
    return st.progress[campaignId];
}

function setCampaignProgress(campaignId, prog) {
    const st = loadCampaignState();
    if (!st.progress) st.progress = {};
    st.progress[campaignId] = prog;
    saveCampaignState(st);
}

function isRetentionDue(ts){
  if(!ts) return false;
  const ms = 7*24*60*60*1000;
  return (Date.now()-ts) > ms;
}

function lessonKey(campaignId, unitIndex, lessonIndex) {
    return `${campaignId}_u${unitIndex}_l${lessonIndex}`;
}

function getCurrentLesson(campaignId) {
    const camp = CAMPAIGNS[campaignId];
    if (!camp) return null;
    const prog = getCampaignProgress(campaignId);
    const u = Math.max(0, Math.min(camp.units.length-1, Number(prog.unit||0)));
    const unit = camp.units[u];
    const l = Math.max(0, Math.min(unit.lessons.length-1, Number(prog.lesson||0)));
    return { campaignId, unitIndex: u, lessonIndex: l, lesson: unit.lessons[l], unit };
}

function updateHomeCampaignUI() {
    const sub = document.getElementById('home-campaign-sub');
    const btn = document.getElementById('btn-continue-campaign');
    if (!sub || !btn) return;

    const cid = getSelectedCampaignId();
    // v19.2 — refletir seleção também na Home (Base 6º–7º / Reforço 8º–9º)
    const pickBase = document.getElementById('campaign-pick-base');
    const pickRef = document.getElementById('campaign-pick-reforco');
    if (pickBase && pickRef) {
        pickBase.classList.toggle('active', cid === 'base');
        pickRef.classList.toggle('active', cid === 'reforco');
        pickBase.setAttribute('aria-selected', cid === 'base' ? 'true' : 'false');
        pickRef.setAttribute('aria-selected', cid === 'reforco' ? 'true' : 'false');
    }

    const cur = getCurrentLesson(cid);
    if (!cur) {
        sub.textContent = 'Escolha uma campanha para começar.';
        return;
    }
    sub.textContent = `${CAMPAIGNS[cid].name} • ${cur.unit.title} • ${cur.lesson.title}`;
    btn.textContent = '▶ Continuar';
}

function renderCampaignScreen() {
    const cid = getSelectedCampaignId();
    const tabBase = document.getElementById('campaign-tab-base');
    const tabRef = document.getElementById('campaign-tab-reforco');
    const title = document.getElementById('campaign-title');
    const desc = document.getElementById('campaign-desc');
    if (tabBase && tabRef) {
        tabBase.classList.toggle('active', cid === 'base');
        tabRef.classList.toggle('active', cid === 'reforco');
        tabBase.setAttribute('aria-selected', cid === 'base' ? 'true' : 'false');
        tabRef.setAttribute('aria-selected', cid === 'reforco' ? 'true' : 'false');
    }
    if (title) title.textContent = `Campanha — ${CAMPAIGNS[cid].name}`;
    if (desc) desc.textContent = CAMPAIGNS[cid].desc || 'Plano: lições curtas, foco e revisão.';

    renderCampaignMap(cid);
}

function renderCampaignMap(campaignId) {
    const map = document.getElementById('campaign-map');
    if (!map) return;

    const camp = CAMPAIGNS[campaignId];
    const prog = getCampaignProgress(campaignId);
    const cur = getCurrentLesson(campaignId);

    map.innerHTML = '';
    camp.units.forEach((unit, ui) => {
        const card = document.createElement('div');
        card.className = 'unit-card';
        card.innerHTML = `
            <div class="unit-head">
                <div>
                    <p class="unit-title">${unit.title}</p>
                    <p class="unit-sub">${unit.sub || ''}</p>
                </div>
                <span class="pill">${ui+1}/${camp.units.length}</span>
            </div>
            <div class="lesson-row" id="lesson-row-${campaignId}-${ui}"></div>
        `;
        map.appendChild(card);

        const row = card.querySelector(`#lesson-row-${campaignId}-${ui}`);
        unit.lessons.forEach((lesson, li) => {
            const key = lessonKey(campaignId, ui, li);
            const done = !!(prog.done && prog.done[key]);
            const isCurrent = (cur && cur.unitIndex === ui && cur.lessonIndex === li);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lesson-node' + (done ? ' done' : '') + (isCurrent ? ' current' : '');
            btn.textContent = lesson.title;
            btn.addEventListener('click', () => startCampaignLesson(campaignId, ui, li));
            row.appendChild(btn);
        });
    });
}

function startCampaignLesson(campaignId, unitIndex, lessonIndex) {
    const camp = CAMPAIGNS[campaignId];
    if (!camp) return;
    const unit = camp.units[unitIndex];
    const lesson = unit?.lessons?.[lessonIndex];
    if (!lesson) return;

    const prog = getCampaignProgress(campaignId);
    const k = lessonKey(campaignId, unitIndex, lessonIndex);
    const passes = (prog && prog.passes && prog.passes[k]) ? prog.passes[k] : 0;
    const needsValidation = (passes === 1) && !(prog && prog.done && prog.done[k]);
    // Define sessão especial (campanha)
    gameState.sessionConfig = {
        type: 'campaign',
        campaignId,
        unitIndex,
        lessonIndex,
        totalQuestions: lesson.total || 10,
        forceRapidMode: (lesson.mode === 'rapid'),
        label: `${camp.name} • ${unit.title} • ${lesson.title}${needsValidation ? ' • Validação' : ''}`,
        validation: needsValidation
    };

    // Força modo (sem depender do toggle da home)
    gameState.isRapidMode = (lesson.mode === 'rapid');

    // Inicia diretamente
    exibirTela('home-screen'); // garante estado estável
    startGame(lesson.operation, lesson.level);
}

function completeCampaignLesson(cfg, stats) {
    const camp = CAMPAIGNS[cfg.campaignId];
    if (!camp) return;

    const prog = getCampaignProgress(cfg.campaignId);
    const key = lessonKey(cfg.campaignId, cfg.unitIndex, cfg.lessonIndex);
    if (!prog.done) prog.done = {};
    if (!prog.passes) prog.passes = {};
    if (!prog.doneAt) prog.doneAt = {};

    // Critério de domínio (MVP): 85%+ e não suspeito
    const total = (stats?.acertos || 0) + (stats?.erros || 0);
    const acc = total>0 ? (stats.acertos/total) : 0;
    const ok = (acc >= 0.85) && !(stats?.suspect);

    if (!ok) {
        // Não conclui: exige reforço
        showFeedbackMessage('Para concluir a lição: acerte pelo menos 85% e evite chute. Tente de novo (o app vai te reforçar).', 'warning', 4200);
        renderCampaignScreen();
        updateHomeCampaignUI();
        return;
    }

    // Estabilidade: precisa passar 2 vezes (2 sessões)
    prog.passes[key] = (prog.passes[key] || 0) + 1;
    if (prog.passes[key] < 2) {
        showFeedbackMessage('Boa. Falta 1 validação curta para confirmar domínio (2ª sessão).', 'info', 4200);
        setCampaignProgress(cfg.campaignId, prog);
        renderCampaignScreen();
        updateHomeCampaignUI();
        return;
    }

    // Concluído
    prog.done[key] = true;
    prog.doneAt[key] = Date.now();

    // Avança ponteiro (próxima lição não concluída)
    let ui = cfg.unitIndex;
    let li = cfg.lessonIndex + 1;

    while (ui < camp.units.length) {
        const lessons = camp.units[ui].lessons;
        while (li < lessons.length) {
            const k = lessonKey(cfg.campaignId, ui, li);
            if (!prog.done[k]) {
                prog.unit = ui;
                prog.lesson = li;
                setCampaignProgress(cfg.campaignId, prog);
                renderCampaignScreen();
                updateHomeCampaignUI();
                return;
            }
            li++;
        }
        ui++;
        li = 0;
    }

    // Se completou tudo: volta ao início (ciclo)
    prog.unit = 0;
    prog.lesson = 0;
    setCampaignProgress(cfg.campaignId, prog);
    renderCampaignScreen();
    updateHomeCampaignUI();
}

/* ------------------------------- Mentor UI ------------------------------ */

function loadMentorPref() {
    try {
        const raw = LS.get(MENTOR_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        gameState.mentor.enabled = (obj.enabled !== false);
    } catch (_) {
        gameState.mentor.enabled = true;
    }
}

function saveMentorPref() {
    try { LS.set(MENTOR_KEY, JSON.stringify({ enabled: !!gameState.mentor.enabled })); } catch (_) {}
}

function setMentorEnabled(on) {
    gameState.mentor.enabled = !!on;
    saveMentorPref();
    const btn = document.getElementById('toggle-mentors');
    if (btn) btn.classList.toggle('active', gameState.mentor.enabled);
    const bubble = document.getElementById('mentor-bubble');
    if (bubble && !gameState.mentor.enabled) bubble.classList.add('hidden');

// --- Dificuldades (substitui 'Mentores' como menu de seleção) ---
function loadDifficultyFocus() {
    try {
        const raw = LS.get('matemagica_diff_focus');
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
}
function saveDifficultyFocus(arr) {
    try { LS.set('matemagica_diff_focus', JSON.stringify(arr || [])); } catch (_) {}
}
function openDifficultiesModal() {
    const modal = document.getElementById('difficulties-modal');
    if (!modal) return;
    const selected = new Set(loadDifficultyFocus());
    modal.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = selected.has(cb.value);
    });
    modal.classList.remove('hidden');
}
function closeDifficultiesModal() {
    const modal = document.getElementById('difficulties-modal');
    if (modal) modal.classList.add('hidden');
}
function wireDifficultiesModal() {
    const btn = document.getElementById('toggle-mentors');
    safeOn(btn, 'click', (e) => { e.preventDefault(); openDifficultiesModal(); });

    safeOn(document.getElementById('btn-close-diff'), 'click', closeDifficultiesModal);
    safeOn(document.getElementById('btn-save-diff'), 'click', () => {
        const modal = document.getElementById('difficulties-modal');
        if (!modal) return;
        const chosen = [];
        modal.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (cb.checked) chosen.push(cb.value); });
        saveDifficultyFocus(chosen);
        closeDifficultiesModal();
        showFeedbackMessage('Preferências salvas.', 'success');
    });

    // fecha ao clicar fora
    safeOn(document.getElementById('difficulties-modal'), 'click', (e) => {
        if (e.target && e.target.id === 'difficulties-modal') closeDifficultiesModal();
    });
}

}

function mentorPickAvatar() {
    // alterna entre Ronaldo e Rafael (simples e “humano”)
    const who = (Math.random() < 0.5) ? 'ronaldo' : 'rafael';
    gameState.mentor.who = who;
    const img = document.getElementById('mentor-avatar');
    if (img) img.src = who === 'ronaldo' ? 'ronaldo.png' : 'rafael.png';
}

function mentorSay(text) {
    const bubble = document.getElementById('mentor-bubble');
    if (!bubble) return;
    if (!gameState.mentor.enabled) {
        bubble.classList.add('hidden');
        return;
    }
    const msg = String(text || '').trim();
    if (!msg) return;

    bubble.textContent = msg;
    bubble.classList.remove('hidden');

    // some sozinho depois de um tempo
    window.clearTimeout(bubble.__hideT);
    bubble.__hideT = window.setTimeout(() => {
        bubble.classList.add('hidden');
    }, 3800);
}

function mentorPlanMessage() {
    mentorPickAvatar();
    const cfg = gameState.sessionConfig;
    if (cfg && cfg.type === 'campaign' && cfg.label) {
        mentorSay(`Plano: ${cfg.label}.`);
        return;
    }
    // modo livre
    const op = gameState.currentOperation || '';
    const lvl = (gameState.currentLevel || '').toUpperCase();
    mentorSay(`Plano: ${op} • nível ${lvl}. Foque em calma e precisão.`);
}

/* ------------------------------- UI prefs ------------------------------- */

function loadUiPrefs() {
    try {
        const raw = LS.get(UI_PREFS_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        if (obj && typeof obj === 'object') {
            gameState.uiPrefs.textScale = Number(obj.textScale || 1) || 1;
            gameState.uiPrefs.highContrast = !!obj.highContrast;
            gameState.uiPrefs.reduceMotion = !!obj.reduceMotion;
            gameState.uiPrefs.layout = (obj.layout === 'mobile' || obj.layout === 'desktop') ? obj.layout : 'auto';
        }
    } catch (_) {}
}

function saveUiPrefs() {
    try {
        LS.set(UI_PREFS_KEY, JSON.stringify(gameState.uiPrefs));
    } catch (_) {}
}

function applyUiPrefs() {
    document.documentElement.style.setProperty('--text-scale', String(gameState.uiPrefs.textScale || 1));
    document.body.classList.toggle('high-contrast', !!gameState.uiPrefs.highContrast);
    document.body.classList.toggle('reduce-motion', !!gameState.uiPrefs.reduceMotion);

    // Layout forçado (Auto / Celular / PC)
    document.body.classList.toggle('force-mobile', gameState.uiPrefs.layout === 'mobile');
    document.body.classList.toggle('force-desktop', gameState.uiPrefs.layout === 'desktop');

    const btnHC = document.getElementById('toggle-high-contrast');
    const btnRM = document.getElementById('toggle-reduce-motion');
    const btnLayout = document.getElementById('toggle-layout-mode');
    if (btnHC) btnHC.classList.toggle('active', !!gameState.uiPrefs.highContrast);
    if (btnRM) btnRM.classList.toggle('active', !!gameState.uiPrefs.reduceMotion);
    if (btnLayout) {
        const label = (gameState.uiPrefs.layout === 'mobile') ? 'Layout: Celular'
                    : (gameState.uiPrefs.layout === 'desktop') ? 'Layout: PC'
                    : 'Layout: Auto';
        const ico = (gameState.uiPrefs.layout === 'mobile') ? '📱'
                : (gameState.uiPrefs.layout === 'desktop') ? '🖥️'
                : '📐';
        btnLayout.innerHTML = `<span class="icon">${ico}</span> ${label}`;
        btnLayout.classList.toggle('active', gameState.uiPrefs.layout !== 'auto');
    }
}

/* ---------------------------- Navegação inferior ------------------------ */

function setBottomNavActive(id) {
    const map = {
        'home-screen': 'nav-home',
        'campaign-screen': 'nav-campaign',
        'error-training-screen': 'nav-review'
    };
    const activeBtn = map[id] || 'nav-home';
    ['nav-home','nav-campaign','nav-review','nav-profile'].forEach(btnId => {
        const el = document.getElementById(btnId);
        if (el) el.classList.toggle('active', btnId === activeBtn);
    });
}

/* --------------------------- Inicialização v16 -------------------------- */

function initRedesignUI() {
    loadDaily(); // prepara
    updateHomeDailyUI();

    loadUiPrefs();
    applyUiPrefs();

    loadMentorPref();
    setMentorEnabled(gameState.mentor.enabled);

    // Home — seleção de campanha
    const pickBase = document.getElementById('campaign-pick-base');
    const pickRef = document.getElementById('campaign-pick-reforco');
    if (pickBase && pickRef) {
        pickBase.addEventListener('click', () => setSelectedCampaignId('base'));
        pickRef.addEventListener('click', () => setSelectedCampaignId('reforco'));
    }

    // Campanha — tabs
    const tabBase = document.getElementById('campaign-tab-base');
    const tabRef = document.getElementById('campaign-tab-reforco');
    if (tabBase && tabRef) {
        tabBase.addEventListener('click', () => setSelectedCampaignId('base'));
        tabRef.addEventListener('click', () => setSelectedCampaignId('reforco'));
    }

    // Botões home
    const btnContinue = document.getElementById('btn-continue-campaign');
    const btnOpenCampaign = document.getElementById('btn-open-campaign');
    const btnReview = document.getElementById('btn-open-review');
    const btnMini = document.getElementById('btn-minigame-day');

    if (btnContinue) {
        btnContinue.addEventListener('click', () => {
            const cid = getSelectedCampaignId();
            const st = loadCampaignState();
            const prog = st && st.progress && st.progress[cid] ? st.progress[cid] : null;
            const hasProgress = !!(prog && (prog.unit > 0 || prog.lesson > 0 || (prog.done && Object.keys(prog.done).length > 0)));
            if (hasProgress) {
                const okContinue = window.confirm('Continuar de onde parou?\n\nOK = Continuar\nCancelar = Começar novo jogo');
                if (!okContinue) {
                    // novo jogo: zera progresso da campanha selecionada
                    if (!st.progress) st.progress = {};
                    st.progress[cid] = { unit: 0, lesson: 0, done: {} };
                    saveCampaignState(st);
                    renderCampaignScreen();
                }
            }
            const cur = getCurrentLesson(cid);
            if (cur) startCampaignLesson(cid, cur.unitIndex, cur.lessonIndex);
            else exibirTela('campaign-screen');
        });
    }
    if (btnOpenCampaign) safeOn(btnOpenCampaign, 'click', () => { renderCampaignScreen(); exibirTela('campaign-screen'); });
    if (btnReview) btnReview.addEventListener('click', () => { exibirTela('error-training-screen'); });
    if (btnMini) {
        btnMini.addEventListener('click', () => {
            // minigame: 10 questões rápidas da lição atual (se estiver em reforço, rapid; se base, study)
            const cid = getSelectedCampaignId();
            const cur = getCurrentLesson(cid);
            if (!cur) return;
            const mode = (cid === 'reforco') ? 'rapid' : 'study';
            gameState.sessionConfig = { type: 'minigame', totalQuestions: 10, forceRapidMode: (mode === 'rapid'), label: 'Minigame 3 min' };
            gameState.isRapidMode = (mode === 'rapid');
            startGame(cur.lesson.operation, cur.lesson.level);
        });
    }

    // UI prefs buttons
    const btnSmaller = document.getElementById('btn-text-smaller');
    const btnBigger = document.getElementById('btn-text-bigger');
    const btnHC = document.getElementById('toggle-high-contrast');
    const btnRM = document.getElementById('toggle-reduce-motion');
    const btnLayout = document.getElementById('toggle-layout-mode');
    const btnMent = document.getElementById('toggle-mentors');

    if (btnSmaller) btnSmaller.addEventListener('click', () => {
        gameState.uiPrefs.textScale = Math.max(0.9, (Number(gameState.uiPrefs.textScale) || 1) - 0.05);
        saveUiPrefs(); applyUiPrefs();
    });
    if (btnBigger) btnBigger.addEventListener('click', () => {
        gameState.uiPrefs.textScale = Math.min(1.25, (Number(gameState.uiPrefs.textScale) || 1) + 0.05);
        saveUiPrefs(); applyUiPrefs();
    });
    if (btnHC) btnHC.addEventListener('click', () => {
        gameState.uiPrefs.highContrast = !gameState.uiPrefs.highContrast;
        saveUiPrefs(); applyUiPrefs();
    });
    if (btnRM) btnRM.addEventListener('click', () => {
        gameState.uiPrefs.reduceMotion = !gameState.uiPrefs.reduceMotion;
        saveUiPrefs(); applyUiPrefs();
    });
    if (btnLayout) btnLayout.addEventListener('click', () => {
        // ciclo: auto -> mobile -> desktop -> auto
        const cur = gameState.uiPrefs.layout || 'auto';
        const next = (cur === 'auto') ? 'mobile' : (cur === 'mobile') ? 'desktop' : 'auto';
        gameState.uiPrefs.layout = next;
        saveUiPrefs(); applyUiPrefs();
    });

    if (btnMent) btnMent.addEventListener('click', () => {
        setMentorEnabled(!gameState.mentor.enabled);
    });

    // Bottom nav
    const navHome = document.getElementById('nav-home');
    const navCamp = document.getElementById('nav-campaign');
    const navReview = document.getElementById('nav-review');
    const navProfile = document.getElementById('nav-profile');

    if (navHome) navHome.addEventListener('click', () => { exibirTela('home-screen'); setBottomNavActive('home-screen'); });
    if (navCamp) navCamp.addEventListener('click', () => { renderCampaignScreen(); exibirTela('campaign-screen'); setBottomNavActive('campaign-screen'); });
    if (navReview) navReview.addEventListener('click', () => { exibirTela('error-training-screen'); setBottomNavActive('error-training-screen'); });
    if (navProfile) navProfile.addEventListener('click', () => {
        const btn = document.getElementById('btn-student-profile');
        if (btn) btn.click();
    });

    // Primeira renderização
    updateHomeCampaignUI();
    renderCampaignScreen();
    setBottomNavActive(gameState.currentScreen || 'home-screen');
}


// --- INICIALIZAÇÃO DO DOCUMENTO ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Carrega o estado persistente
    carregarXP();
    carregarErros();
    carregarRanking();
    loadTeacherPrefs();
    initPWA(); 
    
    // 2. Anexa todos os listeners
    loadMultiplicationConfig();
    
    // Progresso separado por faixa/nível da tabuada + perfil (opcional)
    loadMultProgressMap();
    loadStudentProfile();
    ensureProfileUI()

// v19.1 — Defaults para turma fraca (Base seguro)
try{
    const FIRST_RUN_KEY = 'matemagica_first_run_v19_1';
    if(!LS.get(FIRST_RUN_KEY)){
        // Sempre começa no Base
        if (typeof setSelectedCampaignId === 'function') setSelectedCampaignId('base');
        // Base seguro: sem timer e leitura de voz ON
        gameState.isRapidMode = false;
        gameState.isVoiceReadActive = true;
        LS.set(FIRST_RUN_KEY, '1');
    }
}catch(_){};
attachEventListeners();
    initTeacherPanel();

    // Inicializa o badge de progresso (fica oculto até o jogo começar)
    ensureCycleProgressBadge();
    
    // 3. Atualiza o estado inicial do botão de Treinar Erros
    updateErrorTrainingButton();

    // Redesign v16
    try { initRedesignUI(); } catch (e) { console.warn('initRedesignUI falhou:', e); }

    // Aplica o Dark Mode se o body já tiver a classe
    if (document.body.classList.contains('dark-mode')) {
        toggleNightMode.querySelector('.icon').textContent = '☀️';
    }
});


/* =========================================================
   v17 — Aprendizagem Primeiro (Patch)
   - Base: revisão mesma operação + microcheck sempre após 1º erro
   - Reforço: revisão mista (pesos) + microcheck apenas quando necessário
   - Dica 3 níveis + modo digitado + distratores pedagógicos
   - Minigame 3 min com timer global
========================================================= */

(function(){
  // Elementos v17 (podem não existir em versões antigas)
  const $ = (id)=>document.getElementById(id);
  const btnHint = $('btn-hint');
  const btnNextHint = $('btn-next-hint');
  const btnCloseHint = $('btn-close-hint');
  const hintPanel = $('hint-panel');
  const hintTitle = $('hint-title');
  const hintBody = $('hint-body');
  const btnToggleInput = $('btn-toggle-input');
  const typedArea = $('typed-area');
  const typedInput = $('typed-input');
  const btnSubmitTyped = $('btn-submit-typed');
  const mcOverlay = $('microcheck-overlay');
  const mcQ = $('microcheck-question');
  const mcA = $('microcheck-btn-a');
  const mcB = $('microcheck-btn-b');

  // Extensões de estado (sem quebrar versões antigas)
  gameState.v17 = gameState.v17 || {
    hintLevel: 0,
    answerMode: 'mcq', // 'mcq' | 'typed'
    forcedTypedCountdown: 0,
    wrongFastStreak: 0,
    questionStartTs: 0,
    timerMode: 'perQuestion', // 'perQuestion' | 'global'
    currentSkillTag: '',
    currentOp: '',
    currentSpec: null,
    reviewPlan: null,
    reviewIndex: 0,
  };

  const MASTER_KEY = 'matemagica_mastery_v1';

  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const da = String(d.getDate()).padStart(2,'0');
    return `${y}${m}${da}`;
  }

  function loadMastery(){
    try{
      return JSON.parse(LS.get(MASTER_KEY) || '{"skills":{},"week":{"days":[]}}');
    }catch(e){ return {"skills":{},"week":{"days":[]}}; }
  }
  function saveMastery(m){
    try{ LS.set(MASTER_KEY, JSON.stringify(m)); }catch(e){}
  }
  function recordDayPractice(){
    const m = loadMastery();
    const t = todayKey();
    if (!m.week) m.week = {days:[]};
    if (!Array.isArray(m.week.days)) m.week.days = [];
    if (!m.week.days.includes(t)) m.week.days.push(t);
    // mantém janela 14 dias (semana 0–7 e margem)
    if (m.week.days.length > 14) m.week.days = m.week.days.slice(-14);
    saveMastery(m);
  }

  function updateMastery(tag, correct, rtMs){
    const m = loadMastery();
    if (!m.skills) m.skills = {};
    if (!m.skills[tag]) m.skills[tag] = {a:0,c:0,last:0,due:[],rt:[]};
    const s = m.skills[tag];
    s.a += 1;
    if (correct) s.c += 1;
    s.last = Date.now();
    if (Number.isFinite(rtMs)) {
      s.rt.push(rtMs);
      if (s.rt.length > 20) s.rt = s.rt.slice(-20);
    }
    // agenda revisão ao errar (D+1 e D+7)
    if (!correct){
      const one = Date.now() + 24*60*60*1000;
      const seven = Date.now() + 7*24*60*60*1000;
      s.due = Array.isArray(s.due) ? s.due : [];
      s.due.push(one, seven);
      // limpa duplicados e limita
      s.due = Array.from(new Set(s.due.map(x=>Math.floor(x/60000)*60000))).slice(-10);
    }
    saveMastery(m);
  }

  function isDue(tag){
    const m = loadMastery();
    const s = m.skills?.[tag];
    if (!s || !Array.isArray(s.due)) return false;
    const now = Date.now();
    return s.due.some(ts => ts <= now);
  }

  function accuracy(tag){
    const m = loadMastery();
    const s = m.skills?.[tag];
    if (!s || !s.a) return 0;
    return s.c / s.a;
  }

  function selectedCampaign(){
    try{
      return typeof getSelectedCampaignId === 'function' ? getSelectedCampaignId() : 'base';
    }catch(e){ return 'base'; }
  }

  function isCampaignBase(){
    const cfg = gameState.sessionConfig;
    if (cfg && cfg.type === 'campaign') return cfg.campaignId === 'base';
    return selectedCampaign() === 'base';
  }

  function isCampaignReforco(){
    const cfg = gameState.sessionConfig;
    if (cfg && cfg.type === 'campaign') return cfg.campaignId === 'reforco';
    return selectedCampaign() === 'reforco';
  }

  function currentLessonTitle(){
    const cfg = gameState.sessionConfig;
    if (!cfg || cfg.type !== 'campaign') return '';
    const camp = CAMPAIGNS?.[cfg.campaignId];
    const lesson = camp?.units?.[cfg.unitIndex]?.lessons?.[cfg.lessonIndex];
    return lesson?.title || '';
  }

  function deriveSkillTag(operation){
    const title = (currentLessonTitle() || '').toLowerCase();
    const lvl = gameState.currentLevel || 'easy';
    if (operation === 'addition'){
      if (title.includes('até 20')) return 'add_le20';
      if (title.includes('vai-um')) return 'add_carry_2d';
      return (lvl==='easy') ? 'add_basic' : 'add_mix';
    }
    if (operation === 'subtraction'){
      if (title.includes('até 20')) return 'sub_le20';
      if (title.includes('empréstimo') || title.includes('emprestimo')) return 'sub_borrow_2d';
      return (lvl==='easy') ? 'sub_basic' : 'sub_mix';
    }
    if (operation === 'multiplication'){
      if (title.includes('0–5') || title.includes('0-5')) return 'mult_0_5';
      if (title.includes('6–10') || title.includes('6-10')) return 'mult_6_10';
      return 'mult_mix';
    }
    if (operation === 'division'){
      if (title.includes('resto')) return 'div_remainder';
      return 'div_exact';
    }
    if (operation === 'potenciacao') return 'pow_squares';
    if (operation === 'radiciacao') return 'root_squares';
    return operation + '_' + lvl;
  }

  const REFORCO_WEIGHTS = [
    ['addition', 25],
    ['subtraction', 25],
    ['multiplication', 23],
    ['division', 20],
    ['potenciacao', 4],
    ['radiciacao', 3],
  ];

  function weightedPick(pairs){
    const total = pairs.reduce((a,[,w])=>a+w,0);
    let r = Math.random()*total;
    for (const [k,w] of pairs){
      r -= w;
      if (r <= 0) return k;
    }
    return pairs[0][0];
  }

  function pickReviewOperation(){
    if (isCampaignBase()) return gameState.currentOperation || 'addition'; // mesma operação no Base
    // reforço misto
    return weightedPick(REFORCO_WEIGHTS);
  }

  function hintFor(tag, level){
    const H = {
      add_le20: [
        {t:'Tática', b:'Complete 10: 8+7 = 8+2+5.'},
        {t:'Tática', b:'Quebre o segundo número em partes (2 e 5).'},
        {t:'Exemplo', b:'28+7 = 28+2+5 = 30+5 = 35.'},
      ],
      add_carry_2d: [
        {t:'Tática', b:'Olhe as unidades: se passar de 10, vai 1.'},
        {t:'Tática', b:'Some unidades, anote a unidade e “vai 1” para dezenas.'},
        {t:'Exemplo', b:'47+18: 7+8=15 (fica 5, vai 1). 4+1+1=6 → 65.'},
      ],
      sub_le20: [
        {t:'Tática', b:'Use a reta mental: tire primeiro 10, depois o resto.'},
        {t:'Tática', b:'Compensação: 15−9 = 15−10+1.'},
        {t:'Exemplo', b:'52−19 = 52−20+1 = 33.'},
      ],
      sub_borrow_2d: [
        {t:'Tática', b:'Se a unidade “não dá”, empreste 1 dezena.'},
        {t:'Tática', b:'Transforme 1 dezena em 10 unidades e continue.'},
        {t:'Exemplo', b:'52−19: empresta → 12−9=3 e 4−1=3 → 33.'},
      ],
      mult_0_5: [
        {t:'Tática', b:'Use dobrar/metade e padrões: 5×n = 10×n ÷ 2.'},
        {t:'Tática', b:'Para 4×n: dobro do dobro (2×n duas vezes).'},
        {t:'Exemplo', b:'5×7 = 10×7 ÷ 2 = 70 ÷ 2 = 35.'},
      ],
      mult_6_10: [
        {t:'Tática', b:'9×n = 10×n − n.'},
        {t:'Tática', b:'8×n = 4×n + 4×n (ou 2×n quatro vezes).'},
        {t:'Exemplo', b:'9×7 = 70−7 = 63.'},
      ],
      div_exact: [
        {t:'Tática', b:'Volte na multiplicação: divisor × quociente = dividendo.'},
        {t:'Tática', b:'Tente o quociente e confira multiplicando.'},
        {t:'Exemplo', b:'56÷7: se 7×8=56, então 56÷7=8.'},
      ],
      div_remainder: [
        {t:'Tática', b:'Quociente é “quantas vezes cabe”; resto é o que sobra.'},
        {t:'Tática', b:'Resto sempre é menor que o divisor.'},
        {t:'Exemplo', b:'29÷4 = 7 resto 1 (4×7=28, sobra 1).'},
      ],
      pow_squares: [
        {t:'Tática', b:'Quadrado é número vezes ele mesmo.'},
        {t:'Tática', b:'Memorize quadrados comuns: 5²=25, 6²=36, 7²=49.'},
        {t:'Exemplo', b:'9² = 9×9 = 81.'},
      ],
      root_squares: [
        {t:'Tática', b:'Raiz quadrada: qual número ao quadrado dá isso?'},
        {t:'Tática', b:'Use quadrados perfeitos (1²…20²).'},
        {t:'Exemplo', b:'√64 = 8 porque 8²=64.'},
      ],
    };
    const arr = H[tag] || [{t:'Tática', b:'Use a dica para pensar em etapas.'},{t:'Tática', b:'Pense nas unidades/dezenas e confira.'},{t:'Exemplo', b:'Refaça com calma e confira.'}];
    return arr[Math.min(arr.length-1, Math.max(0, level-1))];
  }

  function showHint(level){
    const tag = gameState.v17.currentSkillTag || deriveSkillTag(gameState.currentOperation);
    const item = hintFor(tag, level);
    if (!hintPanel) return;
    hintTitle.textContent = item.t;
    hintBody.textContent = item.b;
    hintPanel.classList.remove('hidden');
  }

  function hideHint(){
    if (hintPanel) hintPanel.classList.add('hidden');
    gameState.v17.hintLevel = 0;
  }

  function setAnswerMode(mode){
    gameState.v17.answerMode = mode;
    if (mode === 'typed'){
      if (typedArea) typedArea.classList.remove('hidden');
      if (btnToggleInput) btnToggleInput.textContent = '🔢 Opções';
      // desabilita botões de alternativa
      document.querySelectorAll('.answer-option').forEach(b=>{ b.disabled = true; });
      if (typedInput) { typedInput.value=''; typedInput.focus(); }
    } else {
      if (typedArea) typedArea.classList.add('hidden');
      if (btnToggleInput) btnToggleInput.textContent = '⌨️ Digitar';
      document.querySelectorAll('.answer-option').forEach(b=>{ b.disabled = false; });
    }
  }

  function maybeSetModeForQuestion(){
    // v19.2 — Removido modo de digitar: sempre múltipla escolha
    setAnswerMode('mcq');
  }

  function microcheckSpec(tag){
    // retorna {q, a, b, correct:'a'|'b'}
    if (tag === 'add_carry_2d') return {q:'Somando as unidades, passou de 10?', a:'Sim', b:'Não', correct:'a'};
    if (tag === 'sub_borrow_2d') return {q:'Aqui precisa emprestar uma dezena?', a:'Sim', b:'Não', correct:'a'};
    if (tag === 'div_remainder') return {q:'O resto pode ser maior que o divisor?', a:'Pode', b:'Não pode', correct:'b'};
    if (tag === 'pow_squares') return {q:'Quadrado é…', a:'n×n', b:'n+n', correct:'a'};
    if (tag === 'root_squares') return {q:'√64 é…', a:'8', b:'6', correct:'a'};
    return {q:'Vale a pena usar a dica agora?', a:'Sim', b:'Não', correct:'a'};
  }

  function shouldMicrocheck(){
    if (isCampaignBase()) return true; // sempre no Base após 1º erro
    // Reforço: só quando necessário (chute/instabilidade)
    return (gameState.v17.wrongFastStreak >= 2) || (gameState.v17.forcedTypedCountdown > 0);
  }

  function openMicrocheck(){
    if (!mcOverlay) return;
    const tag = gameState.v17.currentSkillTag || deriveSkillTag(gameState.currentOperation);
    const spec = microcheckSpec(tag);
    mcQ.textContent = spec.q;
    mcA.textContent = spec.a;
    mcB.textContent = spec.b;
    mcOverlay.dataset.correct = spec.correct;
    mcOverlay.classList.remove('hidden');
  }

  function closeMicrocheck(){
    if (!mcOverlay) return;
    mcOverlay.classList.add('hidden');
  }

  // === Gerador v17 (amarrado à campanha e às skills) ===
  function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }

  function genByTag(tag){
    let num1=0,num2=0,answer=0,questionString='',questionSpeak='';
    let meta = {tag, ask:null};
    if (tag==='add_le20'){
      // Padrão B (misto): garante carry em parte das questões (sem sair de 20)
      gameState.v17._carryStreak = gameState.v17._carryStreak || 0;
      const forceCarry = (gameState.v17._carryStreak >= 2) || (Math.random() < 0.55);
      if (forceCarry){
        // carry: unidades somam >=10 e resultado <=20
        num1=randInt(0,19); num2=randInt(0,19);
        while((num1+num2>20) || ((num1%10)+(num2%10)<10)){
          num1=randInt(0,19); num2=randInt(0,19);
        }
        gameState.v17._carryStreak = 0;
      } else {
        // sem carry
        num1=randInt(0,20); num2=randInt(0,20);
        while((num1+num2>20) || ((num1%10)+(num2%10)>=10)){
          num1=randInt(0,20); num2=randInt(0,20);
        }
        gameState.v17._carryStreak += 1;
      }
      answer=num1+num2; questionString=`${num1} + ${num2}`; questionSpeak=`${num1} mais ${num2}`;
    } else if (tag==='add_carry_2d'){
      num1=randInt(10,99); num2=randInt(10,99);
      while((num1%10)+(num2%10)<10){ num1=randInt(10,99); num2=randInt(10,99); }
      answer=num1+num2; questionString=`${num1} + ${num2}`; questionSpeak=`${num1} mais ${num2}`;
    } else if (tag==='sub_le20'){
      // Padrão B (misto): garante empréstimo em parte das questões
      gameState.v17._borrowStreak = gameState.v17._borrowStreak || 0;
      const forceBorrow = (gameState.v17._borrowStreak >= 2) || (Math.random() < 0.55);
      if (forceBorrow){
        // empréstimo: num1>=10 e unidades de num1 < unidades de num2
        num1=randInt(10,20); num2=randInt(1,19);
        if (num2>num1) [num1,num2]=[num2,num1];
        while(!(num1>=10 && (num1%10) < (num2%10)) || (num2>num1)){
          num1=randInt(10,20); num2=randInt(1,19);
          if (num2>num1) [num1,num2]=[num2,num1];
        }
        gameState.v17._borrowStreak = 0;
      } else {
        num1=randInt(0,20); num2=randInt(0,20);
        if (num2>num1) [num1,num2]=[num2,num1];
        while(num1>=10 && ((num1%10) < (num2%10))){
          num1=randInt(0,20); num2=randInt(0,20);
          if (num2>num1) [num1,num2]=[num2,num1];
        }
        gameState.v17._borrowStreak += 1;
      }
      answer=num1-num2; questionString=`${num1} − ${num2}`; questionSpeak=`${num1} menos ${num2}`;
    } else if (tag==='sub_borrow_2d'){
      num1=randInt(10,99); num2=randInt(10,99);
      // garante num1>=num2 e empréstimo nas unidades
      if (num2>num1) [num1,num2]=[num2,num1];
      while((num1%10) >= (num2%10)){ 
        num1=randInt(10,99); num2=randInt(10,99);
        if (num2>num1) [num1,num2]=[num2,num1];
      }
      answer=num1-num2; questionString=`${num1} − ${num2}`; questionSpeak=`${num1} menos ${num2}`;
    } else if (tag==='div_remainder'){
      const divisor = randInt(2,9);
      const q = randInt(2,12);
      const r = randInt(1, divisor-1);
      const dividendo = divisor*q + r;
      // alterna pergunta: quociente ou resto
      const ask = (gameState.v17.questionNumberAlt = (gameState.v17.questionNumberAlt||0)+1) % 2 === 1 ? 'q' : 'r';
      meta.ask = ask;
      num1 = dividendo; num2 = divisor;
      if (ask==='q'){
        answer = q;
        questionString = `${dividendo} ÷ ${divisor} (quociente)`;
        questionSpeak = `Quanto é ${dividendo} dividido por ${divisor}, quociente?`;
      } else {
        answer = r;
        questionString = `${dividendo} ÷ ${divisor} (resto)`;
        questionSpeak = `Quanto sobra em ${dividendo} dividido por ${divisor}, resto?`;
      }
    } else if (tag==='div_exact'){
      const divisor = randInt(2,9);
      const q = randInt(2,12);
      num2=divisor; answer=q;
      num1=divisor*q;
      questionString=`${num1} ÷ ${num2}`;
      questionSpeak=`${num1} dividido por ${num2}`;
    } else if (tag==='pow_squares'){
      const base = randInt(2,15);
      num1=base; num2=2; answer=base*base;
      questionString=`${base}²`; questionSpeak=`${base} ao quadrado`;
    } else if (tag==='pow_cubes'){
      const base = randInt(2,10);
      num1=base; num2=3; answer=base*base*base;
      questionString=`${base}³`; questionSpeak=`${base} ao cubo`;
    } else if (tag==='root_squares'){
      const base = randInt(2,15);
      num1=base*base; answer=base;
      questionString=`√${num1}`; questionSpeak=`raiz quadrada de ${num1}`;
    } else if (tag==='root_estimate'){
      // estimativa leve (Reforço > Avançado). Resposta: arredondar para inteiro mais próximo.
      const k = randInt(5,19);
      const delta = randInt(1, Math.max(1, Math.min(2*k-1, 18)));
      const n = k*k + (Math.random()<0.5 ? delta : -delta);
      num1 = n;
      answer = Math.round(Math.sqrt(n));
      questionString = `√${n} (aprox.)`;
      questionSpeak = `raiz quadrada de ${n}, aproximadamente`;
    } else if (tag==='mult_0_5'){
      num1=randInt(0,5); num2=randInt(0,10);
      answer=num1*num2; questionString=`${num1} x ${num2}`; questionSpeak=`${num1} vezes ${num2}`;
    } else if (tag==='mult_6_10'){
      num1=randInt(6,10); num2=randInt(0,10);
      answer=num1*num2; questionString=`${num1} x ${num2}`; questionSpeak=`${num1} vezes ${num2}`;
    } else if (tag==='mult_11_20'){
      num1=randInt(11,20); num2=randInt(0,10);
      answer=num1*num2; questionString=`${num1} x ${num2}`; questionSpeak=`${num1} vezes ${num2}`;
    } else if (tag==='mult_mix'){
      num1=randInt(2,12); num2=randInt(2,10);
      answer=num1*num2; questionString=`${num1} x ${num2}`; questionSpeak=`${num1} vezes ${num2}`;
    } else if (tag==='add_basic'){
      num1=randInt(0,50); num2=randInt(0,50); answer=num1+num2; questionString=`${num1} + ${num2}`; questionSpeak=`${num1} mais ${num2}`;
    } else if (tag==='sub_basic'){
      num1=randInt(0,50); num2=randInt(0,50); if(num2>num1)[num1,num2]=[num2,num1]; answer=num1-num2; questionString=`${num1} − ${num2}`; questionSpeak=`${num1} menos ${num2}`;
    } else {
      // fallback para o gerador existente (modo livre)
      const q = window.__generateQuestionLegacy ? window.__generateQuestionLegacy(gameState.currentOperation) : null;
      if (q) return q;
      num1=randInt(1,20); num2=randInt(1,20); answer=num1+num2; questionString=`${num1} + ${num2}`; questionSpeak=`${num1} mais ${num2}`;
    }

    const options = buildDistractors(tag, num1, num2, answer, meta);
    return {
      question: questionString + ' = ?',
      voiceQuestion: questionSpeak,
      answer: answer,
      options: options,
      operacao: mapTagToOperation(tag),
      num1, num2,
      meta
    };
  }

  function mapTagToOperation(tag){
    if (tag.startsWith('add')) return 'addition';
    if (tag.startsWith('sub')) return 'subtraction';
    if (tag.startsWith('mult')) return 'multiplication';
    if (tag.startsWith('div')) return 'division';
    if (tag.startsWith('pow')) return 'potenciacao';
    if (tag.startsWith('root')) return 'radiciacao';
    return gameState.currentOperation || 'addition';
  }

  function buildDistractors(tag, num1, num2, correct, meta){
    const ds = new Set([correct]);
    function push(x){
      if (!Number.isFinite(x)) return;
      if (x < 0) return;
      ds.add(Math.round(x));
    }
    // erros típicos
    if (tag==='add_carry_2d'){
      // sem vai-um (só soma unidades sem carry)
      const wrong = (Math.floor(num1/10)+Math.floor(num2/10))*10 + ((num1%10)+(num2%10));
      push(wrong);
      push(correct-10);
      push(correct+10);
    } else if (tag==='sub_borrow_2d'){
      // esqueceu emprestar (faz unidade negativa virar positiva simples)
      const wrong = (Math.floor(num1/10)-Math.floor(num2/10))*10 + Math.abs((num1%10)-(num2%10));
      push(wrong);
      push(correct+10);
      push(Math.max(0, correct-10));
    } else if (tag==='div_remainder'){
      // confundir q e r
      if (meta && meta.ask==='q'){
        push(Math.floor(num1/num2)); // pode ser q
        push(Math.max(0, Math.floor(num1/num2)-1));
        push(Math.floor(num1/num2)+1);
      } else {
        const r = num1 % num2;
        push(r+1);
        push(Math.max(0,r-1));
        push(num2-1);
      }
    } else if (tag==='div_exact'){
      const q = num1/num2;
      push(q-1); push(q+1); push(q+2);
    } else if (tag.startsWith('mult')){
      // tabuada vizinha
      push((num1-1)*num2);
      push((num1+1)*num2);
      push(num1*(num2+1));
    } else if (tag==='pow_squares'){
      const base = num1;
      push(base* (base+1)); // confusão
      push((base-1)*(base-1));
      push((base+1)*(base+1));
    } else if (tag==='root_squares'){
      const root = correct;
      push(root-1);
      push(root+1);
      push(root+2);
    } else {
      push(correct+1); push(Math.max(0, correct-1)); push(correct+2);
    }
    // completa até 4
    while(ds.size < 4){
      push(correct + randInt(-15,15));
    }
    const arr = Array.from(ds).slice(0,4);
    return shuffle(arr);
  }

  
  // ===== v18 — Missões 5 min (1 por dia) =====
  const MISSION_KEY = 'matemagica_missions_v1';

  function loadMission(){
    try{
      return JSON.parse(LS.get(MISSION_KEY) || '{"date":"","done":false,"type":"","doneTs":0}');
    }catch(e){
      return {date:'',done:false,type:'',doneTs:0};
    }
  }

  function saveMission(m){
    try{ LS.set(MISSION_KEY, JSON.stringify(m)); }catch(e){}
  }

  function ensureMissionToday(){
    const m = loadMission();
    const t = todayKey();
    if (m.date !== t){
      return {date:t,done:false,type:'',doneTs:0};
    }
    return m;
  }

  function setMissionDone(type){
    const m = ensureMissionToday();
    m.done = true;
    m.type = String(type||'');
    m.doneTs = Date.now();
    saveMission(m);
    renderMissions();
  }

  function renderMissions(){
    const m = ensureMissionToday();
    const status = document.getElementById('missions-status');
    const b1 = document.getElementById('mission-review');
    const b2 = document.getElementById('mission-forge');
    const b3 = document.getElementById('mission-combo');
    if (status) status.textContent = m.done ? 'Hoje: 1/1 ✅' : 'Hoje: 0/1';
    const btns = [b1,b2,b3].filter(Boolean);
    for (const b of btns){
      b.disabled = !!m.done;
      b.classList.toggle('done', !!m.done);
    }
  }

  // expõe hooks (usado pelo timer)
  window.__setMissionDone = setMissionDone;
  window.__renderMissions = renderMissions;

  const OP_TAGS = {
    'addition': ['add_le20','add_carry_2d','add_basic'],
    'subtraction': ['sub_le20','sub_borrow_2d','sub_basic'],
    'multiplication': ['mult_0_5','mult_6_10','mult_11_20','mult_mix'],
    'division': ['div_exact','div_remainder'],
    'potenciacao': ['pow_squares','pow_cubes'],
    'radiciacao': ['root_squares','root_estimate']
  };

  function baseFocusOp(){
    try{
      const cur = (typeof getCurrentLesson === 'function') ? getCurrentLesson('base') : null;
      const camp = (typeof CAMPAIGNS !== 'undefined') ? CAMPAIGNS['base'] : null;
      const lesson = camp?.units?.[cur?.unitIndex]?.lessons?.[cur?.lessonIndex];
      if (lesson?.operation) return lesson.operation;
    }catch(e){}
    return gameState.currentOperation || 'addition';
  }

  function allSeenTags(){
    const m = loadMastery();
    return Object.keys(m.skills || {});
  }

  function tagAttempts(tag){
    const m = loadMastery();
    const s = m.skills?.[tag];
    return Number(s?.a||0);
  }

  function tagAcc(tag){
    const m = loadMastery();
    const s = m.skills?.[tag];
    const a = Number(s?.a||0);
    const c = Number(s?.c||0);
    return a ? (c/a) : 0;
  }

  function tagIsDue(tag){ return isDue(tag); }

  function weightedPick(pairs){
    const total = pairs.reduce((acc,[_,w])=>acc+Math.max(0,w),0);
    if (total <= 0) return pairs[0]?.[0] || 'add_basic';
    let r = Math.random() * total;
    for (const [item,w] of pairs){
      r -= Math.max(0,w);
      if (r <= 0) return item;
    }
    return pairs[pairs.length-1]?.[0] || 'add_basic';
  }

  function pickWeakestTag(fromTags){
    const tags = (fromTags && fromTags.length) ? fromTags : allSeenTags();
    if (!tags.length){
      // fallback por campanha
      const op = isCampaignBase() ? baseFocusOp() : pickReviewOperation();
      const list = OP_TAGS[op] || ['add_basic'];
      return list[0];
    }
    // score = (1-acc) + dueBonus + lowAttemptsPenalty
    const scored = tags.map(t=>{
      const a = tagAttempts(t);
      const acc = tagAcc(t);
      const due = tagIsDue(t) ? 0.35 : 0;
      const few = (a < 4) ? 0.10 : 0; // evita “falso fraco” sem dados
      const score = (1-acc) + due + few;
      return {t, score, a, acc};
    }).sort((x,y)=>y.score - x.score);
    return scored[0].t;
  }

  
  function lessonTagForCampaign(operation, level){
    // mapeia operação/nível de campanha para skillTag
    const op = operation;
    const lv = level || 'easy';
    if (op==='addition'){
      if (lv==='easy') return 'add_le20';
      return 'add_carry_2d';
    }
    if (op==='subtraction'){
      if (lv==='easy') return 'sub_le20';
      return 'sub_borrow_2d';
    }
    if (op==='multiplication'){
      if (lv==='easy') return 'mult_0_5';
      if (lv==='medium') return 'mult_6_10';
      return 'mult_11_20';
    }
    if (op==='division'){
      if (lv==='easy') return 'div_exact';
      return 'div_remainder';
    }
    if (op==='potenciacao'){
      if (lv==='easy') return 'pow_squares';
      return 'pow_cubes';
    }
    if (op==='radiciacao'){
      // estimativa só no reforço e só no avançado; default usa quadrados perfeitos
      return 'root_squares';
    }
    return deriveSkillTag(op);
  }

  function campaignIsBase(cfg){
    return !!(cfg && cfg.type==='campaign' && cfg.campaignId==='base');
  }

  function make70_30Sequence(n){
    const total = Math.max(1, Math.floor(n||10));
    const nLesson = Math.max(1, Math.round(total * 0.70));
    const nReview = Math.max(0, total - nLesson);
    const seq = [];
    for (let i=0;i<nLesson;i++) seq.push('lesson');
    for (let i=0;i<nReview;i++) seq.push('review');
    // shuffle simples
    for (let i=seq.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      const tmp=seq[i]; seq[i]=seq[j]; seq[j]=tmp;
    }
    // evita streaks longas de review
    let streak=0;
    for (let i=0;i<seq.length;i++){
      if (seq[i]==='review') streak++; else streak=0;
      if (streak>=3){
        // troca com próximo lesson se existir
        for (let k=i+1;k<seq.length;k++){
          if (seq[k]==='lesson'){
            const tmp=seq[i]; seq[i]=seq[k]; seq[k]=tmp;
            streak=0;
            break;
          }
    // Guarda baseTime para ajustes (ex.: dobrar tempo ao ativar voz)
    gameState.baseTime = baseTime;
        }
      }
    }
    return seq;
  }

  function buildCampaignPlan(cfg, operation, level){
    const totalQ = (cfg && Number.isFinite(cfg.totalQuestions)) ? cfg.totalQuestions : 10;
    const seq = make70_30Sequence(totalQ);
    const lessonTag = lessonTagForCampaign(operation, level);
    const plan = [];
    for (let i=0;i<seq.length;i++){
      if (seq[i]==='lesson'){
        plan.push({mode:'lesson', op: operation, tag: lessonTag});
      } else {
        if (campaignIsBase(cfg)){
          // Base: revisão apenas da mesma operação
          const tags = OP_TAGS[operation] || [lessonTag];
          // remove tags incompatíveis (root_estimate e pow_cubes ficam como opcional no avançado; aqui só se existir)
          const pick = pickReviewTag(tags);
          plan.push({mode:'review', op: operation, tag: pick});
        } else {
          // Reforço: revisão mix por pesos de operações
          const op = pickReviewOperation();
          const tags = OP_TAGS[op] || [deriveSkillTag(op)];
          // raiz estimativa só se habilitada no avançado
          const filtered = tags.filter(t=>{
            if (t==='root_estimate') return !!(gameState.v19 && gameState.v19.rootEstimateEnabled);
            return true;
          });
          const pick = pickReviewTag(filtered.length ? filtered : tags);
          plan.push({mode:'review', op: op, tag: pick});
        }
      }
    }
    return {seq: plan, i:0, key: `${cfg.campaignId||'camp'}|${operation}|${level}|${totalQ}`};
  }

  function pickReviewTag(fromTags){
    const tags = (fromTags && fromTags.length) ? fromTags : allSeenTags();
    // 1) Due primeiro
    const due = tags.filter(tagIsDue);
    if (due.length) return weightedPick(due.map(t=>[t, 1]));
    // 2) Menor acurácia
    if (tags.length) return pickWeakestTag(tags);
    // 3) fallback
    const op = isCampaignBase() ? baseFocusOp() : pickReviewOperation();
    return (OP_TAGS[op]||['add_basic'])[0];
  }

  function pickComboTag(){
    if (isCampaignBase()){
      const op = baseFocusOp();
      const tags = OP_TAGS[op] || ['add_basic'];
      // alterna entre tags do mesmo tipo para variar sem confundir
      return weightedPick(tags.map(t=>{
        const a = tagAttempts(t);
        const acc = tagAcc(t);
        const due = tagIsDue(t) ? 0.25 : 0;
        const w = (1-acc) + due + (a>=4 ? 0.15 : 0.05);
        return [t, w];
      }));
    }
    // Reforço: misto com pesos (potência/raiz menor peso)
    const all = Object.values(OP_TAGS).flat();
    return weightedPick(all.map(t=>{
      let w = 1.0;
      if (t.startsWith('pow') || t.startsWith('root')) w = 0.6;
      const a = tagAttempts(t);
      const acc = tagAcc(t);
      const due = tagIsDue(t) ? 0.30 : 0;
      w = w * ((1-acc) + due + (a>=4 ? 0.10 : 0.03));
      return [t, w];
    }));
  }

  function pickMissionTag(mtype){
    if (mtype === 'forge'){
      if (isCampaignBase()){
        const op = baseFocusOp();
        const tags = OP_TAGS[op] || ['add_basic'];
        return pickWeakestTag(tags);
      }
      return pickWeakestTag();
    }
    if (mtype === 'combo'){
      return pickComboTag();
    }
    // 'review' padrão
    if (isCampaignBase()){
      const op = baseFocusOp();
      const tags = OP_TAGS[op] || ['add_basic'];
      return pickReviewTag(tags);
    }
    return pickReviewTag();
  }

  function startMission(mtype){
    const m = ensureMissionToday();
    if (m.done){
      showFeedbackMessage('Você já concluiu a missão de hoje ✅', 'info', 1800);
      return;
    }
    const cid = selectedCampaign();
    const op = (cid==='base') ? baseFocusOp() : pickReviewOperation();
    const level = (cid==='base') ? 'easy' : 'medium';
    const labelMap = {review:'Revisão inteligente', forge:'Forja do dia', combo:'Combo tático'};
    gameState.sessionConfig = {
      type:'mission',
      missionType: mtype,
      durationTicks: 3000, // 5 min (300s * 10 ticks)
      totalQuestions: 999,
      forceRapidMode: true, // precisa do timer global (sem pressão por questão)
      label: `Missão 5 min • ${labelMap[mtype] || 'Missão'}`
    };
    startGame(op, level);
  }


  // Guarda gerador legado e substitui generateQuestion
  if (!window.__generateQuestionLegacy) window.__generateQuestionLegacy = window.generateQuestion;
  window.generateQuestion = function(operation){
    const cfg = gameState.sessionConfig;
    // Em campanha/minigame/review usamos skillTags
    let tag = deriveSkillTag(operation);
    // Campanha: 70/30 (lesson vs review)
    if (cfg && cfg.type==='campaign'){
      gameState.v19 = gameState.v19 || { rootEstimateEnabled: false };
      const key = `${cfg.campaignId||'camp'}|${operation}|${gameState.currentLevel}|${cfg.totalQuestions||''}`;
      if (!gameState.v17.reviewPlan || gameState.v17.reviewPlan.key !== key){
        gameState.v17.reviewPlan = buildCampaignPlan(cfg, operation, gameState.currentLevel);
      }
      const plan = gameState.v17.reviewPlan;
      const step = plan.seq[Math.min(plan.i, plan.seq.length-1)];
      plan.i = Math.min(plan.i+1, plan.seq.length);
      gameState.currentOperation = step.op;
      tag = step.tag;
    }
    // Se for minigame ou revisão em reforço, pode sortear operação e tag
    if (cfg && cfg.type==='mission'){

      // Missões 5 min: seleciona habilidade por estratégia (Base = mesma operação; Reforço = misto com pesos)
      const mtype = cfg.missionType || 'review';
      const tagPick = pickMissionTag(mtype);
      const op = mapTagToOperation(tagPick);
      gameState.currentOperation = op;
      tag = tagPick;
    }
    // Se for minigame ou revisão em reforço, pode sortear operação e tag
    else if (cfg && (cfg.type==='minigame' || cfg.type==='smartReview')){
      const op = (cfg.type==='smartReview') ? cfg.reviewOp : pickReviewOperation();
      gameState.currentOperation = op;
      tag = deriveSkillTag(op);
    }
    gameState.v17.currentSkillTag = tag;
    gameState.v17.currentOp = operation;
    return genByTag(tag);
  };

  // === startGame / nextQuestion / handleAnswer — versões v17 ===
  if (!window.__startGameLegacy) window.__startGameLegacy = window.startGame;
  window.startGame = function(operation, level){
    // preserva comportamento original, mas configura v17
    gameState.v17.hintLevel = 0;
    gameState.v17.wrongFastStreak = 0;
    gameState.v17.forcedTypedCountdown = 0;
    gameState.v17.timerMode = 'perQuestion';

    const cfg = gameState.sessionConfig;
    if (cfg && (cfg.type === 'minigame' || cfg.type === 'mission')){
      gameState.v17.timerMode = 'global';
    }
    recordDayPractice();
    // chama startGame original (reseta estado, define isRapid etc.)
    window.__startGameLegacy(operation, level);

    // Ajusta timer global do minigame: garante que não reseta por questão
    if (gameState.v17.timerMode === 'global' && gameState.isRapidMode){
      // define maxTime em “ticks” (o timer do app usa tick de 100ms)
      gameState.maxTime = (cfg && cfg.type === 'mission') ? (Number(cfg.durationTicks)||3000) : 1800; // mission=5min, minigame=3min
      gameState.timeLeft = gameState.maxTime;
      gameState.lowTimeAlerted = false;
      startTimer();
    }
  };

  if (!window.__nextQuestionLegacy) window.__nextQuestionLegacy = window.nextQuestion;
  window.nextQuestion = function(){
    hideHint();
    closeMicrocheck();
    // No timer global, não resetar timeLeft por questão
    const globalTimer = (gameState.v17.timerMode === 'global');

    // Atualiza start timestamp para anti-chute
    gameState.v17.questionStartTs = Date.now();

    // chama nextQuestion legado, mas ele pode chamar generateQuestion (já patchado)
    window.__nextQuestionLegacy();

    // aplica modo digitado/mcq
    maybeSetModeForQuestion();

    // se global timer, garante que o legado não resetou timeLeft
    if (globalTimer && gameState.isRapidMode){
      // se o legado resetou, volta para o menor entre o que era e maxTime (evita bug)
      gameState.timeLeft = Math.min(gameState.timeLeft, gameState.maxTime);
    }
  };

  if (!window.__handleAnswerLegacy) window.__handleAnswerLegacy = window.handleAnswer;
  // handleAnswer é chamado pelo clique nos botões; vamos interceptar pela opção digitada
  function evaluateAnswer(given){
    const correct = gameState.currentQuestion?.answer;
    return Number(given) === Number(correct);
  }

  function afterAnswer(correct){
    const tag = gameState.v17.currentSkillTag || deriveSkillTag(gameState.currentOperation);
    const rt = Date.now() - (gameState.v17.questionStartTs || Date.now());
    updateMastery(tag, !!correct, rt);
  }

  function forceHelpIfChute(){
    // 3 erros rápidos seguidos → força dica e 2 questões digitadas
    gameState.v17.forcedTypedCountdown = Math.max(gameState.v17.forcedTypedCountdown, 2);
    gameState.v17.hintLevel = Math.max(gameState.v17.hintLevel, 1);
    showHint(1);
  }

  // Reimplementa entrada digitada sem quebrar legado
  function submitTyped(){
    if (!typedInput) return;
    const val = typedInput.value.trim();
    if (val === '') return;
    const ok = evaluateAnswer(val);

    // anti-chute (erros muito rápidos)
    const rt = Date.now() - (gameState.v17.questionStartTs || Date.now());
    if (!ok && rt < 1400) gameState.v17.wrongFastStreak += 1;
    if (ok) gameState.v17.wrongFastStreak = 0;

    afterAnswer(ok);

    if (!ok){
      // microcheck: Base sempre após 1º erro; Reforço só quando necessário
      if (gameState.attemptsThisQuestion === 0 && shouldMicrocheck()){
        openMicrocheck();
      }
      if (gameState.v17.wrongFastStreak >= 3) forceHelpIfChute();
    }

    // aplica pontuação/feedback pelo legado, mas precisamos “fingir” clique em alternativa
    // Estratégia: chamar handleAnswer original com um botão falso contendo o texto digitado.
    const fakeBtn = document.createElement('button');
    fakeBtn.innerText = String(val);
    window.__handleAnswerLegacy(fakeBtn);

    if (gameState.v17.forcedTypedCountdown > 0) gameState.v17.forcedTypedCountdown -= 1;
  }

  // intercepta clique de alternativas para registrar mastery/microcheck/anti-chute
  const _origClickHandlersInstalled = !!window.__v17ClickHandlersInstalled;
  if (!_origClickHandlersInstalled){
    window.__v17ClickHandlersInstalled = true;
    document.querySelectorAll('.answer-option').forEach((btn)=>{
      btn.addEventListener('click', (ev)=>{
        // se estiver em modo digitado, ignora cliques
        if (gameState.v17.answerMode === 'typed') { ev.preventDefault(); ev.stopPropagation(); return; }

        const txt = btn.querySelector('.answer-text') ? btn.querySelector('.answer-text').innerText : btn.innerText;
        const ok = evaluateAnswer(txt);

        const rt = Date.now() - (gameState.v17.questionStartTs || Date.now());
        if (!ok && rt < 1400) gameState.v17.wrongFastStreak += 1;
        if (ok) gameState.v17.wrongFastStreak = 0;

        afterAnswer(ok);

        if (!ok){
          if (gameState.attemptsThisQuestion === 0 && shouldMicrocheck()){
            // abre microcheck logo após 1º erro
            setTimeout(openMicrocheck, 0);
          }
          if (gameState.v17.wrongFastStreak >= 3) forceHelpIfChute();
        }

        if (gameState.v17.forcedTypedCountdown > 0) gameState.v17.forcedTypedCountdown -= 1;
      }, true);
    });
  }

  // Botões v17
  if (btnHint){
    btnHint.addEventListener('click', ()=>{
      gameState.v17.hintLevel = Math.max(1, gameState.v17.hintLevel || 0);
      showHint(gameState.v17.hintLevel);
    });
  }
  if (btnNextHint){
    btnNextHint.addEventListener('click', ()=>{
      gameState.v17.hintLevel = Math.min(3, (gameState.v17.hintLevel||1)+1);
      showHint(gameState.v17.hintLevel);
    });
  }
  if (btnCloseHint) btnCloseHint.addEventListener('click', hideHint);

  if (btnToggleInput){
    btnToggleInput.addEventListener('click', ()=>{
      const cur = gameState.v17.answerMode;
      setAnswerMode(cur==='typed' ? 'mcq' : 'typed');
    });
  }
  
// v19.1 — Teclado numérico para respostas digitadas (turma fraca)
function setupTypedKeypad(){
  const pad = document.getElementById('typed-keypad');
  if (!pad || !typedInput) return;
  pad.addEventListener('click', (ev)=>{
    const b = ev.target && ev.target.closest ? ev.target.closest('button[data-k]') : null;
    if (!b) return;
    const k = b.getAttribute('data-k');
    if (!k) return;
    ev.preventDefault();
    typedInput.focus();
    if (k === 'bs'){
      typedInput.value = typedInput.value.slice(0, -1);
      return;
    }
    if (k === 'clr'){
      typedInput.value = '';
      return;
    }
    if (k === 'ok'){
      submitTyped();
      return;
    }
    // número
    if (/^\d$/.test(k)){
      // evita números absurdos (limite suave)
      if (typedInput.value.length >= 4) return;
      typedInput.value += k;
    }
  });
}

  if (btnSubmitTyped) btnSubmitTyped.addEventListener('click', submitTyped);
  setupTypedKeypad();
  if (typedInput){
    typedInput.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') submitTyped();
    });
  }

  // Microcheck buttons
  function microcheckAnswer(choice){
    const correct = (mcOverlay && mcOverlay.dataset.correct) || 'a';
    closeMicrocheck();
    if (choice !== correct){
      // se errou microcheck, recomenda dica nível 2 (sem punir)
      gameState.v17.hintLevel = Math.max(gameState.v17.hintLevel, 2);
      showHint(2);
    } else {
      // se acertou, dá uma dica curtinha opcional (não polui)
      if (gameState.mentor?.enabled) {
        try{ showMentorBubble('Boa. Agora tente de novo.'); }catch(e){}
      }
    }
  }
  if (mcA) mcA.addEventListener('click', ()=>microcheckAnswer('a'));
  if (mcB) mcB.addEventListener('click', ()=>microcheckAnswer('b'));

  // Rewire Revisão do dia para sessão inteligente (70/30)
  const btnOpenReview = document.getElementById('btn-open-review');
  if (btnOpenReview){
    safeOn(btnOpenReview, 'click', ()=>{
      // inicia sessão smartReview (10 questões)
      const cid = selectedCampaign();
      const op = (cid==='base') ? (gameState.currentOperation || 'addition') : pickReviewOperation();
      gameState.sessionConfig = { type:'smartReview', reviewOp: op, totalQuestions: 10, forceRapidMode: false, label:'Revisão do dia' };
      startGame(op, cid==='base' ? 'easy' : 'medium');
    }, {capture:true});
  }

  // Minigame: garante timer global
  const btnMini = document.getElementById('btn-minigame-day');
  if (btnMini){
    btnMini.addEventListener('click', ()=>{
      const cid = selectedCampaign();
      const cur = (typeof getCurrentLesson === 'function') ? getCurrentLesson(cid) : null;
      if (!cur) return;
      const camp = CAMPAIGNS[cid];
      const lesson = camp?.units?.[cur.unitIndex]?.lessons?.[cur.lessonIndex];
      if (!lesson) return;
      gameState.sessionConfig = {
        type: 'minigame',
        campaignId: cid,
        unitIndex: cur.unitIndex,
        lessonIndex: cur.lessonIndex,
        totalQuestions: 999, // ilimitado, vale o timer
        forceRapidMode: true,
        label: `${camp.name} • Minigame 3 min`
      };
      startGame(lesson.operation, lesson.level || 'medium');
    }, {capture:true});
  }


  // Missões 5 min (1 por dia)
  const btnMissionReview = document.getElementById('mission-review');
  const btnMissionForge  = document.getElementById('mission-forge');
  const btnMissionCombo  = document.getElementById('mission-combo');
  if (btnMissionReview) btnMissionReview.addEventListener('click', ()=>startMission('review'));
  if (btnMissionForge)  btnMissionForge.addEventListener('click', ()=>startMission('forge'));
  if (btnMissionCombo)  btnMissionCombo.addEventListener('click', ()=>startMission('combo'));

  // render inicial
  try{ renderMissions(); }catch(e){}
})();