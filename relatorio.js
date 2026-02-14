
// PET Escolar Offline v1 — resolver de chaves por aluno (relatório)
const SCHOOL_KEY = 'pet_school_v1';
const PER_STUDENT_KEYS = new Set([
  'matemagica_profile_v1','matemagica_sessions_v1','matemagica_attempts_v1','matemagica_mastery_v1',
  'matemagica_missions_v1','matemagica_mult_progress_map_v1','matemagica_path_progress_v1','matemagica_daily_v1',
  'matemagica_mentor_v1','matemagica_high_scores_v1','matemagica_xp','matemagica_errors','matemagica_diff_focus',
  'matemagica_mult_cfg','pet_study_progress_v1','pet_seen_train_ids_v1'
]);
function schoolLoad(){ try{ const raw=LS.get(SCHOOL_KEY); return raw?JSON.parse(raw):null; }catch(_){ return null; } }
function activeStudentId(){ const sch=schoolLoad(); const sid=sch&&sch.active&&sch.active.studentId; return sid?String(sid):null; }
function keyFor(baseKey){ if(!baseKey||typeof baseKey!=='string') return baseKey; if(!PER_STUDENT_KEYS.has(baseKey)) return baseKey; const sid=activeStudentId(); if(!sid) return baseKey; return `${baseKey}__${sid}`; }
const LS = { get:(k)=>{try{return LS.get(keyFor(k));}catch(_){return null;}}, set:(k,v)=>{try{LS.set(keyFor(k),v);}catch(_){}} };

/* Relatório do Estudante — Matemágica (offline)
   - Gera código MMR1 + QR + JSON/CSV
   - Usa sessões salvas pelo app em: matemagica_sessions_v1
   - Usa erros salvos pelo app em: matemagica_errors
*/
(function(){
  'use strict';

  const PROFILE_KEY = 'matemagica_profile_v1';
  const SESSIONS_KEY = 'matemagica_sessions_v1';
  const ERRORS_KEY = 'matemagica_errors';
  const XP_KEY = 'matemagica_xp';

  const els = {
    profileSelect: document.getElementById('profile-select'),
    btnLoadProfile: document.getElementById('btn-load-profile'),
    inpName: document.getElementById('inp-name'),
    inpCode: document.getElementById('inp-code'),
    inpClass: document.getElementById('inp-class'),
    inpSchool: document.getElementById('inp-school'),
    periodSelect: document.getElementById('period-select'),
    btnGenerate: document.getElementById('btn-generate'),
    out: document.getElementById('report-output'),
    code: document.getElementById('report-code'),
    qr: document.getElementById('qrcode'),
    btnShowQr: document.getElementById('btn-show-qr'),
    btnCopy: document.getElementById('btn-copy-code'),
    btnJson: document.getElementById('btn-download-json'),
    btnCsv: document.getElementById('btn-download-csv'),
    btnWeekly: document.getElementById('btn-download-weekly'),
    btnWeeklyQr: document.getElementById('btn-weekly-qr'),
    weeklyQrPanel: document.getElementById('weekly-qr-panel'),
    weeklyQrList: document.getElementById('weekly-qr-list'),
    weeklyQrText: document.getElementById('weekly-qr-text'),
    btnCopyWeeklyCode: document.getElementById('btn-copy-weekly-code'),
    btnHideWeeklyQr: document.getElementById('btn-hide-weekly-qr'),
  };

  function safeParse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch(_) { return fallback; }
  }

  function now(){ return Date.now(); }

  function startEndFromPeriod(value){
    const end = now();
    let start = end - 24*3600*1000; // default: 24h
    if (value === 'today') {
      const d = new Date();
      d.setHours(0,0,0,0);
      start = d.getTime();
    } else if (value === '7d') {
      start = end - 7*24*3600*1000;
    } else if (value === '30d') {
      start = end - 30*24*3600*1000;
    } else if (value === 'all') {
      start = 0;
    }
    return {start, end};
  }

  function b64EncodeUnicode(str){
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64DecodeUnicode(str){
    return decodeURIComponent(escape(atob(str)));
  }

  function readProfile(){
    const p = safeParse(LS.get(PROFILE_KEY), {});
    return {
      name: String(p?.name || '').trim(),
      turma: String(p?.turma || '').trim(),
      escola: String(p?.escola || '').trim(),
    };
  }

  function loadSessions(){
    const arr = safeParse(LS.get(SESSIONS_KEY), []);
    return Array.isArray(arr) ? arr : [];
  }

  function loadErrors(){
    const arr = safeParse(LS.get(ERRORS_KEY), []);
    return Array.isArray(arr) ? arr : [];
  }

  function loadXp(){
    const v = parseInt(LS.get(XP_KEY) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  }

  function setOutput(html){
    els.out.innerHTML = html;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (m)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function fmtDate(ts){
    const d = new Date(ts);
    return d.toLocaleString('pt-BR');
  }

  function summarizeTop(arr, keyFn, n){
    const map = new Map();
    for (const it of arr){
      const k = keyFn(it);
      if (!k) continue;
      map.set(k, (map.get(k)||0) + 1);
    }
    const sorted = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);
    return sorted;
  }

  function makeCsv(report){
    const rows = [];
    rows.push(['schemaVersion','classId','studentCode','studentName','periodStart','periodEnd','questions','correct','wrong','accuracy','xpGained','xpTotal','durationSec'].join(','));
    rows.push([
      report.schemaVersion,
      csvSafe(report.classId),
      csvSafe(report.studentCode),
      csvSafe(report.studentName),
      report.periodStart,
      report.periodEnd,
      report.summary.questions,
      report.summary.correct,
      report.summary.wrong,
      report.summary.accuracy,
      report.summary.xpGained,
      report.summary.xpTotal,
      report.summary.durationSec
    ].join(','));

    rows.push('');
    rows.push('Breakdown by operation');
    rows.push('operation,questions,correct,wrong,accuracy');
    for (const op of Object.keys(report.breakdown.byOperation)){
      const b = report.breakdown.byOperation[op];
      rows.push([op,b.questions,b.correct,b.wrong,b.accuracy].join(','));
    }
    rows.push('');
    rows.push('Top mistakes (from saved errors)');
    rows.push('item,count');
    for (const [k,v] of report.topMistakes){
      rows.push([csvSafe(k), v].join(','));
    }
    return rows.join('\n');
  }

  function csvSafe(v){
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function download(name, mime, content){
    const blob = new Blob([content], {type: mime});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function buildReport(){
    const identity = {
      studentName: String(els.inpName.value || '').trim(),
      studentCode: String(els.inpCode.value || '').trim(),
      classId: String(els.inpClass.value || '').trim(),
      school: String(els.inpSchool.value || '').trim()
    };

    const period = startEndFromPeriod(els.periodSelect.value || 'last7');
    const sessions = loadSessions().filter(s => Number(s?.ts) >= period.start && Number(s?.ts) <= period.end);
    const errors = loadErrors().filter(e => Number(e?.timestamp) >= period.start && Number(e?.timestamp) <= period.end);

    const sum = {
      questions: 0,
      correct: 0,
      wrong: 0,
      xpGained: 0,
      durationSec: 0
    };

    const byOp = {};
    const byTag = {}; // operation => stats
    for (const s of sessions){
      const op = String(s?.operation || 'unknown');
      if (!byOp[op]) byOp[op] = {questions:0, correct:0, wrong:0};
      const q = Number(s?.questions ?? (Number(s?.correct||0)+Number(s?.wrong||0)));
      const c = Number(s?.correct||0);
      const w = Number(s?.wrong||0);
      const xpD = Number(s?.xpDelta||0);
      const dur = Number(s?.durationSec||0);

      byOp[op].questions += q;
      byOp[op].correct += c;
      byOp[op].wrong += w;

      sum.questions += q;
      sum.correct += c;
      sum.wrong += w;
      sum.xpGained += xpD;
      sum.durationSec += dur;
    }

    const accuracy = sum.questions > 0 ? Math.round((sum.correct / sum.questions) * 100) : 0;

    // Top mistakes: use error question string if exists, else operation label
    
    // Breakdown por skillTag (principalmente para intervenção do professor)
    for (const e of errors){
      const op = String(e?.operacao || '').trim();
      const tag = String(e?.skillTag || '').trim() || (op ? ('op:' + op) : 'desconhecido');
      byTag[tag] = (byTag[tag]||0) + 1;
    }
const topMistakes = summarizeTop(errors, (e)=>{
      if (e?.question) return String(e.question);
      if (e?.operation) return `Erro em ${String(e.operation)}`;
      return '';
    }, 5);

    const report = {
      schemaVersion: '1.0',
      createdAt: now(),
      periodStart: period.start,
      periodEnd: period.end,
      classId: identity.classId || identity.school || '',
      school: identity.school,
      studentCode: identity.studentCode,
      studentName: identity.studentName,
      summary: {
        questions: sum.questions,
        correct: sum.correct,
        wrong: sum.wrong,
        accuracy,
        xpGained: sum.xpGained,
        xpTotal: loadXp(),
        durationSec: sum.durationSec
      },
      breakdown: {
        byOperation: Object.fromEntries(Object.entries(byOp).map(([op, b])=>{
          const acc = b.questions > 0 ? Math.round((b.correct/b.questions)*100) : 0;
          return [op, { ...b, accuracy: acc }];
        }))
      },
      topMistakes
    };

    return report;
  }

  function renderReport(report){
    const lines = [];
    lines.push(`<div class="tiny muted">Gerado em: <strong>${escapeHtml(fmtDate(report.createdAt))}</strong></div>`);
    lines.push(`<div style="margin-top:8px;"><span class="pill">Turma</span> ${escapeHtml(report.classId || '-')}&nbsp;&nbsp;<span class="pill">Estudante</span> ${escapeHtml(report.studentCode || report.studentName || '-')}</div>`);
    lines.push(`<div style="margin-top:8px;">Questões: <strong>${report.summary.questions}</strong> · Acertos: <strong>${report.summary.correct}</strong> · Erros: <strong>${report.summary.wrong}</strong> · Precisão: <strong>${report.summary.accuracy}%</strong></div>`);
    lines.push(`<div class="bar" style="margin-top:8px;"><div style="width:${report.summary.accuracy}%;"></div></div>`);
    lines.push(`<div class="tiny muted" style="margin-top:8px;">XP ganho no período: <strong>${report.summary.xpGained}</strong> · XP total: <strong>${report.summary.xpTotal}</strong> · Tempo: <strong>${report.summary.durationSec}s</strong></div>`);

    const ops = Object.keys(report.breakdown.byOperation);
    if (ops.length){
      lines.push('<hr style="margin:14px 0; opacity:.2;">');
      lines.push('<div><strong>Por operação</strong></div>');
      lines.push('<ul style="margin:8px 0 0 18px;">');
      for (const op of ops){
        const b = report.breakdown.byOperation[op];
        lines.push(`<li><strong>${escapeHtml(op)}</strong>: ${b.correct}/${b.questions} (${b.accuracy}%)</li>`);
      }
      lines.push('</ul>');
    }

    if (report.topMistakes && report.topMistakes.length){
      lines.push('<hr style="margin:14px 0; opacity:.2;">');
      lines.push('<div><strong>Erros mais frequentes (salvos)</strong></div>');
      lines.push('<ol style="margin:8px 0 0 18px;">');
      for (const [k,v] of report.topMistakes){
        lines.push(`<li>${escapeHtml(k)} <span class="muted">(${v}x)</span></li>`);
      }
      lines.push('</ol>');
    } else {
      lines.push('<div class="tiny muted" style="margin-top:10px;">Sem erros registrados neste período.</div>');
    }

    setOutput(lines.join(''));
  }

  function makeCode(report){
    const json = JSON.stringify(report);
    return 'MMR1:' + b64EncodeUnicode(json);
  }

  function parseCode(code){
    const raw = String(code||'').trim();
    if (!raw.startsWith('MMR1:')) throw new Error('Código inválido: esperado prefixo MMR1:');
    const b64 = raw.slice(5);
    const json = b64DecodeUnicode(b64);
    const obj = JSON.parse(json);
    if (!obj || obj.schemaVersion !== '1.0') throw new Error('Versão de relatório não suportada.');
    return obj;
  }

  function clearQr(){
    els.qr.innerHTML = '';
  }

  function showQr(code){
    clearQr();
    // QRCode lib (qrcode.min.js) provides global QRCode
    // Keep size reasonable
    // eslint-disable-next-line no-undef
    new QRCode(els.qr, { text: code, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.M });
  }

  
  // --- Resumo semanal (Casa → Escola) ---
  function safeJson(raw, fallback){
    try{ 
      const v = raw ? JSON.parse(raw) : fallback;
      return (v === undefined || v === null) ? fallback : v;
    }catch(_){ 
      return fallback; 
    }
  }

  function buildWeeklySummary(days=7){
    const now = Date.now();
    const since = now - days*24*60*60*1000;

    const profile = safeJson(LS.get(PROFILE_KEY), null);
    const sessions = safeJson(LS.get(SESSIONS_KEY), []);
    const errors = safeJson(LS.get(ERRORS_KEY), []);

    const weekSessions = Array.isArray(sessions) ? sessions.filter(s => (s && Number(s.ts) >= since)) : [];
    const weekErrors = Array.isArray(errors) ? errors.filter(e => (e && Number(e.ts) >= since)) : [];

    const daySet = new Set();
    let totalSec = 0, totalCorrect = 0, totalWrong = 0, totalQ = 0;

    const byOp = {};
    weekSessions.forEach(s=>{
      const ts = Number(s.ts)||0;
      const d = new Date(ts);
      if(!isNaN(d)) daySet.add(d.toISOString().slice(0,10));

      totalSec += Number(s.durationSec)||0;
      totalCorrect += Number(s.correct)||0;
      totalWrong += Number(s.wrong)||0;
      totalQ += Number(s.questions)||0;

      const op = String(s.operation||'');
      if(!byOp[op]) byOp[op] = {sessions:0, questions:0, correct:0, wrong:0, accuracy:null, avgSecPerQ:null};
      byOp[op].sessions += 1;
      byOp[op].questions += Number(s.questions)||0;
      byOp[op].correct += Number(s.correct)||0;
      byOp[op].wrong += Number(s.wrong)||0;
    });

    Object.keys(byOp).forEach(op=>{
      const q = byOp[op].questions || 0;
      const sec = weekSessions.filter(s=>String(s.operation||'')===op).reduce((a,s)=>a+(Number(s.durationSec)||0),0);
      byOp[op].avgSecPerQ = q>0 ? Math.round((sec/q)*10)/10 : null;
      byOp[op].accuracy = q>0 ? Math.round((byOp[op].correct/q)*1000)/10 : null;
    });

    const tagCount = {};
    weekErrors.forEach(e=>{
      const tag = String(e.skillTag||'').trim() || '(sem tag)';
      tagCount[tag] = (tagCount[tag]||0)+1;
    });
    const topTags = Object.entries(tagCount)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,5)
      .map(([tag,count])=>({tag,count}));

    return {
      schema: "PET_WEEKLY_SUMMARY_v1",
      generatedAt: now,
      windowDays: days,
      student: {
        name: String(profile?.name || ''),
        code: String(profile?.code || ''),
        turma: String(profile?.turma || ''),
        escola: String(profile?.escola || '')
      },
      usage: {
        activeDays: daySet.size,
        totalMinutes: Math.round(totalSec/60),
        sessions: weekSessions.length,
        questions: totalQ
      },
      performance: {
        accuracy: totalQ>0 ? Math.round((totalCorrect/totalQ)*1000)/10 : null,
        byOperation: byOp
      },
      difficulties: {
        topSkillTags: topTags
      },
      notes: "Resumo semanal gerado offline. Para validação fora do app, aplique o protocolo PET-8 (caderno)."
    };
  }

  // --- QR Casa→Escola (Resumo semanal) ---
  function b64urlEncode(str){
    // UTF-8 safe base64url
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function b64urlDecode(b64url){
    let b64 = String(b64url||'').replace(/-/g,'+').replace(/_/g,'/');
    // pad
    while (b64.length % 4) b64 += '=';
    return decodeURIComponent(escape(atob(b64)));
  }
  function shortId(s){
    // deterministic short id (not crypto)
    let h = 2166136261;
    for (let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(16).slice(0,8);
  }
  function makeWeeklyQrChunks(summaryObj, maxChunkLen=800){
    const json = JSON.stringify(summaryObj);
    const payload = b64urlEncode(json);
    const id = shortId(payload);
    const total = Math.ceil(payload.length / maxChunkLen);
    const chunks = [];
    for (let i=0;i<total;i++){
      const part = payload.slice(i*maxChunkLen, (i+1)*maxChunkLen);
      chunks.push(`PETWS1|${id}|${i+1}/${total}|${part}`);
    }
    return { id, total, chunks, json };
  }
  function renderWeeklyQr(chunksObj){
    if (!els.weeklyQrPanel || !els.weeklyQrList || !els.weeklyQrText) return;
    els.weeklyQrList.innerHTML = '';
    els.weeklyQrText.value = chunksObj.chunks.join('\n');
    for (let i=0;i<chunksObj.chunks.length;i++){
      const code = chunksObj.chunks[i];
      const card = document.createElement('div');
      card.style.border = '1px solid rgba(255,255,255,0.16)';
      card.style.borderRadius = '14px';
      card.style.padding = '10px';
      card.style.background = 'rgba(0,0,0,0.18)';
      const label = document.createElement('div');
      label.className = 'tiny muted';
      label.style.marginBottom = '6px';
      label.textContent = `QR ${i+1}/${chunksObj.total}`;
      const qr = document.createElement('div');
      qr.style.display = 'flex';
      qr.style.justifyContent = 'center';
      qr.style.alignItems = 'center';
      new QRCode(qr, { text: code, width: 170, height: 170, correctLevel: QRCode.CorrectLevel.M });
      card.appendChild(label);
      card.appendChild(qr);
      els.weeklyQrList.appendChild(card);
    }
    els.weeklyQrPanel.style.display = 'block';
  }

  function downloadJsonFile(filename, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

function init(){
    // Profile select (single for now)
    if (els.profileSelect){
      els.profileSelect.innerHTML = '<option value="app">Atual (do app)</option>';
    }

    // Load app profile into fields
    function loadIntoFields(){
      const p = readProfile();
      if (!els.inpName.value) els.inpName.value = p.name;
      if (!els.inpClass.value) els.inpClass.value = p.turma;
      if (!els.inpSchool.value) els.inpSchool.value = p.escola;
    }
    loadIntoFields();

    els.btnLoadProfile?.addEventListener('click', ()=>{ loadIntoFields(); });

    els.btnGenerate?.addEventListener('click', ()=>{
      const report = buildReport();
      renderReport(report);
      const code = makeCode(report);
      els.code.value = code;
      clearQr();
    });

    els.btnShowQr?.addEventListener('click', ()=>{
      const code = String(els.code.value||'').trim();
      if (!code) return alert('Gere o relatório primeiro.');
      showQr(code);
    });

    els.btnCopy?.addEventListener('click', async ()=>{
      const code = String(els.code.value||'').trim();
      if (!code) return alert('Nada para copiar.');
      try {
        await navigator.clipboard.writeText(code);
        alert('Código copiado ✅');
      } catch (_) {
        // fallback
        els.code.select();
        document.execCommand('copy');
        alert('Código copiado ✅');
      }
    });

    els.btnJson?.addEventListener('click', ()=>{
      const code = String(els.code.value||'').trim();
      if (!code) return alert('Gere o relatório primeiro.');
      const report = parseCode(code);
      const name = `matemagica_relatorio_${(report.studentCode||report.studentName||'estudante')}_${report.periodStart}_${report.periodEnd}.json`;
      download(name, 'application/json;charset=utf-8', JSON.stringify(report, null, 2));
    });

    els.btnCsv?.addEventListener('click', ()=>{
      const code = String(els.code.value||'').trim();
      if (!code) return alert('Gere o relatório primeiro.');
      const report = parseCode(code);
      const name = `matemagica_relatorio_${(report.studentCode||report.studentName||'estudante')}_${report.periodStart}_${report.periodEnd}.csv`;
      download(name, 'text/csv;charset=utf-8', makeCsv(report));


    els.btnWeekly?.addEventListener('click', ()=>{
      const summary = buildWeeklySummary(7);
      const safeName = (summary.student.code || summary.student.name || 'estudante').toString().trim().replace(/\s+/g,'_');
      const name = `matemagica_resumo_semanal_${safeName}.json`;
      downloadJsonFile(name, summary);
    });
    });
  
    // QR Casa→Escola (Resumo semanal)
    els.btnWeeklyQr?.addEventListener('click', ()=>{
      const summary = buildWeeklySummary(7);
      const chunksObj = makeWeeklyQrChunks(summary, 800);
      renderWeeklyQr(chunksObj);
    });
    els.btnCopyWeeklyCode?.addEventListener('click', async ()=>{
      try{
        await navigator.clipboard.writeText(String(els.weeklyQrText?.value || ''));
        alert('Código copiado. Cole no Painel do Professor.');
      }catch(_){
        // fallback
        try{
          els.weeklyQrText?.select();
          document.execCommand('copy');
          alert('Código copiado. Cole no Painel do Professor.');
        }catch(__){
          alert('Não consegui copiar automaticamente. Selecione e copie o texto.');
        }
      }
    });
    els.btnHideWeeklyQr?.addEventListener('click', ()=>{
      if (els.weeklyQrPanel) els.weeklyQrPanel.style.display = 'none';
    });
}

  init();
})();
