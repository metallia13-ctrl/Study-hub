// ═══════════════════════════════════════════════════════════════════════════
//  STUDY HUB — app.js (v12)
// ═══════════════════════════════════════════════════════════════════════════

// ── Costanti ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'multiSubjectDataV6';
const SETTINGS_KEY = 'studyhub_settings';
const COLORS = ['#7dd3fc','#34d399','#fbbf24','#f472b6','#f87171','#a78bfa'];
const DOW_SHORT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const DOW_FULL = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const TAB_ORDER = ['study','ripasso','calendar','history','notes','stats','pomodoro'];
const DAY_MS = 864e5;
const HISTORY_CAP = 300;
const TOMB_TTL = 90 * DAY_MS;
const Q_INFO = {
    ripeti:    { label:'Ripeti',         color:'var(--danger)' },
    incerto:   { label:'Incerto',        color:'var(--text-mid)' },
    consolida: { label:'Da consolidare', color:'var(--accent)' },
    buono:     { label:'Buono',          color:'var(--success-bright)' },
    reset:     { label:'Reset completo', color:'var(--exam-color)' },
    nota:      { label:'Nota',           color:'var(--warning)' },
    studio:    { label:'Studiato',       color:'var(--sub)' }
};

// ── Utility ─────────────────────────────────────────────────────────────────
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const DEVICE_ID = localStorage.getItem('studyhub_device') || (() => { const id = uid(); localStorage.setItem('studyhub_device', id); return id; })();
function escHtml(s){
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function jsArg(v){ return escHtml(JSON.stringify(String(v))); }   // argomento sicuro per onclick="fn(...)"
function r2(n){ return Math.round(n * 100) / 100; }
function norm(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function plural(n, one, many){ return `${n} ${n === 1 ? one : many}`; }

function localDateStr(dt){ return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function todayStr(){ return localDateStr(new Date()); }
function today0(){ const t = new Date(); t.setHours(0,0,0,0); return t; }
function parseLocalDate(iso){ const p = String(iso).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function fmtDate(iso){ return iso ? iso.split('-').reverse().join('/') : '—'; }
function fmtDateShort(iso){
    if (!iso) return '—';
    const d = parseLocalDate(iso);
    return `${d.getDate()} ${MONTHS_IT[d.getMonth()].slice(0,3).toLowerCase()}`;
}
function fmtDateLong(iso){
    const d = parseLocalDate(iso);
    const y = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
    return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_IT[d.getMonth()].slice(0,3).toLowerCase()}${y}`;
}
function daysFromToday(iso){ return Math.round((parseLocalDate(iso) - today0()) / DAY_MS); }
function dueLabel(iso){
    if (!iso) return { t: 'da studiare', c: 'todo' };
    const d = daysFromToday(iso);
    if (d < 0) return { t: `in ritardo ${-d}g`, c: 'late' };
    if (d === 0) return { t: 'oggi', c: 'today' };
    if (d === 1) return { t: 'domani', c: '' };
    return { t: `tra ${d}g`, c: '' };
}
function shiftDate(s, d){
    const dt = (typeof s === 'string') ? parseLocalDate(s) : new Date(s);
    dt.setDate(dt.getDate() + d);
    return localDateStr(dt);
}
function mondayOf(d){
    const x = new Date(d); x.setHours(0,0,0,0);
    const dow = x.getDay() === 0 ? 7 : x.getDay();
    x.setDate(x.getDate() - (dow - 1));
    return x;
}
// Accetta AAAA-MM-GG (input date), GG/MM/AAAA, GG/MM/AA, GG-MM-AAAA, GG.MM.AAAA
function parseDateInput(str){
    str = String(str || '').trim();
    if (!str) return null;
    let y, m, d, mt;
    if ((mt = str.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/))) {
        d = +mt[1]; m = +mt[2]; y = +mt[3]; if (mt[3].length === 2) y += 2000;
    } else if ((mt = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
        y = +mt[1]; m = +mt[2]; d = +mt[3];
    } else return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return localDateStr(dt);
}
function parseTimeInput(str){
    const mt = String(str || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
    if (!mt) return null;
    const h = +mt[1], mi = +mt[2];
    if (h > 23 || mi > 59) return null;
    return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
}

// ── Impostazioni del dispositivo (non sincronizzate) ───────────────────────
let settings = (() => {
    try { return Object.assign({ orientation:'any', archiveDays:30, loadBalance:true, dailyMax:0 }, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
    catch (_) { return { orientation:'any', archiveDays:30, loadBalance:true, dailyMax:0 }; }
})();
function saveSettings(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

// ── Dati: caricamento e normalizzazione ─────────────────────────────────────
function defaultData(){
    return { subjects:{}, isGlobal:true, activeSub:null, triage:1, activeTab:'study',
        externalEvents:[], globalView:'dayview', filterRipasso:true, filterEsterni:true,
        deleted:{}, extMod:0, lastModified:0 };
}
function normalizeData(d){
    const base = defaultData();
    if (!d || typeof d !== 'object') d = {};
    for (const k in base) if (d[k] === undefined) d[k] = base[k];
    if (!d.subjects || typeof d.subjects !== 'object') d.subjects = {};
    if (!Array.isArray(d.externalEvents)) d.externalEvents = [];
    if (!d.deleted || typeof d.deleted !== 'object') d.deleted = {};
    delete d.sessionLog;
    const fb = d.lastModified || 0;
    Object.keys(d.subjects).forEach((n, i) => {
        const s = d.subjects[n];
        if (!s || typeof s !== 'object') { delete d.subjects[n]; return; }
        if (!Array.isArray(s.topics)) s.topics = [];
        if (!s.color) s.color = COLORS[i % COLORS.length];
        if (!Array.isArray(s.todos)) s.todos = [];
        if (typeof s.notepad !== 'string') s.notepad = '';
        if (!s.sessionLog || typeof s.sessionLog !== 'object') s.sessionLog = {};
        if (!s.deletedTopics || typeof s.deletedTopics !== 'object') s.deletedTopics = {};
        if (!s.timeLog || typeof s.timeLog !== 'object') s.timeLog = {};
        if (typeof s._mod !== 'number') s._mod = fb;
        if (s.algo !== 'sm2' && s.algo !== 'fsrs') s.algo = 'fsrs';
        s.retention = [0.85, 0.9, 0.95].includes(s.retention) ? s.retention : 0.9;
        if (typeof s.examBoost !== 'boolean') s.examBoost = true;
        const seen = new Set();
        s.topics = s.topics.filter(t => t && typeof t === 'object');
        s.topics.forEach(t => {
            t.id = t.id ? String(t.id) : uid();
            if (seen.has(t.id)) t.id = uid();
            seen.add(t.id);
            t.triage = Number(t.triage) || 1;
            t.repeats = Number(t.repeats) || 0;
            t.interval = Number(t.interval) || 1;
            t.easeFactor = Number(t.easeFactor) || 2.5;
            if (typeof t.notes !== 'string') t.notes = t.notes ? String(t.notes) : '';
            if (t.status !== 'todo') { delete t.status; if (!t.next) t.next = todayStr(); } else t.next = null;
            t.parent = t.parent ? String(t.parent) : null;
            if (!Array.isArray(t.questions)) t.questions = [];
            t.questions = t.questions.map(String).filter(Boolean);
            t.seconds = Number(t.seconds) || 0;
            if (!Array.isArray(t.history)) t.history = [];
            t.archived = !!t.archived;
            t.relearn = !!t.relearn;
            if (!t.fsrs || typeof t.fsrs !== 'object' || !(t.fsrs.s > 0)) t.fsrs = null;
            if (typeof t._mod !== 'number') t._mod = s._mod;
        });
        // genitori inesistenti o anelli → argomento principale
        const ids = new Set(s.topics.map(t => t.id)), byId = {};
        s.topics.forEach(t => { byId[t.id] = t; if (t.parent && (!ids.has(t.parent) || t.parent === t.id)) t.parent = null; });
        s.topics.forEach(t => { const seen = new Set([t.id]); let p = t.parent; while (p) { if (seen.has(p)) { t.parent = null; break; } seen.add(p); p = byId[p] ? byId[p].parent : null; } });
    });
    d.externalEvents = d.externalEvents.filter(e => e && typeof e === 'object');
    d.externalEvents.forEach(e => { if (!e.id) e.id = uid(); });
    if (typeof d.extMod !== 'number') d.extMod = fb;
    d.triage = Number(d.triage) || 1;
    if (!TAB_ORDER.includes(d.activeTab)) d.activeTab = 'study';
    if (d.activeSub && !d.subjects[d.activeSub]) { d.activeSub = null; d.isGlobal = true; }
    if (!d.isGlobal && !d.activeSub) d.isGlobal = true;
    return d;
}
let _loadError = false;
function loadData(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    try { return JSON.parse(raw); }
    catch (e) {
        try { localStorage.setItem(STORAGE_KEY + '_corrupt_' + Date.now(), raw); } catch (_) {}
        _loadError = true;
        return defaultData();
    }
}
let data = normalizeData(loadData());

// Stato UI (non salvato)
let weekOffset = 0, selectedDayOffset = null, monthOffset = 0;
let dragSrc = null, agendaQuery = '', archQuery = '';
const expandedTopics = new Set();
const expandedHist = new Set();

// ── Salvataggio con timestamp per materia E per argomento ──────────────────
// Ogni save() confronta lo stato con l'ultima "firma" nota: ciò che è cambiato
// riceve _mod = adesso. Le eliminazioni lasciano una lapide (deleted / deletedTopics).
let _sig = {}, _extSig = '';
function metaSig(s){ const { topics, _mod, deletedTopics, ...rest } = s; return JSON.stringify([rest, topics.map(t => t.id)]); }
function topicSig(t){ const { _mod, ...rest } = t; return JSON.stringify(rest); }
function snapshotSigs(){
    _sig = {};
    Object.keys(data.subjects).forEach(n => {
        const s = data.subjects[n], c = { m: metaSig(s), t: {} };
        s.topics.forEach(t => { c.t[t.id] = topicSig(t); });
        _sig[n] = c;
    });
    _extSig = JSON.stringify(data.externalEvents);
}
function persist(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { showToast('⚠ Memoria piena — esporta un backup'); }
}
function save(){
    const now = Date.now();
    let changed = false;
    Object.keys(data.subjects).forEach(n => {
        const s = data.subjects[n];
        let c = _sig[n];
        if (!c) {
            c = _sig[n] = { m: metaSig(s), t: {} };
            s._mod = now;
            s.topics.forEach(t => { t._mod = now; c.t[t.id] = topicSig(t); delete s.deletedTopics[t.id]; });
            delete data.deleted[n];
            changed = true;
            return;
        }
        const ms = metaSig(s);
        if (ms !== c.m) { s._mod = now; c.m = ms; changed = true; }
        const seen = {};
        s.topics.forEach(t => {
            seen[t.id] = 1;
            const ts = topicSig(t);
            if (c.t[t.id] !== ts) { t._mod = now; c.t[t.id] = ts; delete s.deletedTopics[t.id]; changed = true; }
        });
        Object.keys(c.t).forEach(id => { if (!seen[id]) { delete c.t[id]; s.deletedTopics[id] = now; changed = true; } });
    });
    Object.keys(_sig).forEach(n => {
        if (!data.subjects[n]) { delete _sig[n]; data.deleted[n] = now; changed = true; }
    });
    const es = JSON.stringify(data.externalEvents);
    if (es !== _extSig) { _extSig = es; data.extMod = now; changed = true; }
    if (changed) { data.lastModified = now; scheduleAutoSync(); }
    persist();
}
snapshotSigs();

// ── Annulla (snapshot dell'intero stato) ────────────────────────────────────
let _undoSnap = null;
function snapshot(){ return JSON.stringify(data); }
function undoLast(){
    if (!_undoSnap) return;
    const snap = _undoSnap; _undoSnap = null;
    data = normalizeData(JSON.parse(snap));
    save();               // ciò che torna indietro riceve un _mod nuovo → vince anche in sync
    render();
    showToast('↺ Annullato');
}

// ── Toast ───────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, undoSnap){
    const x = document.getElementById('toast');
    if (!x) return;
    x.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    x.appendChild(span);
    if (undoSnap) {
        _undoSnap = undoSnap;
        const b = document.createElement('button');
        b.className = 'toast-action'; b.textContent = 'Annulla';
        b.onclick = () => { x.classList.remove('show'); undoLast(); };
        x.appendChild(b);
    }
    x.classList.remove('show'); void x.offsetWidth; x.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { x.classList.remove('show'); if (undoSnap && _undoSnap === undoSnap) _undoSnap = null; }, undoSnap ? 6000 : 3000);
}

// ── Modali ──────────────────────────────────────────────────────────────────
function openModal(id){
    const m = document.getElementById(id);
    m.classList.remove('hidden');
    const first = m.querySelector('input[type="text"],textarea');
    if (first && window.matchMedia('(hover:hover)').matches) setTimeout(() => first.focus(), 30);
}
function closeModal(id){ document.getElementById(id).classList.add('hidden'); flushPendingRender(); }
function anyModalOpen(){ return !!document.querySelector('.modal-overlay:not(.hidden)'); }
function confirmDialog(opts, onOk){
    const { title = 'Eliminare?', msg = 'Questa azione non è reversibile.', ok = 'Elimina', danger = true } = opts || {};
    const t = document.getElementById('confirmTitle');
    t.textContent = title;
    t.style.color = danger ? 'var(--danger)' : 'var(--text)';
    document.getElementById('confirmMsg').textContent = msg;
    const btn = document.getElementById('confirmOkBtn');
    btn.textContent = ok;
    btn.className = 'btn ' + (danger ? 'btn-danger-solid' : 'btn-primary');
    btn.onclick = () => { closeModal('modalConfirm'); onOk(); };
    openModal('modalConfirm');
}

// ── Render "sicuro" (non cancella ciò che stai scrivendo) ──────────────────
let _pendingRender = false;
function isTyping(){
    const a = document.activeElement;
    if (!a) return false;
    return a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox','file','button'].includes(a.type));
}
function renderWhenIdle(){
    if (isTyping() || anyModalOpen()) { _pendingRender = true; return; }
    render();
}
function flushPendingRender(){
    setTimeout(() => { if (_pendingRender && !isTyping() && !anyModalOpen()) { _pendingRender = false; render(); } }, 60);
}

// ── Tema & orientamento ─────────────────────────────────────────────────────
function applyThemeIcon(){
    const b = document.getElementById('themeBtn');
    if (b) b.textContent = document.body.classList.contains('light') ? '◐' : '○';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = document.body.classList.contains('light') ? '#f5f0e8' : '#0a0a0a';
}
function setTheme(light){
    document.body.classList.toggle('light', light);
    localStorage.setItem('studyhub_theme', light ? 'light' : 'dark');
    applyThemeIcon();
}
function toggleTheme(){ setTheme(!document.body.classList.contains('light')); if (!document.getElementById('modalSettings').classList.contains('hidden')) renderSettings(); }

async function applyOrientation(verbose){
    const o = settings.orientation, so = screen.orientation;
    if (!so) { if (verbose && o !== 'any') showToast('Orientamento non controllabile su questo dispositivo'); return; }
    try {
        if (o === 'any') { if (so.unlock) so.unlock(); return; }
        await so.lock(o === 'portrait' ? 'portrait-primary' : 'landscape');
        if (verbose) showToast(o === 'portrait' ? '✓ Bloccato in verticale' : '✓ Bloccato in orizzontale');
    } catch (e) {
        if (verbose) showToast('Il blocco funziona solo nell\'app installata (Android)');
    }
}

// ── Modalità esame ──────────────────────────────────────────────────────────
function daysToExam(s){ return s && s.examDate ? daysFromToday(s.examDate) : null; }
function isExamModeAuto(n){ const d = daysToExam(data.subjects[n]); return d !== null && d >= 0 && d <= 7; }
function isExamModeFinal(n){
    const s = data.subjects[n];
    if (!s || s.examModeOverride) return false;
    return !!s.examModeManual || isExamModeAuto(n);
}
function toggleExamMode(){
    const n = data.activeSub, s = data.subjects[n];
    if (!s) return;
    if (isExamModeFinal(n)) { s.examModeManual = false; s.examModeOverride = isExamModeAuto(n); }
    else { s.examModeOverride = false; if (!isExamModeAuto(n)) s.examModeManual = true; }
    save(); render();
}

// ── Navigazione ─────────────────────────────────────────────────────────────
function setView(view, sub = null){
    data.isGlobal = (view === 'global');
    data.activeSub = data.isGlobal ? null : sub;
    weekOffset = 0; selectedDayOffset = null; monthOffset = 0;
    archQuery = '';
    save(); render();
    window.scrollTo(0, 0);
}

function render(){
    _pendingRender = false;
    if (!data.isGlobal && !data.subjects[data.activeSub]) { data.isGlobal = true; data.activeSub = null; }
    renderTabs();
    const app = document.getElementById('appContent');
    if (data.isGlobal) renderGlobal(app); else renderMateria(app);
    updateYTDock();
}
function renderTabs(){
    const bar = document.getElementById('subjectTabs');
    bar.innerHTML = '';
    const g = document.createElement('div');
    g.className = 'subject-tab' + (data.isGlobal ? ' active' : '');
    g.textContent = 'Agenda';
    g.onclick = () => setView('global');
    bar.appendChild(g);
    Object.keys(data.subjects).forEach(name => {
        const s = data.subjects[name];
        const btn = document.createElement('div');
        const isA = !data.isGlobal && data.activeSub === name, examM = isExamModeFinal(name);
        btn.className = `subject-tab${isA ? ' active' : ''}${isA && examM ? ' exam-mode-active' : ''}`;
        btn.style.setProperty('--tab-c', examM ? 'var(--exam-color)' : s.color);
        btn.innerHTML = `<span class="tab-dot"></span>`;
        btn.appendChild(document.createTextNode(name));
        btn.title = 'Doppio clic o pressione prolungata per modificare';
        btn.onclick = () => setView('subject', name);
        btn.ondblclick = () => openEditSubjectModal(name);
        btn.oncontextmenu = e => { e.preventDefault(); openEditSubjectModal(name); };
        bar.appendChild(btn);
        if (isA) setTimeout(() => btn.scrollIntoView({ block:'nearest', inline:'nearest' }), 0);
    });
    const add = document.createElement('button');
    add.className = 'tab-add'; add.textContent = '+'; add.title = 'Nuova materia';
    add.onclick = () => openModal('modalNewSubject');
    bar.appendChild(add);
}

// ── Agenda globale ──────────────────────────────────────────────────────────
function renderGlobal(target){
    target.style.removeProperty('--sub');
    const v = data.globalView || 'dayview';
    const vb = (id, label) => `<div class="view-btn${v === id ? ' active' : ''}" onclick="setGlobalView('${id}')">${label}</div>`;
    const nDue = Object.keys(data.subjects).reduce((a, n) => a + dueTopics(data.subjects[n], n).length, 0);
    const welcome = Object.keys(data.subjects).length ? '' : `<div class="card welcome">
            <div class="modal-title" style="margin-bottom:8px;">Inizia da qui</div>
            <p class="muted" style="margin-bottom:6px;">Crea la tua prima materia con il <b>+</b> in alto, oppure guarda la guida rapida.</p>
            <div class="btn-row"><button class="btn btn-primary" onclick="openModal('modalNewSubject')">+ Crea materia</button><button class="btn btn-secondary" onclick="openTutorial()">📖 Guida</button></div>
        </div>`;
    target.innerHTML = installBannerHtml() + welcome + `
        <div class="search"><input type="search" id="agendaSearch" placeholder="Cerca impegni e argomenti (anche archiviati)…" value="${escHtml(agendaQuery)}" oninput="onAgendaSearch(this.value)"></div>
        <div id="agendaControls">
            <div class="view-toggle">${vb('today','Oggi')}${vb('mixed', `Ripasso${nDue ? ` (${nDue})` : ''}`)}${vb('dayview','Giorno')}${vb('week','Settimana')}${vb('month','Mese')}</div>
            <div class="filter-bar${v === 'mixed' ? ' hidden' : ''}">
                <div class="filter-chip${data.filterRipasso ? ' on' : ''}" data-f="ripasso" onclick="toggleFilter('ripasso')">● Ripassi</div>
                <div class="filter-chip${data.filterEsterni ? ' on' : ''}" data-f="esterni" onclick="toggleFilter('esterni')">● Impegni</div>
                <div style="margin-left:auto;"><button class="btn btn-secondary btn-icon" onclick="openAddEvent()">+ Impegno</button></div>
            </div>
        </div>
        <div id="mainCalendarArea"></div>
        <div id="coldSpotsSection"></div>`;
    renderMainCalendar();
    renderColdSpots();
}
function setGlobalView(v){
    data.globalView = v; weekOffset = 0; selectedDayOffset = null; monthOffset = 0;
    save(); renderGlobal(document.getElementById('appContent'));
}
function toggleFilter(f){
    if (f === 'ripasso') data.filterRipasso = !data.filterRipasso; else data.filterEsterni = !data.filterEsterni;
    save(); renderMainCalendar();
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('on', c.dataset.f === 'ripasso' ? data.filterRipasso : data.filterEsterni));
}
function onAgendaSearch(v){ agendaQuery = v; renderMainCalendar(); }
function renderMainCalendar(){
    const area = document.getElementById('mainCalendarArea');
    if (!area) return;
    const ctr = document.getElementById('agendaControls');
    const searching = agendaQuery.trim().length > 0;
    if (ctr) ctr.classList.toggle('hidden', searching);
    const cold = document.getElementById('coldSpotsSection');
    if (cold) cold.classList.toggle('hidden', searching || data.globalView === 'mixed');
    if (searching) return renderSearchResults(area);
    if (data.globalView === 'mixed') renderMixedReview(area);
    else if (data.globalView === 'today') renderTodayWidget(area);
    else if (data.globalView === 'dayview') renderDayView(area);
    else if (data.globalView === 'week') renderWeekList(area);
    else renderMonthView(area);
}

// ── Impegni archiviati: restano salvati, si vedono solo con la ricerca ─────
function archiveCutoff(){ return settings.archiveDays > 0 ? shiftDate(todayStr(), -settings.archiveDays) : null; }
function isEventArchived(e){ const c = archiveCutoff(); return !!c && e.date < c; }

// ── Eventi del calendario ───────────────────────────────────────────────────
function topicColor(t, sub){ return t.triage === 3 ? 'var(--danger)' : (t.triage === 2 ? 'var(--warning)' : sub.color); }
function getEventsForDate(dStr){
    const events = [];
    if (data.filterRipasso) {
        Object.keys(data.subjects).forEach(s => {
            const sub = data.subjects[s], examM = isExamModeFinal(s);
            sub.topics.forEach(t => {
                if (t.next !== dStr || (examM && t.triage !== 3)) return;
                events.push({ type:'ripasso', id:t.id, name:t.name, subject:s, color:topicColor(t, sub), time:null });
            });
        });
    }
    if (data.filterEsterni) {
        data.externalEvents.forEach(e => {
            if (e.date === dStr && !isEventArchived(e))
                events.push({ type:'external', id:e.id, name:e.title, color:'var(--warning)', time:e.time || null, endTime:e.endTime || null });
        });
    }
    events.sort((a, b) => (a.time && b.time) ? a.time.localeCompare(b.time) : a.time ? -1 : b.time ? 1 : 0);
    return events;
}
function eventCardHtml(e, extra = ''){
    const click = e.type === 'external'
        ? `onclick="openEventEdit(${jsArg(e.id)})" title="Modifica"`
        : `onclick="goToTopic(${jsArg(e.subject)},${jsArg(e.id)})" title="Apri in archivio"`;
    return `<div class="topic-card" style="border-left-color:${e.color};" ${click}>
        ${e.time ? `<span class="topic-time">${e.time}${e.endTime ? ' – ' + e.endTime : ''}</span>` : ''}
        <span class="topic-name" style="color:${e.color}">${escHtml(e.name)}${extra}</span>
        ${e.subject ? `<span class="subject-label">${escHtml(e.subject)}</span>` : ''}
    </div>`;
}
function renderEventCards(dStr, emptyText = 'Nessuna attività'){
    const events = getEventsForDate(dStr);
    return events.length ? events.map(e => eventCardHtml(e)).join('') : `<div class="gcal-no-events">${emptyText}</div>`;
}
function goToTopic(subName, id){
    const sub = data.subjects[subName];
    if (!sub) return;
    const t = sub.topics.find(x => x.id === id);
    data.isGlobal = false; data.activeSub = subName; data.activeTab = 'history';
    weekOffset = 0; selectedDayOffset = null; monthOffset = 0;
    archQuery = t && t.archived ? t.name : '';
    if (t) expandedTopics.add(t.id);
    save(); render();
    openTopicInArchive(id);
}

// ── Ricerca globale ─────────────────────────────────────────────────────────
function topicMatches(t, q){
    return norm(t.name).includes(q) || norm(t.notes).includes(q) || t.history.some(h => norm(h.note).includes(q));
}
function renderSearchResults(area){
    const q = norm(agendaQuery.trim());
    const evs = data.externalEvents.filter(e => norm(e.title).includes(q)).sort((a, b) => b.date.localeCompare(a.date));
    const tps = [];
    Object.keys(data.subjects).forEach(s => data.subjects[s].topics.forEach(t => { if (topicMatches(t, q)) tps.push({ s, t }); }));
    const evHtml = evs.map(e => eventCardHtml(
        { type:'external', id:e.id, name:e.title, color:'var(--warning)', time:e.time ? `${fmtDateLong(e.date)} · ${e.time}` : fmtDateLong(e.date), endTime:e.endTime },
        isEventArchived(e) ? '<span class="badge">archiviato</span>' : '')).join('');
    const tpHtml = tps.map(({ s, t }) => eventCardHtml(
        { type:'ripasso', id:t.id, name:t.name, subject:`${s}${breadcrumb(t, data.subjects[s]) ? ' › ' + breadcrumb(t, data.subjects[s]) : ''} · ${isTodo(t) ? 'da studiare' : 'prossimo ' + fmtDateShort(t.next)}`, color:topicColor(t, data.subjects[s]), time:null },
        t.archived ? '<span class="badge">archiviato</span>' : '')).join('');
    area.innerHTML = (!evs.length && !tps.length)
        ? `<div class="card empty">Nessun risultato per “${escHtml(agendaQuery.trim())}”</div>`
        : `${evs.length ? `<div class="card result-group"><div class="section-label">Impegni <span>${evs.length}</span></div>${evHtml}</div>` : ''}
           ${tps.length ? `<div class="card result-group"><div class="section-label">Argomenti <span>${tps.length}</span></div>${tpHtml}</div>` : ''}`;
}

// ── Vista Oggi ──────────────────────────────────────────────────────────────
function renderTodayWidget(area){
    const now = new Date();
    area.innerHTML = `<div class="card">
        <div class="gcal-date-header" style="font-size:1.2rem;color:var(--text);">${DOW_FULL[now.getDay()]} ${now.getDate()} ${MONTHS_IT[now.getMonth()].toLowerCase()}</div>
        ${renderEventCards(todayStr(), 'Nessuna attività per oggi 🎉')}
    </div>`;
}

// ── Vista Giorno ────────────────────────────────────────────────────────────
let _selectedDate = null;
function renderDayView(area){
    const today = today0();
    const monday = mondayOf(today); monday.setDate(monday.getDate() + weekOffset * 7);
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); days.push(d); }
    const todayISO = localDateStr(today);
    let selIdx = selectedDayOffset;
    if (selIdx === null) selIdx = weekOffset === 0 ? days.findIndex(d => localDateStr(d) === todayISO) : 0;
    selIdx = Math.max(0, Math.min(6, selIdx));
    const selDay = days[selIdx], selStr = localDateStr(selDay);
    _selectedDate = selStr;
    area.innerHTML = `<div class="gcal-wrapper">
        <div class="gcal-nav">
            <div class="gcal-arrow" onclick="changeDayWeek(-1)">❮</div>
            <div class="gcal-nav-label">${MONTHS_IT[selDay.getMonth()]} ${selDay.getFullYear()}</div>
            <div class="gcal-arrow" onclick="changeDayWeek(1)">❯</div>
        </div>
        <div class="gcal-weekstrip">
            ${days.map((d, i) => {
                const dStr = localDateStr(d);
                const dots = getEventsForDate(dStr).slice(0, 4).map(e => `<div class="gcal-dot" style="background:${e.color}"></div>`).join('');
                return `<div class="gcal-day-btn${i === selIdx ? ' selected' : ''}${dStr === todayISO ? ' today-marker' : ''}" onclick="selectDay(${i})">
                    <span class="dow">${DOW_SHORT[d.getDay()]}</span><div class="dom">${d.getDate()}</div><div class="dot-row">${dots}</div>
                </div>`;
            }).join('')}
        </div>
        <div class="gcal-day-events">
            <div class="gcal-date-header">${DOW_FULL[selDay.getDay()]} ${selDay.getDate()} ${MONTHS_IT[selDay.getMonth()].toLowerCase()}</div>
            ${renderEventCards(selStr)}
        </div>
    </div>`;
}
function changeDayWeek(dir){ weekOffset += dir; selectedDayOffset = null; renderMainCalendar(); }
function selectDay(idx){ selectedDayOffset = idx; renderMainCalendar(); }

// ── Vista Settimana ─────────────────────────────────────────────────────────
function weekSectionsHtml(monday, dayContentFn){
    const todayISO = todayStr();
    let html = '';
    for (let i = 0; i < 7; i++) {
        const day = new Date(monday); day.setDate(monday.getDate() + i);
        const dStr = localDateStr(day);
        html += `<div class="day-section"><div class="day-title${dStr === todayISO ? ' today' : ''}">
            <span>${day.getDate()} ${MONTHS_IT[day.getMonth()].slice(0,3).toLowerCase()}</span>
            <span style="font-size:.7rem;opacity:.55;">${DOW_FULL[day.getDay()]}</span>
        </div>${dayContentFn(dStr) || '<p class="gcal-no-events">nessuna attività</p>'}</div>`;
    }
    return html;
}
function renderWeekList(area){
    const monday = mondayOf(new Date()); monday.setDate(monday.getDate() + weekOffset * 7);
    area.innerHTML = `<div class="gcal-wrapper"><div class="gcal-nav">
        <div class="gcal-arrow" onclick="changeWeekList(-1)">❮</div>
        <div class="gcal-nav-label">Settimana dal ${monday.getDate()}/${monday.getMonth() + 1}</div>
        <div class="gcal-arrow" onclick="changeWeekList(1)">❯</div>
    </div><div style="padding:14px 16px;">${weekSectionsHtml(monday, d => getEventsForDate(d).map(e => eventCardHtml(e)).join(''))}</div></div>`;
}
function changeWeekList(dir){ weekOffset += dir; renderMainCalendar(); }

// ── Vista Mese ──────────────────────────────────────────────────────────────
function renderMonthView(area){
    const today = today0();
    const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = base.getFullYear(), month = base.getMonth(), todayISO = localDateStr(today);
    const firstDow = base.getDay() === 0 ? 7 : base.getDay(), dim = new Date(year, month + 1, 0).getDate();
    let cells = '';
    for (let i = 1; i < firstDow; i++) cells += monthCell(new Date(year, month, 1 - (firstDow - i)), todayISO, true);
    for (let d = 1; d <= dim; d++) cells += monthCell(new Date(year, month, d), todayISO, false);
    const total = (firstDow - 1) + dim, rem = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let i = 1; i <= rem; i++) cells += monthCell(new Date(year, month + 1, i), todayISO, true);
    area.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div class="gcal-arrow" onclick="changeMonth(-1)">❮</div>
        <div class="gcal-nav-label">${MONTHS_IT[month]} ${year}</div>
        <div class="gcal-arrow" onclick="changeMonth(1)">❯</div>
    </div>
    <div class="month-dow-header">${['L','M','M','G','V','S','D'].map(d => `<div class="month-dow-label">${d}</div>`).join('')}</div>
    <div class="month-grid">${cells}</div></div>`;
}
function monthCell(date, todayISO, other){
    const dStr = localDateStr(date), events = getEventsForDate(dStr);
    const pills = events.slice(0, 3).map(e => `<div class="month-event-pill" style="background:${e.color}">${escHtml(e.time ? `${e.time} ${e.name}` : e.name)}</div>`).join('');
    const extra = events.length > 3 ? `<div style="font-size:.55rem;color:var(--text-dim);text-align:center;">+${events.length - 3}</div>` : '';
    return `<div class="month-cell${other ? ' other-month' : ''}${dStr === todayISO ? ' today-cell' : ''}" onclick="openDayFromDate('${dStr}')"><div class="month-cell-num">${date.getDate()}</div>${pills}${extra}</div>`;
}
function changeMonth(dir){ monthOffset += dir; renderMainCalendar(); }
function openDayFromDate(dStr){
    const target = parseLocalDate(dStr);
    weekOffset = Math.round((mondayOf(target) - mondayOf(new Date())) / (7 * DAY_MS));
    selectedDayOffset = (target.getDay() === 0 ? 7 : target.getDay()) - 1;
    data.globalView = 'dayview';
    save(); renderGlobal(document.getElementById('appContent'));
}

// ── Criticità ───────────────────────────────────────────────────────────────
function renderColdSpots(){
    const sec = document.getElementById('coldSpotsSection');
    if (!sec) return;
    const spots = [];
    Object.keys(data.subjects).forEach(s => data.subjects[s].topics.forEach(t => { if (t.repeats >= 2) spots.push({ t, s }); }));
    spots.sort((a, b) => b.t.repeats - a.t.repeats);
    sec.innerHTML = spots.length ? `<div class="cold-card"><div class="cold-title">⚠ Criticità rilevate</div>${spots.slice(0, 12).map(x => `
        <div class="cold-item" onclick="goToTopic(${jsArg(x.s)},${jsArg(x.t.id)})">
            <span>${escHtml(x.t.name)} <span style="opacity:.45;font-size:.7rem;">· ${escHtml(x.s)}</span></span>
            <span class="mono" style="color:var(--danger);font-size:.75rem;">${x.t.repeats}✕</span>
        </div>`).join('')}</div>` : '';
}

// ── Impegni: aggiungi / modifica / elimina ─────────────────────────────────
let _editingEventId = null;
function openAddEvent(){
    _editingEventId = null;
    document.getElementById('extModalTitle').textContent = 'Nuovo impegno';
    document.getElementById('extDeleteBtn').classList.add('hidden');
    document.getElementById('extTitle').value = '';
    document.getElementById('extDate').value = (data.globalView === 'dayview' && _selectedDate) ? _selectedDate : todayStr();
    document.getElementById('extTime').value = '';
    document.getElementById('extEndTime').value = '';
    openModal('modalExt');
}
function openEventEdit(id){
    const ev = data.externalEvents.find(e => e.id === id);
    if (!ev) return;
    _editingEventId = id;
    document.getElementById('extModalTitle').textContent = 'Modifica impegno';
    document.getElementById('extDeleteBtn').classList.remove('hidden');
    document.getElementById('extTitle').value = ev.title;
    document.getElementById('extDate').value = ev.date;
    document.getElementById('extTime').value = ev.time || '';
    document.getElementById('extEndTime').value = ev.endTime || '';
    openModal('modalExt');
}
function saveExternalEvent(){
    const title = document.getElementById('extTitle').value.trim();
    const iso = parseDateInput(document.getElementById('extDate').value);
    const time = document.getElementById('extTime').value || null;
    const endTime = document.getElementById('extEndTime').value || null;
    if (!title) { showToast('⚠ Inserisci una descrizione'); return; }
    if (!iso) { showToast('⚠ Scegli una data valida'); return; }
    if (time && endTime && endTime <= time) { showToast('⚠ L\'ora di fine è prima dell\'inizio'); return; }
    if (_editingEventId) {
        const ev = data.externalEvents.find(e => e.id === _editingEventId);
        if (ev) Object.assign(ev, { title, date: iso, time, endTime });
    } else data.externalEvents.push({ id: uid(), title, date: iso, time, endTime });
    save(); closeModal('modalExt'); render();
    showToast(_editingEventId ? '✓ Impegno aggiornato' : '✓ Impegno aggiunto');
    _editingEventId = null;
}
function deleteEditingEvent(){
    const ev = data.externalEvents.find(e => e.id === _editingEventId);
    if (!ev) return;
    closeModal('modalExt');
    confirmDialog({ title:'Eliminare impegno?', msg:`“${ev.title}” del ${fmtDate(ev.date)}${ev.time ? ' alle ' + ev.time : ''}.` }, () => {
        const snap = snapshot();
        data.externalEvents = data.externalEvents.filter(e => e.id !== ev.id);
        _editingEventId = null;
        save(); render(); showToast('✓ Impegno eliminato', snap);
    });
}

// ── Materia ─────────────────────────────────────────────────────────────────
function dueTopics(sub, subName){
    const today = todayStr();
    let due = sub.topics.filter(t => !isTodo(t) && t.next && t.next <= today);
    if (isExamModeFinal(subName)) due = due.filter(t => t.triage === 3);
    // "Ripeti" manda la carta in fondo alla coda (in ordine di quando l'hai ripetuta)
    const rq = t => (t.requeueAt && localDateStr(new Date(t.requeueAt)) === today) ? t.requeueAt : 0;
    return due.map((t, i) => ({ t, i, r: rq(t) }))
        .sort((a, b) => (a.r - b.r) || (a.i - b.i))
        .map(x => x.t);
}
function renderMateria(app){
    const name = data.activeSub, sub = data.subjects[name];
    if (!sub) { data.isGlobal = true; renderGlobal(app); return; }
    app.style.setProperty('--sub', sub.color);
    const examM = isExamModeFinal(name), diff = daysToExam(sub);
    const dueN = dueTopics(sub, name).length, cov = coverage(sub);
    let cd;
    if (diff === null) cd = `<button class="countdown empty-cd" onclick="openExamDateModal()">Imposta data esame</button>`;
    else if (diff > 0) cd = `<button class="countdown" onclick="openExamDateModal()" title="${fmtDate(sub.examDate)}"><b>${diff}</b><span>${diff === 1 ? 'giorno' : 'giorni'}<br>all'esame</span></button>`;
    else cd = `<button class="countdown" onclick="openExamDateModal()"><span style="font-size:.7rem;">${diff === 0 ? 'Esame oggi' : 'Esame passato · ' + fmtDateShort(sub.examDate)}</span></button>`;
    const nav = (id, label, badge) => `<div class="subnav-item" id="nav-${id}" onclick="setSubTab('${id}')">${label}${badge ? `<span class="subnav-badge">${badge}</span>` : ''}</div>`;
    app.innerHTML = `
        <section class="hero${examM ? ' exam-mode' : ''}">
            <div class="hero-kicker"></div>
            <div class="hero-row"><h1 class="hero-title">${escHtml(name)}</h1>${cd}</div>
            <div class="hero-chips">
                <button class="chip" onclick="setSubTab('ripasso')"><span class="n">${dueN}</span> da ripassare</button>
                <button class="chip exam${examM ? ' on' : ''}" onclick="toggleExamMode()">● Modalità esame${examM ? ' attiva' : ''}</button>
                ${cov.todo ? `<button class="chip" onclick="setSubTab('study')"><span class="n">${Math.round(cov.done / cov.total * 100)}%</span> programma</button>` : ''}
                <button class="chip warn" onclick="applyImprevisto()">⚠ Imprevisto +1g</button>
                <button class="chip" onclick="openEditSubjectModal(${jsArg(name)})" title="Impostazioni materia">⚙ ${algoLabel(sub)}</button>
            </div>
            ${examM ? `<div class="exam-note">Modalità esame: ripassi e archivio mostrano solo gli argomenti con priorità ESAME.</div>` : ''}
        </section>
        <nav class="subnav">
            ${nav('study','Studio')}${nav('ripasso','Ripasso', dueN)}${nav('calendar','Agenda')}${nav('history','Archivio')}${nav('notes','Note')}${nav('stats','Stat')}${nav('pomodoro','⏱ Timer')}
        </nav>
        <div id="tabContent"></div>`;
    initTabSwipe();
    setSubTab(data.activeTab || 'study');
}
function updateDueBadges(){
    const sub = data.subjects[data.activeSub];
    if (!sub) return;
    const n = dueTopics(sub, data.activeSub).length;
    const chipN = document.querySelector('.hero-chips .chip .n');
    if (chipN) chipN.textContent = n;
    const nav = document.getElementById('nav-ripasso');
    if (nav) nav.innerHTML = 'Ripasso' + (n ? `<span class="subnav-badge">${n}</span>` : '');
}

function setSubTab(type){
    if (!TAB_ORDER.includes(type)) type = 'study';
    data.activeTab = type;
    const sub = data.subjects[data.activeSub];
    const target = document.getElementById('tabContent');
    if (!target || !sub) return;
    document.querySelectorAll('.subnav-item').forEach(i => i.classList.toggle('active', i.id === `nav-${type}`));
    const navItem = document.getElementById(`nav-${type}`);
    if (navItem) navItem.scrollIntoView({ block:'nearest', inline:'nearest' });

    if (type === 'study') renderStudyTab(target);
    else if (type === 'ripasso') renderRipassoTab(target, sub);
    else if (type === 'calendar') {
        target.innerHTML = `<div class="gcal-wrapper">
            <div class="gcal-nav">
                <div class="gcal-arrow" onclick="changeSubWeek(-1)">❮</div>
                <div class="gcal-nav-label" id="subWeekDisplay">—</div>
                <div class="gcal-arrow" onclick="changeSubWeek(1)">❯</div>
            </div>
            <div id="subAgendaWeekly" style="padding:14px 16px;"></div>
        </div>`;
        renderSubWeek();
    }
    else if (type === 'history') renderHistoryTab(target, sub);
    else if (type === 'notes') renderNotesTab(target, sub);
    else if (type === 'stats') renderStats(target, sub);
    else if (type === 'pomodoro') {
        target.innerHTML = `<div class="card" style="padding:26px 18px;"><div id="pomoInner">${renderPomodoro()}</div></div>`;
        if (ytPlaylistUrl && ytMode !== 'app') ensureYTPlayer(false);
    }
    updateYTDock();
}
function refreshTab(){
    const y = window.scrollY;
    setSubTab(data.activeTab);
    updateDueBadges();
    window.scrollTo(0, y);
}

// ── Studio ──────────────────────────────────────────────────────────────────
// ── Struttura ad albero, programma, "da studiare" ──────────────────────────
function isTodo(t){ return t.status === 'todo'; }
function locateTopic(id, subName){
    if (subName && data.subjects[subName]) {
        const t = data.subjects[subName].topics.find(x => x.id === id);
        if (t) return { t, sub: data.subjects[subName], name: subName };
    }
    const act = data.subjects[data.activeSub];
    if (act) { const t = act.topics.find(x => x.id === id); if (t) return { t, sub: act, name: data.activeSub }; }
    for (const n of Object.keys(data.subjects)) {
        const t = data.subjects[n].topics.find(x => x.id === id);
        if (t) return { t, sub: data.subjects[n], name: n };
    }
    return null;
}
function treeOrder(sub, pool){
    pool = pool || sub.topics;
    const ids = new Set(pool.map(t => t.id)), kids = {};
    pool.forEach(t => { const p = t.parent && ids.has(t.parent) && t.parent !== t.id ? t.parent : ''; (kids[p] = kids[p] || []).push(t); });
    const out = [], seen = new Set();
    const walk = (p, depth) => (kids[p] || []).forEach(t => { if (seen.has(t.id)) return; seen.add(t.id); out.push({ t, depth }); walk(t.id, depth + 1); });
    walk('', 0);
    pool.forEach(t => { if (!seen.has(t.id)) { seen.add(t.id); out.push({ t, depth: 0 }); walk(t.id, 1); } }); // anelli da sync: mai perdere argomenti
    return out;
}
function childCounts(pool){
    const ids = new Set(pool.map(t => t.id)), c = {};
    pool.forEach(t => { if (t.parent && ids.has(t.parent)) c[t.parent] = (c[t.parent] || 0) + 1; });
    return c;
}
function descendantsOf(sub, id){
    const out = new Set(), stack = [id];
    while (stack.length) { const cur = stack.pop(); sub.topics.forEach(t => { if (t.parent === cur && !out.has(t.id)) { out.add(t.id); stack.push(t.id); } }); }
    return out;
}
function breadcrumb(t, sub){
    const names = [], seen = new Set();
    let p = t.parent;
    while (p && !seen.has(p)) { seen.add(p); const pt = sub.topics.find(x => x.id === p); if (!pt) break; names.unshift(pt.name); p = pt.parent; }
    return names.join(' › ');
}
function topicOptionsHtml(sub, exclude, selected){
    return treeOrder(sub).filter(x => !(exclude && exclude.has(x.t.id)))
        .map(x => `<option value="${escHtml(x.t.id)}"${x.t.id === selected ? ' selected' : ''}>${'\u00a0\u00a0\u00a0'.repeat(x.depth)}${x.depth ? '└ ' : ''}${escHtml(x.t.name)}</option>`).join('');
}
function coverage(sub){
    const total = sub.topics.length, todo = sub.topics.filter(isTodo).length;
    return { total, todo, done: total - todo };
}

// ── Studio ──────────────────────────────────────────────────────────────────
function triageBoxHtml(active, handler){
    const dot = (n, label, bg, fg) => `<div class="t-dot ${active === n ? 'active' : ''}" style="background:${bg};color:${fg}" onclick="${handler(n)}">${label}</div>`;
    return `<div class="triage-box">${dot(1,'Base','var(--success)','#000')}${dot(2,'Complesso','var(--warning)','#000')}${dot(3,'Esame','var(--danger)','#fff')}</div>`;
}
function renderStudyTab(target){
    const sub = data.subjects[data.activeSub];
    target.innerHTML = `<div class="card">
        <div class="section-label">Nuovo argomento studiato</div>
        <div id="studyTriage">${triageBoxHtml(data.triage, n => `setTriage(${n})`)}</div>
        <input type="text" id="inT" placeholder="Nome argomento" onkeydown="if(event.key==='Enter')addTopic()">
        ${sub.topics.length ? `<div class="field-lbl">Dentro a (facoltativo)</div>
        <select class="styled-select" id="inParent"><option value="">— Argomento principale —</option>${topicOptionsHtml(sub, null, '')}</select>` : ''}
        <textarea id="inQ" placeholder="Domande d'esame, una per riga (facoltative)…" style="min-height:60px;"></textarea>
        <textarea id="inN" placeholder="Note / risposte (facoltative)…"></textarea>
        <button class="btn btn-primary" onclick="addTopic()">Pianifica — primo ripasso domani</button>
    </div>
    ${programCardHtml(sub)}`;
}
function setTriage(n){
    data.triage = n;
    const box = document.getElementById('studyTriage');
    if (box) box.innerHTML = triageBoxHtml(n, k => `setTriage(${k})`);
    save();
}
function newTopic(name, notes, next, triage, parent, questions){
    return { id: uid(), name, notes: notes || '', next, interval: 1, easeFactor: 2.5, triage: triage || 1,
             repeats: 0, history: [], archived: false, created: todayStr(), fsrs: null, relearn: false,
             parent: parent || null, questions: questions || [], seconds: 0 };
}
function parseQuestions(text){ return String(text || '').split('\n').map(s => s.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim()).filter(Boolean); }
function addTopic(){
    const sub = data.subjects[data.activeSub];
    const inT = document.getElementById('inT'), inN = document.getElementById('inN'), inQ = document.getElementById('inQ'), inP = document.getElementById('inParent');
    const name = inT.value.trim();
    if (!name) { inT.focus(); return; }
    const parent = inP && inP.value ? inP.value : null;
    const qs = parseQuestions(inQ.value);
    const existing = sub.topics.find(t => isTodo(t) && norm(t.name) === norm(name) && (!parent || t.parent === parent));
    if (existing) {                                   // era nel programma: lo segna come studiato
        if (inN.value.trim()) existing.notes = existing.notes ? existing.notes + '\n' + inN.value : inN.value;
        if (qs.length) existing.questions = existing.questions.concat(qs);
        inT.value = ''; inN.value = ''; inQ.value = '';
        markStudied(existing.id);
        return;
    }
    sub.topics.push(newTopic(name, inN.value, shiftDate(todayStr(), 1), data.triage, parent, qs));
    save();
    inT.value = ''; inN.value = ''; inQ.value = '';
    refreshTab();
    showToast('✓ Registrato — ripasso domani');
}
function markStudied(id){
    const loc = locateTopic(id);
    if (!loc) return;
    const t = loc.t, snap = snapshot();
    delete t.status;
    t.next = shiftDate(todayStr(), 1); t.interval = 1; t.relearn = false; t.fsrs = null;
    t.studiedOn = todayStr();
    pushHistory(t, { d: todayStr(), ts: Date.now(), q: 'studio' });
    save(); refreshCurrent();
    showToast(`✓ “${t.name}” studiato — ripasso domani`, snap);
}
function refreshCurrent(){
    const y = window.scrollY;
    if (data.isGlobal) renderMainCalendar();
    else if (data.activeTab === 'history') { renderArchList(); updateDueBadges(); }
    else refreshTab();
    window.scrollTo(0, y);
}
function programCardHtml(sub){
    const c = coverage(sub), pct = c.total ? Math.round(c.done / c.total * 100) : 0;
    const ex = daysToExam(sub);
    let plan = '';
    if (c.todo && ex !== null && ex > 0) {
        const buf = ex > 7 ? 3 : ex > 3 ? 1 : 0, days = Math.max(1, ex - buf), per = Math.ceil(c.todo / days);
        plan = `Per finire ${buf ? `${buf} ${buf === 1 ? 'giorno' : 'giorni'} prima dell'esame` : "entro l'esame"}: <b style="color:var(--text);">${plural(per, 'argomento', 'argomenti')} al giorno</b>.`;
    } else if (c.todo && ex === null) plan = "Imposta la data d'esame per calcolare il ritmo giornaliero.";
    const todoRows = treeOrder(sub).filter(x => isTodo(x.t));
    const shown = todoRows.slice(0, 40);
    const list = shown.map(({ t }) => {
        const cr = breadcrumb(t, sub);
        return `<div class="todo-topic"><span>${cr ? `<span class="crumb" style="display:block;margin:0;">${escHtml(cr)}</span>` : ''}${escHtml(t.name)}</span>
            <button class="chip" onclick="markStudied(${jsArg(t.id)})">✓ Studiato</button></div>`;
    }).join('');
    return `<div class="card">
        <div class="section-label">Programma d'esame <span class="link-action" onclick="openProgramModal()">+ Incolla programma</span></div>
        ${c.total ? `<div class="progress-label"><span>Copertura</span><span>${c.done}/${c.total} · ${pct}%</span></div>
        <div class="progress-bar-bg" style="height:4px;margin-bottom:12px;"><div class="progress-bar-fill" style="width:${pct}%;background:var(--sub)"></div></div>` : ''}
        ${plan ? `<p class="muted" style="margin-bottom:10px;">${plan}</p>` : ''}
        ${c.todo ? `<div class="field-lbl" style="margin:6px 0 2px;">Da studiare (${c.todo})</div>${list}${todoRows.length > shown.length ? `<div class="muted" style="padding-top:8px;">…e altri ${todoRows.length - shown.length}: li trovi in Archivio</div>` : ''}`
                 : `<p class="muted">${c.total ? '✓ Tutto il programma è stato studiato.' : "Incolla l'elenco degli argomenti del programma: diventano «da studiare» e qui vedi quanto ti manca e quanti farne al giorno."}</p>`}
    </div>`;
}
function openProgramModal(){
    const sub = data.subjects[data.activeSub];
    document.getElementById('programParent').innerHTML = `<option value="">— Argomenti principali —</option>${topicOptionsHtml(sub, null, '')}`;
    openModal('modalProgram');
}
function parseProgram(text){
    const out = [];
    String(text).replace(/\r/g, '').split('\n').forEach(raw => {
        if (!raw.trim()) return;
        const lead = raw.match(/^[\t ]*/)[0];
        let indent = 0;
        for (const ch of lead) indent += ch === '\t' ? 2 : 1;
        let level = Math.floor(indent / 2), s = raw.trim(), m;
        if ((m = s.match(/^((?:\d+[.)])+\d*)\s+/))) {
            const parts = m[1].split(/[.)]/).filter(Boolean);
            level = Math.max(level, parts.length - 1);
            s = s.slice(m[0].length);
        } else if ((m = s.match(/^([-*•·–]+)\s*/))) {
            level = level + m[1].length - 1;
            s = s.slice(m[0].length);
        }
        s = s.trim();
        if (s) out.push({ level, name: s });
    });
    let prev = -1;
    out.forEach(x => { if (x.level > prev + 1) x.level = prev + 1; prev = x.level; });
    return out;
}
function importProgram(){
    const sub = data.subjects[data.activeSub];
    const items = parseProgram(document.getElementById('programRaw').value);
    if (!items.length) { showToast('⚠ Nessun argomento trovato'); return; }
    const root = document.getElementById('programParent').value || null;
    const snap = snapshot(), stack = [];
    let added = 0, dup = 0;
    items.forEach(it => {
        const parent = it.level === 0 ? root : (stack[it.level - 1] || root);
        let t = sub.topics.find(x => norm(x.name) === norm(it.name) && (x.parent || null) === (parent || null));
        if (t) dup++;
        else { t = newTopic(it.name, '', null, 1, parent); t.status = 'todo'; sub.topics.push(t); added++; }
        stack[it.level] = t.id; stack.length = it.level + 1;
    });
    save(); closeModal('modalProgram');
    document.getElementById('programRaw').value = '';
    refreshTab();
    showToast(`✓ ${plural(added, 'argomento aggiunto', 'argomenti aggiunti')}${dup ? ` · ${dup} già presenti` : ''}`, snap);
}

// ── Algoritmi di ripasso: FSRS e Anki classico (SM-2), selezionabili per materia ──
// I bottoni corrispondono a quelli di Anki: Ripeti = Again, Incerto = Hard,
// Da consolidare = Good, Buono = Easy. Entrambi i modelli vengono aggiornati
// a ogni valutazione, così puoi cambiare algoritmo in qualsiasi momento.
const GRADE = { ripeti:1, incerto:2, consolida:3, buono:4 };
const MAX_IVL = 36500;
// Parametri predefiniti FSRS-5 (gli stessi di Anki senza ottimizzazione)
const FSRS_W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
                1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const F_DECAY = -0.5, F_FACTOR = 19 / 81;

function daysBetween(a, b){ return Math.round((parseLocalDate(b) - parseLocalDate(a)) / DAY_MS); }

// Fuzz come Anki: piccola variazione casuale (ma stabile per quel ripasso) per non ammassare i ripassi
function fuzzFactor(t){
    let h = 2166136261;
    for (const c of `${t.id}:${t.history.length}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    let a = (h + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
function fuzzDelta(iv){
    if (iv < 2.5) return 0;
    return 1 + 0.15 * Math.max(0, Math.min(iv, 7) - 2.5) + 0.1 * Math.max(0, Math.min(iv, 20) - 7) + 0.05 * Math.max(0, iv - 20);
}
function constrainIvl(iv, min, ff){
    iv = Math.min(iv, MAX_IVL);
    min = Math.max(1, Math.min(Math.round(min), MAX_IVL));
    const d = fuzzDelta(iv);
    if (!d) return Math.max(Math.round(iv), min);
    const lo = Math.min(Math.max(Math.max(1, Math.round(iv - d)), min), MAX_IVL);
    const hi = Math.min(Math.max(Math.round(iv + d), min), MAX_IVL);
    const pick = Math.max(Math.min(hi, Math.floor(lo + ff * (1 + hi - lo))), min);
    return settings.loadBalance ? balanceDay(lo, hi, pick, min) : pick;
}
// Bilanciamento del carico (come il load balancer di Anki): dentro il margine di fuzz
// sceglie il giorno con meno ripassi già fissati; col limite giornaliero può anticipare un po'.
let _loadCache = { key: '', map: null };
function loadMap(){
    const key = data.lastModified + '|' + todayStr();
    if (_loadCache.key === key && _loadCache.map) return _loadCache.map;
    const m = {};
    Object.values(data.subjects).forEach(s => s.topics.forEach(t => { if (!isTodo(t) && t.next) m[t.next] = (m[t.next] || 0) + 1; }));
    _loadCache = { key, map: m };
    return m;
}
function balanceDay(lo, hi, pick, min){
    const m = loadMap(), today = todayStr(), max = settings.dailyMax || 0;
    const count = d => m[shiftDate(today, d)] || 0;
    let best = pick, bestScore = Infinity;
    for (let d = lo; d <= hi; d++) {
        const c = count(d), score = c + Math.abs(d - pick) * 0.3 + (max && c >= max ? 1e4 : 0);
        if (score < bestScore) { bestScore = score; best = d; }
    }
    if (max && count(best) >= max) {
        for (let d = lo - 1; d >= Math.max(min, Math.ceil(lo * 0.85)); d--) { if (count(d) < max) { best = d; break; } }
    }
    return best;
}

// ── Anki classico (scheduler v3, impostazioni predefinite) ──
// Facilità iniziale 2,50 · Hard ×1,2 · Easy bonus 1,3 · nuovo intervallo dopo errore 0% (min 1g)
function sm2Schedule(t, q, today, ff){
    const ef = t.easeFactor || 2.5;
    if (t.relearn) {                                   // dopo un "Ripeti": come i passi di riapprendimento
        if (q === 'ripeti' || q === 'incerto') return { requeue: true, interval: t.interval, ef };
        if (q === 'consolida') return { interval: Math.max(1, t.interval), ef };
        return { interval: Math.max(1, t.interval) + 1, ef };
    }
    const ivl = Math.max(1, t.interval || 1);
    const late = Math.max(0, daysBetween(t.next, today));
    if (q === 'ripeti') return { requeue: true, relearn: true, interval: 1, ef: Math.max(1.3, r2(ef - 0.2)) };
    const hard = constrainIvl(ivl * 1.2, ivl + 1, ff);
    if (q === 'incerto') return { interval: hard, ef: Math.max(1.3, r2(ef - 0.15)) };
    const good = constrainIvl((ivl + late / 2) * ef, hard + 1, ff);
    if (q === 'consolida') return { interval: good, ef };
    const easy = constrainIvl((ivl + late) * ef * 1.3, good + 1, ff);
    return { interval: easy, ef: r2(ef + 0.15) };
}

// ── FSRS-5 ──
const W = FSRS_W;
function fClamp(d){ return Math.min(10, Math.max(1, d)); }
function fD0(g){ return fClamp(W[4] - Math.exp(W[5] * (g - 1)) + 1); }
function fNextD(d, g){ const d1 = d + (-W[6] * (g - 3)) * (10 - d) / 9; return fClamp(W[7] * fD0(4) + (1 - W[7]) * d1); }
function fR(elapsed, s){ return Math.pow(1 + F_FACTOR * elapsed / s, F_DECAY); }
function fRecallS(d, s, r, g){
    const hp = g === 2 ? W[15] : 1, eb = g === 4 ? W[16] : 1;
    return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hp * eb);
}
function fForgetS(d, s, r){
    const lt = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
    return Math.min(lt, s / Math.exp(W[17] * W[18]));
}
function fShortS(s, g){ return s * Math.exp(W[17] * (g - 3 + W[18])); }
function fIvl(s, ret){ return s / F_FACTOR * (Math.pow(ret, 1 / F_DECAY) - 1); }
// Stato FSRS attuale; per gli argomenti nati con il vecchio algoritmo lo ricava da intervallo e facilità
function fsrsState(t){
    if (t.fsrs) return t.fsrs;
    let since = 0;
    t.history.forEach((h, i) => { if (h.q === 'reset') since = i + 1; });
    const reviewed = t.history.slice(since).some(h => GRADE[h.q]) || t.interval > 1 || t.repeats > 0;
    if (!reviewed) return null;
    return { s: Math.max(0.5, t.interval), d: fClamp(5 + (2.5 - (t.easeFactor || 2.5)) * (5 / 1.2)), last: t.next ? shiftDate(t.next, -t.interval) : todayStr() };
}
function fsrsNextState(st, g, today){
    if (!st) return { s: Math.max(0.1, W[g - 1]), d: fD0(g), last: today };
    const el = Math.max(0, daysBetween(st.last, today));
    let s;
    if (el === 0) s = fShortS(st.s, g);
    else { const r = fR(el, st.s); s = g === 1 ? fForgetS(st.d, st.s, r) : fRecallS(st.d, st.s, r, g); }
    return { s: r2(Math.max(0.01, Math.min(s, MAX_IVL))), d: r2(fNextD(st.d, g)), last: today };
}
function fsrsSchedule(t, q, today, ff, ret){
    const g = GRADE[q], st = fsrsState(t);
    const ns = fsrsNextState(st, g, today);
    if (g === 1) return { requeue: true, relearn: true, interval: 1, fsrs: ns };
    if (t.relearn && g === 2) return { requeue: true, interval: t.interval, fsrs: ns };
    const raw = k => Math.max(1, fIvl(fsrsNextState(st, k, today).s, ret));
    let hard = constrainIvl(raw(2), 1, ff), good = constrainIvl(raw(3), 1, ff);
    if (!t.relearn) {                  // in ripasso normale: Hard < Good < Easy, come in Anki
        hard = Math.min(hard, good);
        good = Math.max(good, hard + 1);
    }
    const easy = Math.max(constrainIvl(raw(4), 1, ff), good + 1);
    return { interval: g === 2 ? hard : g === 3 ? good : easy, fsrs: ns };
}

function subAlgo(sub){ return sub && sub.algo === 'sm2' ? 'sm2' : 'fsrs'; }
function subRetention(sub, name){
    const base = sub.retention || 0.9;
    return (sub.examBoost !== false && isExamModeFinal(name)) ? Math.max(base, 0.95) : base;
}
function schedule(t, q, sub, name){
    const today = todayStr(), ff = fuzzFactor(t);
    const a = sm2Schedule(t, q, today, ff);
    const b = fsrsSchedule(t, q, today, ff, subRetention(sub, name));
    const act = subAlgo(sub) === 'sm2' ? a : b;
    let interval = act.interval, capped = false;
    if (!act.requeue) {                    // mai oltre l'esame: al più il giorno prima
        const ex = daysToExam(sub);
        if (ex !== null && ex >= 2 && interval >= ex) { interval = ex - 1; capped = true; }
    }
    return { requeue: !!act.requeue, relearn: !!(a.relearn || b.relearn), interval, capped, ef: a.ef, fsrs: b.fsrs };
}
function fmtIvl(n){
    if (n <= 1) return 'domani';
    if (n < 30) return n + 'gg';
    if (n < 365) return (n / 30).toFixed(1).replace('.', ',').replace(',0', '') + ' mesi';
    return (n / 365).toFixed(1).replace('.', ',').replace(',0', '') + ' anni';
}
function previewLabel(t, q, sub, name){ const r = schedule(t, q, sub, name); return r.requeue ? 'oggi' : fmtIvl(r.interval); }
function memoryInfo(t){
    const st = fsrsState(t);
    if (!st) return null;
    const el = Math.max(0, daysBetween(st.last, todayStr()));
    return { s: st.s, d: st.d, r: fR(el, st.s) };
}
function fmtDays(s){ return s < 1 ? '<1g' : s < 30 ? Math.round(s) + 'g' : s < 365 ? (s / 30).toFixed(1).replace('.', ',') + ' mesi' : (s / 365).toFixed(1).replace('.', ',') + ' anni'; }
function algoLabel(sub){ return subAlgo(sub) === 'sm2' ? 'Anki classico' : `FSRS ${Math.round((sub.retention || 0.9) * 100)}%`; }

// ── Ripasso (con feedback giornaliero) ──────────────────────────────────────
// ── Ripasso (con feedback giornaliero) ──────────────────────────────────────
function reviewCardHtml(t, sub, name, mixed){
    const today = todayStr(), col = topicColor(t, sub), id = jsArg(t.id), sn = jsArg(name);
    const requeued = t.requeueAt && localDateStr(new Date(t.requeueAt)) === today;
    const late = daysFromToday(t.next);
    const btn = (q, key) => {
        const r = schedule(t, q, sub, name);
        const lbl = r.requeue ? 'oggi' : fmtIvl(r.interval) + (r.capped ? ' ⚑' : '');
        return `<button class="rate-btn" style="--rc:${Q_INFO[q].color}" onclick="rate(${id},'${q}',${sn})"><span class="rate-lbl">${Q_INFO[q].label}</span><span class="rate-iv">${lbl}</span><span class="rate-key">${key}</span></button>`;
    };
    const mi = memoryInfo(t), nRev = t.history.filter(h => GRADE[h.q]).length;
    const metaMain = subAlgo(sub) === 'fsrs'
        ? (mi ? `Stabilità ${fmtDays(mi.s)} · difficoltà ${mi.d.toFixed(1).replace('.', ',')} · ricordo stimato ${Math.round(mi.r * 100)}%` : 'Primo ripasso')
        : `Intervallo ${t.interval}g · facilità ${t.easeFactor.toFixed(2).replace('.', ',')}`;
    const cr = breadcrumb(t, sub);
    const crumb = (mixed || cr) ? `<div class="crumb">${mixed ? `<span style="color:${sub.color}">${escHtml(name)}</span>${cr ? ' › ' : ''}` : ''}${escHtml(cr)}</div>` : '';
    const qs = t.questions.length ? `<ol class="q-list">${t.questions.map(q => `<li>${escHtml(q)}</li>`).join('')}</ol>` : '';
    return `<div class="review-card${requeued ? ' requeued' : ''}" style="--c:${col};--sub:${sub.color}" id="rc-${escHtml(t.id)}">
        ${crumb}
        <div class="review-name">${escHtml(t.name)}</div>
        <div class="review-meta">${metaMain} · ${plural(nRev, 'ripasso', 'ripassi')}${late < 0 ? ` · <span class="rep">in ritardo ${-late}g</span>` : ''}${t.repeats ? ` · <span class="rep">ripetuto ${t.repeats}✕</span>` : ''}${requeued ? ' · in coda' : ''}</div>
        ${qs}
        <input type="text" class="fb-input" id="fb-${escHtml(t.id)}" placeholder="Feedback di oggi (facoltativo)…" autocomplete="off">
        ${notesBlockHtml(t, false, qs ? '▸ Note / risposte' : null)}
        <div class="rate-grid">${btn('ripeti','1')}${btn('incerto','2')}${btn('consolida','3')}${btn('buono','4')}</div>
    </div>`;
}
function renderRipassoTab(target, sub){
    const name = data.activeSub, examM = isExamModeFinal(name);
    const due = dueTopics(sub, name);
    if (!due.length) {
        const upcoming = sub.topics.filter(t => !isTodo(t) && !(examM && t.triage !== 3) && t.next > todayStr()).map(t => t.next).sort();
        const next = upcoming[0], nNext = next ? upcoming.filter(d => d === next).length : 0;
        const todo = coverage(sub).todo;
        target.innerHTML = `<div class="card empty"><span class="big">✓</span>Sessione completata${examM ? ' · modalità esame' : ''}
            ${next ? `<div style="margin-top:8px;">Prossimo ripasso: <b style="color:var(--text);">${dueLabel(next).t}</b> · ${plural(nNext, 'argomento', 'argomenti')}</div>` : ''}
            ${todo ? `<div style="margin-top:8px;"><span class="link-action" style="color:var(--warning);" onclick="setSubTab('study')">${plural(todo, 'argomento', 'argomenti')} del programma da studiare →</span></div>` : ''}</div>`;
        return;
    }
    const ex = daysToExam(sub);
    target.innerHTML = `<div class="muted" style="margin-bottom:10px;">${plural(due.length, 'argomento', 'argomenti')} da ripassare · ${algoLabel(sub)}${subAlgo(sub) === 'fsrs' && subRetention(sub, name) > (sub.retention || 0.9) ? ' → 95% (esame)' : ''}${ex !== null && ex >= 2 ? " · ⚑ = anticipato prima dell'esame" : ''}</div>` +
        due.map(t => reviewCardHtml(t, sub, name, false)).join('');
}
function notesBlockHtml(t, open, label){
    const id = escHtml(t.id);
    return `<span class="notes-toggle" onclick="toggleNotes(${jsArg(t.id)})">${label || '▸ Note'}${t.notes ? ' •' : ''}</span>
        <div id="nb-${id}" class="notes-content${open ? '' : ' hidden'}">
            <textarea id="nt-${id}">${escHtml(t.notes)}</textarea>
            <button class="btn btn-secondary btn-small" onclick="saveNote(${jsArg(t.id)})">Salva note</button>
        </div>`;
}
function findTopic(id){ const loc = locateTopic(id); return loc ? loc.t : null; }
function pushHistory(t, entry){
    t.history.push(entry);
    if (t.history.length > HISTORY_CAP) t.history.splice(0, t.history.length - HISTORY_CAP);
}
function rate(id, q, subName){
    const loc = locateTopic(id, subName);
    if (!loc) return;
    const { t, sub, name } = loc;
    const snap = snapshot();
    const fbEl = document.getElementById(`fb-${id}`);
    const note = fbEl ? fbEl.value.trim() : '';
    const r = schedule(t, q, sub, name);
    t.easeFactor = r.ef;
    t.fsrs = r.fsrs;
    const today = todayStr();
    const entry = { d: today, ts: Date.now(), q, iv: r.requeue ? 0 : r.interval, a: subAlgo(sub) };
    if (note) entry.note = note;
    pushHistory(t, entry);
    if (q === 'ripeti') t.repeats += 1;
    t.interval = r.interval;
    if (r.requeue) {
        t.relearn = t.relearn || r.relearn;
        t.requeueAt = Date.now();
        if (t.next > today) t.next = today;
    } else {
        t.relearn = false;
        t.next = shiftDate(today, r.interval);
        delete t.requeueAt;
    }
    save();
    if (data.isGlobal) { const y = window.scrollY; renderGlobal(document.getElementById('appContent')); window.scrollTo(0, y); }
    else refreshTab();
    showToast(r.requeue ? `↻ “${t.name}” in fondo alla coda`
        : `✓ ${Q_INFO[q].label} · ${r.interval === 1 ? 'domani' : 'tra ' + fmtIvl(r.interval)}${r.capped ? " (prima dell'esame)" : ''}${note ? ' · feedback salvato' : ''}`, snap);
}
function toggleNotes(id){ const el = document.getElementById(`nb-${id}`); if (el) el.classList.toggle('hidden'); }
function saveNote(id){
    const t = findTopic(id), area = document.getElementById(`nt-${id}`);
    if (!t || !area) return;
    t.notes = area.value; save(); showToast('✓ Note salvate');
}

// ── Ripasso misto (tutte le materie, alternate) ─────────────────────────────
function mixedQueue(){
    const lists = Object.keys(data.subjects).map(n => ({ n, l: dueTopics(data.subjects[n], n).slice() })).filter(x => x.l.length);
    const out = [];
    while (lists.some(x => x.l.length)) lists.forEach(x => { if (x.l.length) out.push({ t: x.l.shift(), name: x.n, sub: data.subjects[x.n] }); });
    const today = todayStr();
    const rq = x => (x.t.requeueAt && localDateStr(new Date(x.t.requeueAt)) === today) ? x.t.requeueAt : 0;
    return out.map((x, i) => ({ ...x, i })).sort((a, b) => (rq(a) - rq(b)) || (a.i - b.i));
}
function renderMixedReview(area){
    const q = mixedQueue();
    const nSub = new Set(q.map(x => x.name)).size;
    area.innerHTML = (q.length
        ? `<div class="muted" style="margin-bottom:10px;">${plural(q.length, 'argomento', 'argomenti')} da ${plural(nSub, 'materia', 'materie')}, alternate per allenare il ragionamento tra discipline</div>` +
          q.map(x => reviewCardHtml(x.t, x.sub, x.name, true)).join('')
        : `<div class="card empty"><span class="big">✓</span>Nessun ripasso in sospeso in nessuna materia</div>`) + loadForecastCard(null);
}

// ── Agenda materia ──────────────────────────────────────────────────────────
function renderSubWeek(){
    const list = document.getElementById('subAgendaWeekly'), lbl = document.getElementById('subWeekDisplay');
    const sub = data.subjects[data.activeSub];
    if (!list || !lbl || !sub) return;
    const monday = mondayOf(new Date()); monday.setDate(monday.getDate() + weekOffset * 7);
    lbl.textContent = `Settimana dal ${monday.getDate()}/${monday.getMonth() + 1}`;
    const examM = isExamModeFinal(data.activeSub);
    list.innerHTML = weekSectionsHtml(monday, dStr => sub.topics
        .filter(t => t.next === dStr && !(examM && t.triage !== 3))
        .map(t => {
            const col = topicColor(t, sub);
            return `<div class="topic-card" style="border-left-color:${col};" onclick="openTopicInArchive(${jsArg(t.id)}, true)">
                <span class="topic-name" style="color:${col}">${escHtml(t.name)}${t.archived ? '<span class="badge">archiviato</span>' : ''}</span>
                <span class="subject-label">Apri in archivio</span>
            </div>`;
        }).join(''));
}
function changeSubWeek(dir){ weekOffset += dir; renderSubWeek(); }

// ── Archivio: ricerca, dettaglio, storico ───────────────────────────────────
// ── Archivio: albero, ricerca, dettaglio, storico ───────────────────────────
const collapsedTopics = new Set();
function renderHistoryTab(target, sub){
    target.innerHTML = `
        <div class="search"><input type="search" id="archSearch" placeholder="Cerca in nomi, domande, note e feedback (anche archiviati)…" value="${escHtml(archQuery)}" oninput="onArchSearch(this.value)"></div>
        <div id="historyList"></div>
        <div id="archFoot" class="arch-foot"></div>`;
    renderArchList();
}
function onArchSearch(v){ archQuery = v; renderArchList(); }
function renderArchList(){
    const sub = data.subjects[data.activeSub], list = document.getElementById('historyList'), foot = document.getElementById('archFoot');
    if (!sub || !list) return;
    const examM = isExamModeFinal(data.activeSub);
    const q = norm(archQuery.trim());
    const pool = examM ? sub.topics.filter(t => t.triage === 3) : sub.topics;
    list.innerHTML = '';
    if (q) {
        const items = pool.filter(t => topicMatches(t, q));
        items.forEach(t => list.appendChild(buildArchItem(t, sub, { depth: 0, crumb: true })));
        if (!items.length) list.innerHTML = `<div class="card empty">Nessun argomento trovato per “${escHtml(archQuery.trim())}”</div>`;
        foot.textContent = '';
        return;
    }
    const hidden = new Set();
    pool.forEach(t => { if (t.archived) { hidden.add(t.id); descendantsOf(sub, t.id).forEach(id => hidden.add(id)); } });
    const visible = pool.filter(t => !hidden.has(t.id));
    const kids = childCounts(visible);
    let skip = null;
    treeOrder(sub, visible).forEach(({ t, depth }) => {
        if (skip !== null && depth > skip) return;
        skip = null;
        list.appendChild(buildArchItem(t, sub, { depth, drag: true, kids: kids[t.id] || 0 }));
        if (collapsedTopics.has(t.id) && kids[t.id]) skip = depth;
    });
    if (!visible.length) list.innerHTML = `<div class="card empty">${sub.topics.length ? 'Tutti gli argomenti sono archiviati' : 'Nessun argomento — registrane uno in Studio o incolla il programma'}</div>`;
    const parts = [];
    if (hidden.size) parts.push(`${plural(hidden.size, 'argomento archiviato', 'argomenti archiviati')} — usa la ricerca per vederli`);
    else if (visible.length > 1) parts.push('Trascina ⠿ per riordinare o spostare tra gli argomenti');
    foot.textContent = parts.join(' · ');
}
function buildArchItem(t, sub, meta){
    const el = document.createElement('div');
    el.className = `arch-item draggable-item${t.archived ? ' is-archived' : ''}`;
    el.dataset.id = t.id;
    el._meta = meta;
    el.style.marginLeft = (Math.min(meta.depth || 0, 5) * 14) + 'px';
    el.style.setProperty('--c', isTodo(t) ? 'var(--border)' : topicColor(t, sub));
    fillArchItem(el, t);
    if (meta.drag) attachDrag(el, t);
    return el;
}
function fillArchItem(el, t){
    const sub = data.subjects[data.activeSub], meta = el._meta || {};
    const open = expandedTopics.has(t.id), id = jsArg(t.id);
    const due = isTodo(t) ? { t: 'da studiare', c: 'todo' } : dueLabel(t.next);
    const cr = meta.crumb ? breadcrumb(t, sub) : '';
    el.classList.toggle('open', open);
    el.innerHTML = `<div class="topic-row" onclick="toggleArch(${id})">
            ${meta.drag ? `<span class="drag-handle" onclick="event.stopPropagation()" title="Trascina">⠿</span>` : ''}
            <span class="tr-name">${cr ? `<span class="crumb" style="display:block;margin:0;">${escHtml(cr)}</span>` : ''}${escHtml(t.name)}</span>
            ${meta.kids ? `<span class="tr-kids" onclick="event.stopPropagation();toggleKids(${id})">${collapsedTopics.has(t.id) ? '▸' : '▾'} ${meta.kids}</span>` : ''}
            ${t.archived ? '<span class="badge">archiviato</span>' : ''}
            ${t.questions.length ? `<span class="tr-due" title="Domande">?${t.questions.length}</span>` : ''}
            ${t.repeats ? `<span class="tr-due late">${t.repeats}✕</span>` : ''}
            <span class="tr-due ${due.c}">${due.t}</span>
            <span class="tr-chev">›</span>
        </div>
        ${open ? `<div class="topic-detail">${archDetailHtml(t)}</div>` : ''}`;
}
function toggleKids(id){
    if (collapsedTopics.has(id)) collapsedTopics.delete(id); else collapsedTopics.add(id);
    const y = window.scrollY; renderArchList(); window.scrollTo(0, y);
}
function kvHtml(t){
    const sub = data.subjects[data.activeSub], mi = memoryInfo(t);
    const cells = subAlgo(sub) === 'fsrs'
        ? [[fmtDateShort(t.next), 'Prossimo'], [mi ? fmtDays(mi.s) : '—', 'Stabilità'], [mi ? mi.d.toFixed(1).replace('.', ',') : '—', 'Difficoltà'], [mi ? Math.round(mi.r * 100) + '%' : '—', 'Ricordo oggi']]
        : [[fmtDateShort(t.next), 'Prossimo'], [t.interval + 'g', 'Intervallo'], [t.easeFactor.toFixed(2).replace('.', ','), 'Facilità'], [t.repeats, 'Ripetuto']];
    return `<div class="kv">${cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
}
function archDetailHtml(t){
    const sub = data.subjects[data.activeSub], id = jsArg(t.id), todo = isTodo(t);
    const hist = [...t.history].reverse();
    const showAll = expandedHist.has(t.id), shown = showAll ? hist : hist.slice(0, 8);
    const histHtml = hist.length ? `<div class="hist">${shown.map(h => {
            const qi = Q_INFO[h.q] || Q_INFO.nota;
            return `<div class="hist-item" style="--hc:${qi.color}">
                <div class="hist-head"><span class="hist-q">${qi.label}</span><span>${fmtDateLong(h.d)}</span>${GRADE[h.q] ? `<span>→ ${h.q === 'ripeti' || !h.iv ? 'stesso giorno' : fmtIvl(h.iv)}</span>` : ''}${h.a ? `<span style="opacity:.6;">${h.a === 'sm2' ? 'Anki' : 'FSRS'}</span>` : ''}
                    <span class="hist-edit" onclick="editHistNote(${id},${h.ts})" title="${h.note ? 'Modifica' : 'Aggiungi'} feedback">✎</span></div>
                ${h.note ? `<div class="hist-note">${escHtml(h.note)}</div>` : ''}
            </div>`;
        }).join('')}</div>${hist.length > shown.length ? `<div class="hist-more" onclick="toggleHistAll(${id})">Mostra tutti (${hist.length})</div>` : (showAll && hist.length > 8 ? `<div class="hist-more" onclick="toggleHistAll(${id})">Mostra meno</div>` : '')}`
        : `<div class="muted" style="margin-bottom:14px;">Nessun ripasso registrato. Il feedback che scrivi in Ripasso apparirà qui, giorno per giorno.</div>`;
    const excl = descendantsOf(sub, t.id); excl.add(t.id);
    return `
        ${todo ? `<div class="todo-banner"><span>Da studiare</span><button class="chip on" onclick="markStudied(${id})">✓ Studiato oggi</button></div>` : kvHtml(t)}
        <div class="set-lbl">Priorità</div>
        ${triageBoxHtml(t.triage, n => `updateTriageInHistory(${id},${n})`)}
        <div class="set-lbl" style="margin-top:16px;">Domande d'esame</div>
        <textarea id="qs-${escHtml(t.id)}" placeholder="Una domanda per riga: in Ripasso le vedrai prima delle note" style="min-height:64px;">${escHtml(t.questions.join('\n'))}</textarea>
        <button class="btn btn-secondary btn-small" onclick="saveQuestions(${id})">Salva domande</button>
        <div style="margin-top:14px;">${notesBlockHtml(t, !!t.notes, '▸ Note / risposte')}</div>
        <div class="set-lbl" style="margin-top:18px;">Storico ripassi <span class="link-action" onclick="addFreeNote(${id})">+ nota</span></div>
        ${histHtml}
        <div class="set-lbl" style="margin-top:6px;">Posizione</div>
        <select class="styled-select" onchange="moveTopic(${id}, this.value)"><option value="">— Argomento principale —</option>${topicOptionsHtml(sub, excl, t.parent)}</select>
        <div class="detail-actions" style="margin-top:6px;">
            <button class="chip" onclick="openSubTopicModal(${id})">+ Sotto-argomento</button>
            ${todo ? '' : `<button class="chip" onclick="openDateModal(${id})">Ripianifica</button><button class="chip" onclick="resetTopic(${id})">↺ Reset completo</button>`}
            <button class="chip" onclick="toggleArchiveTopic(${id})">${t.archived ? '⤒ Ripristina' : '⤓ Archivia'}</button>
            <button class="chip warn" onclick="deleteTopic(${id})">Elimina</button>
        </div>
        ${t.seconds ? `<div class="muted" style="margin-top:12px;font-size:.62rem;">Tempo di studio col timer: ${fmtDur(t.seconds)}</div>` : ''}
        ${t.created ? `<div class="muted" style="margin-top:6px;font-size:.62rem;">Registrato il ${fmtDate(t.created)}${t.studiedOn ? ` · studiato il ${fmtDate(t.studiedOn)}` : ''}</div>` : ''}`;
}
function rerenderArchItem(id){
    const el = [...document.querySelectorAll('#historyList .arch-item')].find(x => x.dataset.id === id);
    const t = findTopic(id);
    if (el && t) { fillArchItem(el, t); el.style.setProperty('--c', isTodo(t) ? 'var(--border)' : topicColor(t, data.subjects[data.activeSub])); }
    else renderArchList();
}
function toggleArch(id){
    if (expandedTopics.has(id)) expandedTopics.delete(id); else expandedTopics.add(id);
    rerenderArchItem(id);
}
function toggleHistAll(id){ if (expandedHist.has(id)) expandedHist.delete(id); else expandedHist.add(id); rerenderArchItem(id); }
function saveQuestions(id){
    const t = findTopic(id), area = document.getElementById(`qs-${id}`);
    if (!t || !area) return;
    t.questions = parseQuestions(area.value);
    save(); rerenderArchItem(id); showToast(`✓ ${plural(t.questions.length, 'domanda salvata', 'domande salvate')}`);
}
function moveTopic(id, parentId){
    const sub = data.subjects[data.activeSub], t = findTopic(id);
    if (!t) return;
    if (parentId && (parentId === id || descendantsOf(sub, id).has(parentId))) { showToast('⚠ Non puoi spostarlo dentro un suo sotto-argomento'); renderArchList(); return; }
    const snap = snapshot();
    t.parent = parentId || null;
    if (parentId) collapsedTopics.delete(parentId);
    save(); renderArchList(); showToast('✓ Spostato', snap);
}
let _subTopicParent = null;
function openSubTopicModal(id){
    const t = findTopic(id);
    if (!t) return;
    _subTopicParent = id;
    document.getElementById('subTopicTitle').textContent = `Sotto-argomento di “${t.name}”`;
    document.getElementById('inSubTopic').value = '';
    openModal('modalSubTopic');
}
function saveSubTopic(studied){
    const sub = data.subjects[data.activeSub], name = document.getElementById('inSubTopic').value.trim();
    if (!name || !_subTopicParent) return;
    const t = newTopic(name, '', studied ? shiftDate(todayStr(), 1) : null, data.triage, _subTopicParent);
    if (!studied) t.status = 'todo'; else t.studiedOn = todayStr();
    sub.topics.push(t);
    collapsedTopics.delete(_subTopicParent);
    save(); closeModal('modalSubTopic'); renderArchList();
    showToast(studied ? '✓ Aggiunto — ripasso domani' : '✓ Aggiunto da studiare');
}
function attachDrag(card, t){
    const handle = card.querySelector('.drag-handle');
    if (!handle) return;
    const enable = () => { card.draggable = true; };
    handle.addEventListener('mousedown', enable);
    handle.addEventListener('touchstart', enable, { passive:true });
    card.addEventListener('dragstart', e => { dragSrc = card; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.id); } catch (_) {} });
    card.addEventListener('dragend', () => { card.draggable = false; card.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); });
    card.addEventListener('dragover', e => { if (!dragSrc) return; e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
        e.preventDefault(); card.classList.remove('drag-over');
        if (!dragSrc || dragSrc === card) return;
        const sub = data.subjects[data.activeSub], topics = sub.topics;
        const all = [...card.parentNode.querySelectorAll('.draggable-item')];
        const fromIdx = all.indexOf(dragSrc), toIdx = all.indexOf(card);
        const srcT = topics.find(x => x.id === dragSrc.dataset.id), dstT = topics.find(x => x.id === card.dataset.id);
        dragSrc = null;
        if (!srcT || !dstT) return;
        if (descendantsOf(sub, srcT.id).has(dstT.id)) { showToast('⚠ Non puoi spostarlo dentro un suo sotto-argomento'); return; }
        srcT.parent = dstT.parent || null;           // prende il livello della destinazione
        topics.splice(topics.indexOf(srcT), 1);
        let di = topics.indexOf(dstT);
        if (fromIdx < toIdx) di += 1;
        topics.splice(di, 0, srcT);
        save(); renderArchList();
    });
}
function updateTriageInHistory(id, n){
    const t = findTopic(id);
    if (!t) return;
    t.triage = n; save();
    if (isExamModeFinal(data.activeSub)) renderArchList(); else rerenderArchItem(id);
}
function openTopicInArchive(topicId, expand){
    const t = findTopic(topicId);
    if (t) {
        if (expand) expandedTopics.add(t.id);
        if (t.archived) archQuery = t.name;
        let p = t.parent; const seen = new Set();
        while (p && !seen.has(p)) { seen.add(p); collapsedTopics.delete(p); const pt = findTopic(p); p = pt ? pt.parent : null; }
    }
    setSubTab('history');
    setTimeout(() => {
        const el = [...document.querySelectorAll('#historyList [data-id]')].find(x => x.dataset.id === topicId);
        if (el) {
            el.scrollIntoView({ behavior:'smooth', block:'center' });
            el.style.boxShadow = '0 0 0 1px var(--sub)';
            setTimeout(() => { el.style.boxShadow = ''; }, 1800);
        }
    }, 80);
}
let _histEdit = null;
function editHistNote(id, ts){
    const t = findTopic(id);
    const h = t && t.history.find(x => x.ts === ts);
    if (!h) return;
    _histEdit = { id, ts };
    document.getElementById('histNoteTitle').textContent = `Feedback · ${fmtDateLong(h.d)}`;
    document.getElementById('histNoteText').value = h.note || '';
    openModal('modalHistNote');
}
function addFreeNote(id){
    _histEdit = { id, ts: null };
    document.getElementById('histNoteTitle').textContent = `Nota di oggi · ${fmtDateLong(todayStr())}`;
    document.getElementById('histNoteText').value = '';
    openModal('modalHistNote');
}
function saveHistNote(){
    if (!_histEdit) return;
    const t = findTopic(_histEdit.id), txt = document.getElementById('histNoteText').value.trim();
    if (!t) { closeModal('modalHistNote'); return; }
    if (_histEdit.ts === null) {
        if (!txt) { closeModal('modalHistNote'); return; }
        pushHistory(t, { d: todayStr(), ts: Date.now(), q: 'nota', note: txt });
    } else {
        const h = t.history.find(x => x.ts === _histEdit.ts);
        if (h) { if (txt) h.note = txt; else delete h.note; }
        if (h && h.q === 'nota' && !txt) t.history = t.history.filter(x => x !== h);
    }
    save(); closeModal('modalHistNote'); rerenderArchItem(t.id);
    _histEdit = null;
}

// ── Reset completo & archiviazione ──────────────────────────────────────────
function applyFullReset(t){
    t.interval = 1; t.easeFactor = 2.5; t.repeats = 0;
    t.fsrs = null; t.relearn = false;
    t.next = shiftDate(todayStr(), 1);
    delete t.requeueAt;
    pushHistory(t, { d: todayStr(), ts: Date.now(), q: 'reset', iv: 1 });
}
function resetTopic(id){
    const t = findTopic(id);
    if (!t) return;
    confirmDialog({
        title: 'Reset completo?',
        msg: `“${t.name}” ripartirà da zero come appena studiato: memoria FSRS, intervallo e facilità azzerati, ripetizioni a 0, primo ripasso domani. Lo storico dei feedback resta.`,
        ok: 'Reset'
    }, () => {
        const snap = snapshot();
        applyFullReset(t); save(); refreshTab();
        showToast('✓ Argomento resettato', snap);
    });
}
function resetAllTopics(){
    const sub = data.subjects[data.activeSub];
    if (!sub || !sub.topics.length) return;
    confirmDialog({
        title: 'Reset di tutta la materia?',
        msg: `Tutti i ${sub.topics.length} argomenti di “${data.activeSub}” ripartiranno da zero (memoria FSRS, intervallo e facilità azzerati, ripetizioni a 0, ripasso domani). Lo storico resta.`,
        ok: 'Reset tutto'
    }, () => {
        const snap = snapshot();
        const list = sub.topics.filter(t => !isTodo(t));
        list.forEach(applyFullReset); save(); refreshTab();
        showToast(`✓ ${plural(list.length, 'argomento resettato', 'argomenti resettati')}`, snap);
    });
}
function toggleArchiveTopic(id){
    const t = findTopic(id);
    if (!t) return;
    const snap = snapshot();
    t.archived = !t.archived;
    if (t.archived) expandedTopics.delete(id);
    save(); renderArchList(); updateDueBadges();
    showToast(t.archived ? '⤓ Archiviato — continua a comparire nei ripassi' : '⤒ Ripristinato nell\'archivio', snap);
}
function deleteTopic(id){
    const t = findTopic(id);
    if (!t) return;
    const sub = data.subjects[data.activeSub];
    const kids = sub.topics.filter(x => x.parent === id);
    confirmDialog({ title:'Eliminare argomento?', msg:`“${t.name}” e il suo storico verranno eliminati.${kids.length ? ` ${kids.length === 1 ? 'Il suo sotto-argomento sale' : `I suoi ${kids.length} sotto-argomenti salgono`} di un livello.` : ''}` }, () => {
        const snap = snapshot();
        kids.forEach(k => { k.parent = t.parent || null; });
        sub.topics = sub.topics.filter(x => x.id !== id);
        expandedTopics.delete(id);
        save(); refreshTab(); showToast('✓ Argomento eliminato', snap);
    });
}
function applyImprevisto(){
    const today = todayStr(), sub = data.subjects[data.activeSub];
    const due = sub.topics.filter(t => !isTodo(t) && t.next && t.next <= today);
    if (!due.length) { showToast('Nessun ripasso da spostare oggi'); return; }
    const snap = snapshot(), tomorrow = shiftDate(today, 1);
    due.forEach(t => { t.next = tomorrow; delete t.requeueAt; });
    save(); render(); showToast(`✓ ${plural(due.length, 'ripasso spostato', 'ripassi spostati')} a domani`, snap);
}

// ── Swipe tra tab ───────────────────────────────────────────────────────────
function initTabSwipe(){
    const content = document.getElementById('tabContent');
    if (!content || content.dataset.swipe) return;
    content.dataset.swipe = '1';
    let sx = 0, sy = 0, ignore = false;
    content.addEventListener('touchstart', e => {
        ignore = !!e.target.closest('textarea,input,.drag-handle,.month-grid');
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive:true });
    content.addEventListener('touchend', e => {
        if (ignore) return;
        const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        const cur = TAB_ORDER.indexOf(data.activeTab || 'study');
        if (dx < 0 && cur < TAB_ORDER.length - 1) setSubTab(TAB_ORDER[cur + 1]);
        else if (dx > 0 && cur > 0) setSubTab(TAB_ORDER[cur - 1]);
    }, { passive:true });
}

// ── Note ────────────────────────────────────────────────────────────────────
let _notepadTimer = null;
function renderNotesTab(target, sub){
    const pending = sub.todos.filter(t => !t.done), done = sub.todos.filter(t => t.done);
    const todoHtml = sub.todos.map(t => `
        <div class="todo-item" id="todo-${escHtml(t.id)}">
            <input type="checkbox" class="todo-cb" ${t.done ? 'checked' : ''} onchange="toggleTodo(${jsArg(t.id)})">
            <span class="todo-text${t.done ? ' done' : ''}">${escHtml(t.text)}</span>
            <span class="todo-del" onclick="deleteTodo(${jsArg(t.id)})">✕</span>
        </div>`).join('') || `<div class="muted" style="padding:10px 0;">Nessuna attività</div>`;
    target.innerHTML = `
        <div class="card">
            <div class="section-label"><span>To-do</span><span class="todo-count">${pending.length}/${sub.todos.length} da fare</span></div>
            <div id="todoList">${todoHtml}</div>
            <div class="todo-add-row">
                <input type="text" id="inTodo" placeholder="Aggiungi attività…" onkeydown="if(event.key==='Enter')addTodo()">
                <button class="todo-add-btn" onclick="addTodo()">+</button>
            </div>
            ${done.length ? `<div style="margin-top:12px;"><span class="link-action" onclick="clearDoneTodos()">🗑 Rimuovi completate (${done.length})</span></div>` : ''}
        </div>
        <div class="card">
            <div class="section-label"><span>Blocco note</span><span class="link-action" style="color:var(--success-bright);" onclick="saveNotepad()" id="noteSaveBtn">Salva</span></div>
            <textarea class="note-pad" id="notepadArea" placeholder="Note libere, link, schemi, promemoria permanenti…">${escHtml(sub.notepad)}</textarea>
        </div>`;
    const area = document.getElementById('notepadArea');
    area.addEventListener('input', () => { clearTimeout(_notepadTimer); _notepadTimer = setTimeout(() => saveNotepad(true), 800); });
    area.addEventListener('blur', () => saveNotepad(true));
}
function addTodo(){
    const inp = document.getElementById('inTodo'), text = inp.value.trim();
    if (!text) return;
    const sub = data.subjects[data.activeSub];
    sub.todos.push({ id: uid(), text, done: false });
    save(); renderNotesTab(document.getElementById('tabContent'), sub);
    const again = document.getElementById('inTodo'); if (again) again.focus();
}
function toggleTodo(id){
    const sub = data.subjects[data.activeSub], t = sub.todos.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done; save();
    const row = document.getElementById(`todo-${id}`);
    if (row) row.querySelector('.todo-text').classList.toggle('done', t.done);
    const el = document.querySelector('.todo-count');
    if (el) el.textContent = `${sub.todos.filter(x => !x.done).length}/${sub.todos.length} da fare`;
}
function deleteTodo(id){
    const sub = data.subjects[data.activeSub], snap = snapshot();
    sub.todos = sub.todos.filter(x => x.id !== id);
    save(); refreshTab(); showToast('✓ Attività eliminata', snap);
}
function clearDoneTodos(){
    const sub = data.subjects[data.activeSub], snap = snapshot();
    sub.todos = sub.todos.filter(x => !x.done);
    save(); refreshTab(); showToast('✓ Completate rimosse', snap);
}
function saveNotepad(silent){
    clearTimeout(_notepadTimer);
    const area = document.getElementById('notepadArea'), sub = data.subjects[data.activeSub];
    if (!area || !sub) return;
    if (sub.notepad !== area.value) { sub.notepad = area.value; save(); }
    const btn = document.getElementById('noteSaveBtn');
    if (btn) { btn.textContent = '✓ Salvato'; setTimeout(() => { if (btn) btn.textContent = 'Salva'; }, 1400); }
}

// ── Statistiche (sessioni ricavate dallo storico: include anche "Ripeti") ──
// ── Statistiche ─────────────────────────────────────────────────────────────
function sessionCounts(sub){
    const counts = { ...sub.sessionLog };
    const fromHist = {};
    sub.topics.forEach(t => t.history.forEach(h => { if (GRADE[h.q]) fromHist[h.d] = (fromHist[h.d] || 0) + 1; }));
    Object.keys(fromHist).forEach(d => { counts[d] = Math.max(counts[d] || 0, fromHist[d]); });
    return counts;
}
function barsHtml(values, labelsFn, todayIdx, title){
    const max = Math.max(...values, 1);
    return `<div class="session-bar-wrap">${values.map((v, i) => `<div class="session-bar${i === todayIdx ? ' today' : ''}" style="height:${Math.max(3, Math.round(v / max * 60))}px;" title="${labelsFn(i)}: ${title(v)}"></div>`).join('')}</div>
        <div class="session-labels">${values.map((_, i) => `<div class="session-label">${i % 2 === (todayIdx === 0 ? 0 : 1) ? labelsFn(i) : ''}</div>`).join('')}</div>`;
}
function forecastCounts(subName){
    const today = todayStr(), arr = new Array(30).fill(0);
    Object.keys(data.subjects).forEach(n => {
        if (subName && n !== subName) return;
        data.subjects[n].topics.forEach(t => {
            if (isTodo(t) || !t.next) return;
            const d = Math.max(0, daysBetween(today, t.next));
            if (d < 30) arr[d]++;
        });
    });
    return arr;
}
function loadForecastCard(subName){
    const c = forecastCounts(subName), max = Math.max(...c), tot = c.reduce((a, b) => a + b, 0);
    const lbl = i => { const d = parseLocalDate(shiftDate(todayStr(), i)); return `${d.getDate()}/${d.getMonth() + 1}`; };
    return `<div class="card">
        <div class="section-label">Carico prossimi 30 giorni${subName ? '' : ' · tutte le materie'} <span>${tot} ripassi · picco ${max}/g</span></div>
        ${barsHtml(c, lbl, 0, v => `${v} ripassi`)}
        ${settings.dailyMax ? `<div class="muted" style="margin-top:8px;">Limite impostato: ${settings.dailyMax} al giorno${max > settings.dailyMax ? ' — alcuni giorni lo superano (ripassi già fissati prima del limite)' : ''}</div>` : ''}
    </div>`;
}
// Probabilità di ricordare ogni argomento il giorno dell'esame, se da oggi non lo ripassi più
function examReadiness(sub){
    const ex = daysToExam(sub);
    if (ex === null || ex < 0) return null;
    return sub.topics.map(t => {
        if (isTodo(t)) return { t, r: 0, todo: true };
        const st = fsrsState(t) || { s: W[2], last: t.studiedOn || t.created || shiftDate(t.next, -1) };
        return { t, r: fR(Math.max(0, daysBetween(st.last, sub.examDate)), st.s) };
    }).sort((a, b) => a.r - b.r);
}
function readinessCardHtml(sub){
    const rows = examReadiness(sub);
    if (!rows || !rows.length) return '';
    const avg = rows.reduce((a, x) => a + x.r, 0) / rows.length;
    const pctCol = r => r >= 0.85 ? 'var(--success-bright)' : r >= 0.7 ? 'var(--warning)' : 'var(--danger)';
    const weak = rows.slice(0, 10);
    return `<div class="card">
        <div class="section-label">Pronto per l'esame? <span>${fmtDateShort(sub.examDate)}</span></div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;">
            <span class="stat-number" style="font-size:2.2rem;color:${pctCol(avg)}">${Math.round(avg * 100)}%</span>
            <span class="muted">ricordo medio stimato il giorno dell'esame, se da oggi non ripassassi più nulla</span>
        </div>
        <div class="field-lbl" style="margin:12px 0 4px;">Più a rischio</div>
        ${weak.map(x => `<div class="ready-row">
            <span class="nm">${escHtml(x.t.name)}</span>
            <span class="ready-pct" style="color:${x.todo ? 'var(--warning)' : pctCol(x.r)}">${x.todo ? '—' : Math.round(x.r * 100) + '%'}</span>
            ${x.todo ? `<button class="chip" onclick="setSubTab('study')">Da studiare</button>`
                     : (x.t.next <= todayStr() ? `<span class="tr-due today" style="min-width:86px;text-align:center;">in coda oggi</span>` : `<button class="chip" onclick="reviewNow(${jsArg(x.t.id)})">Ripassa oggi</button>`)}
        </div>`).join('')}
    </div>`;
}
function reviewNow(id){
    const t = findTopic(id);
    if (!t) return;
    const snap = snapshot();
    t.next = todayStr(); delete t.requeueAt;
    save(); refreshTab(); showToast(`✓ “${t.name}” aggiunto ai ripassi di oggi`, snap);
}
function studySecondsOn(sub, iso){ let s = 0; Object.values(sub.timeLog || {}).forEach(dev => { s += (dev && dev[iso]) || 0; }); return s; }
function fmtDur(sec){ const m = Math.round(sec / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`; }
function studyTimeCardHtml(sub){
    const days = [], vals = [];
    for (let i = 13; i >= 0; i--) { const iso = shiftDate(todayStr(), -i); days.push(iso); vals.push(studySecondsOn(sub, iso)); }
    const week = vals.slice(7).reduce((a, b) => a + b, 0);
    const top = sub.topics.filter(t => t.seconds > 0).sort((a, b) => b.seconds - a.seconds).slice(0, 5);
    if (!vals.some(v => v) && !top.length) return `<div class="card"><div class="section-label">Tempo di studio</div><p class="muted">Avvia il timer ⏱ (scegliendo anche l'argomento, se vuoi): qui vedrai le ore studiate per giorno e per argomento.</p></div>`;
    const lbl = i => { const d = parseLocalDate(days[i]); return `${d.getDate()}/${d.getMonth() + 1}`; };
    return `<div class="card">
        <div class="section-label">Tempo di studio <span>${fmtDur(week)} questa settimana</span></div>
        ${barsHtml(vals.map(v => Math.round(v / 60)), lbl, 13, v => `${v} min`)}
        ${top.length ? `<div class="field-lbl" style="margin:14px 0 4px;">Argomenti più studiati</div>${top.map(t => `<div class="ready-row"><span class="nm">${escHtml(t.name)}</span><span class="muted">${fmtDur(t.seconds)}</span></div>`).join('')}` : ''}
    </div>`;
}
function renderStats(target, sub){
    const topics = sub.topics, total = topics.length;
    if (!total) { target.innerHTML = `<div class="card empty">Nessun argomento registrato</div>`; return; }
    const today = todayStr();
    const studied = topics.filter(t => !isTodo(t));
    const acquired = studied.filter(t => t.interval >= 8).length;
    const uncertain = studied.filter(t => t.interval > 1 && t.interval < 8).length;
    const critical = topics.filter(t => t.repeats >= 2).length;
    const dueToday = studied.filter(t => t.next <= today).length;
    const examCount = topics.filter(t => t.triage === 3).length;
    const archived = topics.filter(t => t.archived).length;
    const cov = coverage(sub);
    const pct = n => Math.round((n / total) * 100);
    const log = sessionCounts(sub), days = [], counts = [];
    for (let i = 13; i >= 0; i--) { const iso = shiftDate(today, -i); days.push(iso); counts.push(log[iso] || 0); }
    const week = counts.slice(7).reduce((a, b) => a + b, 0);
    const lbl = i => { const d = parseLocalDate(days[i]); return `${d.getDate()}/${d.getMonth() + 1}`; };
    target.innerHTML = `
        <div class="card">
            <div class="section-label">Panoramica${archived ? `<span>${archived} archiviati</span>` : ''}</div>
            <div class="stat-grid">
                <div class="stat-box"><div class="stat-number">${cov.done}<span style="font-size:1rem;color:var(--text-dim);">/${total}</span></div><div class="stat-label">Studiati</div></div>
                <div class="stat-box"><div class="stat-number" style="color:var(--warning)">${dueToday}</div><div class="stat-label">Da ripassare</div></div>
                <div class="stat-box"><div class="stat-number" style="color:var(--success-bright)">${acquired}</div><div class="stat-label">Acquisiti</div></div>
                <div class="stat-box"><div class="stat-number" style="color:var(--danger)">${critical}</div><div class="stat-label">Critici</div></div>
            </div>
        </div>
        ${readinessCardHtml(sub)}
        <div class="card">
            <div class="section-label">Distribuzione</div>
            ${[['Copertura programma',cov.done,'var(--sub)'],['Acquisiti (≥8g)',acquired,'var(--success-bright)'],['In consolidamento',uncertain,'var(--accent)'],['Priorità esame',examCount,'var(--exam-color)'],['Critici (≥2 Ripeti)',critical,'var(--danger)']].map(([l, n, c]) => `
            <div class="progress-bar-wrap">
                <div class="progress-label"><span>${l}</span><span>${n}/${total} · ${pct(n)}%</span></div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct(n)}%;background:${c}"></div></div>
            </div>`).join('')}
        </div>
        ${loadForecastCard(data.activeSub)}
        <div class="card">
            <div class="section-label">Ripassi — ultime 2 settimane <span>${week} questa settimana</span></div>
            ${barsHtml(counts, lbl, 13, v => `${v} ripassi`)}
        </div>
        ${studyTimeCardHtml(sub)}
        <div class="card">
            <div class="section-label">Zona pericolosa</div>
            <p class="muted" style="margin-bottom:4px;">Riporta tutti gli argomenti studiati della materia allo stato iniziale. Lo storico dei feedback resta.</p>
            <button class="btn btn-secondary" style="color:var(--danger);" onclick="resetAllTopics()">↺ Reset completo di tutti gli argomenti</button>
        </div>`;
}

// ── Pomodoro (basato sull'orario reale, collegato a materia e argomento) ───
const POMO_KEY = 'studyhub_pomo', POMO_SESS_KEY = 'studyhub_pomo_sessions';
let pomoCfg = (() => { try { return JSON.parse(localStorage.getItem(POMO_KEY)) || {}; } catch (_) { return {}; } })();
let pomodoroStudyMins = pomoCfg.study || 25, pomodoroBreakMins = pomoCfg.brk || 5;
let pomodoroSeconds = pomodoroStudyMins * 60;
let pomodoroRunning = false, pomodoroBreak = false, pomodoroTimer = null, pomoEndAt = 0;
let pomoSub = null, pomoTopicId = '', pomoSegStart = 0;
// Il timer sopravvive alla chiusura dell'app: lo stato è salvato sul dispositivo
const POMO_STATE_KEY = 'studyhub_pomo_state';
function savePomoState(){
    try {
        localStorage.setItem(POMO_STATE_KEY, JSON.stringify({ running: pomodoroRunning, brk: pomodoroBreak, endAt: pomoEndAt,
            secs: pomodoroSeconds, sub: pomoSub, topic: pomoTopicId, segStart: pomoSegStart }));
    } catch (_) {}
}
function restorePomoState(){
    let st = null;
    try { st = JSON.parse(localStorage.getItem(POMO_STATE_KEY)); } catch (_) {}
    if (!st) return;
    pomodoroBreak = !!st.brk;
    pomoSub = st.sub && data.subjects[st.sub] ? st.sub : null;
    pomoTopicId = st.topic || '';
    pomoSegStart = Number(st.segStart) || 0;
    pomodoroSeconds = Number(st.secs) > 0 ? Number(st.secs) : pomoTotal();
    if (st.running && st.endAt) {
        pomoEndAt = Number(st.endAt);
        pomodoroRunning = true;
        if (Date.now() >= pomoEndAt) pomoFinishPhase(true);
        else { clearInterval(pomodoroTimer); pomodoroTimer = setInterval(pomoTick, 500); updatePomoDisplay(); }
    }
}
const BASE_TITLE = document.title;
const POMO_R = 68, POMO_C = 2 * Math.PI * POMO_R;

function pomoSessionsToday(){
    try { const s = JSON.parse(localStorage.getItem(POMO_SESS_KEY)); return s && s.date === todayStr() ? s.count : 0; }
    catch (_) { return 0; }
}
function addPomoSession(){ localStorage.setItem(POMO_SESS_KEY, JSON.stringify({ date: todayStr(), count: pomoSessionsToday() + 1 })); }
function pomoRemaining(){ return pomodoroRunning ? Math.max(0, Math.ceil((pomoEndAt - Date.now()) / 1000)) : pomodoroSeconds; }
function pomoTotal(){ return (pomodoroBreak ? pomodoroBreakMins : pomodoroStudyMins) * 60; }
function fmtMMSS(s){ return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`; }
// Registra il tempo di studio del segmento appena concluso (per dispositivo, così la sync somma correttamente)
function flushStudyTime(){
    if (!pomodoroRunning || pomodoroBreak || !pomoSub) return;
    const sec = Math.max(0, pomoSegStart - pomoRemaining());
    pomoSegStart = pomoRemaining();
    const sub = data.subjects[pomoSub];
    if (!sub || sec < 5) return;
    const iso = todayStr();
    const dev = sub.timeLog[DEVICE_ID] = sub.timeLog[DEVICE_ID] || {};
    dev[iso] = (dev[iso] || 0) + sec;
    const t = pomoTopicId && sub.topics.find(x => x.id === pomoTopicId);
    if (t) t.seconds = (t.seconds || 0) + sec;
    save(); savePomoState();
}
function renderPomodoro(){
    const rem = pomoRemaining(), offset = POMO_C * (1 - rem / pomoTotal());
    const hasYT = ytPlaylistUrl.trim().length > 0;
    const subName = (pomodoroRunning && pomoSub && data.subjects[pomoSub]) ? pomoSub : data.activeSub;
    const sub = data.subjects[subName];
    if (sub && pomoTopicId && !sub.topics.some(t => t.id === pomoTopicId)) pomoTopicId = '';
    const stepper = (type, val, step) => `<div class="stepper"><button onclick="setPomoDuration('${type}',-${step})">−</button><span>${val}</span><button onclick="setPomoDuration('${type}',${step})">+</button></div>`;
    return `<div style="text-align:center;">
        <div class="pomo-ring">
            <svg width="150" height="150" viewBox="0 0 150 150">
                <circle class="track" cx="75" cy="75" r="${POMO_R}"/>
                <circle id="pomoRingProg" class="${pomodoroBreak ? 'break-progress' : 'progress'}" cx="75" cy="75" r="${POMO_R}" stroke-dasharray="${POMO_C}" stroke-dashoffset="${offset}"/>
            </svg>
            <div class="pomo-time"><span id="pomoTimeText">${fmtMMSS(rem)}</span><span class="pomo-label">${pomodoroBreak ? 'Pausa' : 'Studio'}</span></div>
        </div>
        ${sub ? `<div style="text-align:left;margin-bottom:12px;">
            <div class="field-lbl">Stai studiando${subName !== data.activeSub ? ` · timer avviato su ${escHtml(subName)}` : ''}</div>
            <select class="styled-select" onchange="setPomoTopic(this.value)"><option value="">Tutta la materia</option>${topicOptionsHtml(sub, null, pomoTopicId)}</select>
            <div class="muted">Oggi su ${escHtml(subName)}: ${fmtDur(studySecondsOn(sub, todayStr()))}</div>
        </div>` : ''}
        ${!pomodoroRunning && !pomodoroBreak ? `
        <div style="display:flex;gap:18px;margin-bottom:16px;align-items:center;justify-content:center;">
            <div><div class="field-lbl" style="margin-bottom:6px;">Studio (min)</div>${stepper('study', pomodoroStudyMins, 5)}</div>
            <div style="width:1px;height:40px;background:var(--border);"></div>
            <div><div class="field-lbl" style="margin-bottom:6px;">Pausa (min)</div>${stepper('break', pomodoroBreakMins, 1)}</div>
        </div>` : ''}
        <div class="pomo-controls">
            <button class="btn btn-primary" onclick="pomodoroToggle()">${pomodoroRunning ? '⏸ Pausa' : '▶ Avvia'}</button>
            <button class="btn btn-secondary" onclick="pomodoroReset()">↺ Reset</button>
        </div>
        <div class="pomo-sessions">Sessioni completate oggi: ${pomoSessionsToday()}</div>
        <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;text-align:left;">
            <div class="field-lbl" style="margin-bottom:6px;display:flex;align-items:center;">Musica da YouTube${helpBtn('ytmode')}</div>
            <div style="display:flex;gap:8px;align-items:flex-end;">
                <input type="text" id="ytUrlInput" placeholder="Incolla il link di una playlist o di un video" value="${escHtml(ytPlaylistUrl)}" style="flex:1;font-size:.8rem;margin-bottom:0;" onkeydown="if(event.key==='Enter')saveYTUrl()">
                <button class="btn btn-secondary btn-small" onclick="saveYTUrl()">Salva</button>
            </div>
            ${hasYT ? `<div class="seg" style="margin-top:12px;">
                    <button class="chip${ytMode === 'app' ? ' on' : ''}" onclick="setYTMode('app')">App YouTube</button>
                    <button class="chip${ytMode !== 'app' ? ' on' : ''}" onclick="setYTMode('embed')">Dentro Study Hub</button>
                </div>
                <div class="muted" style="margin-top:8px;">${ytMode === 'app'
                    ? "Quando avvii una sessione si apre l'app YouTube: con Premium la musica continua anche se esci o spegni lo schermo. Il timer qui va avanti da solo."
                    : "La musica parte con il timer, ma si ferma se esci dall'app o spegni lo schermo."}</div>
                ${ytMode === 'app' ? `<button class="btn btn-secondary" onclick="openYouTubeApp()">▶ Apri la playlist in YouTube</button>` : ''}`
              : `<div class="muted" style="margin-top:8px;">Nessuna playlist collegata</div>`}
        </div>
    </div>`;
}
function setPomoTopic(v){ flushStudyTime(); pomoTopicId = v; savePomoState(); }
function updatePomoDisplay(){
    const rem = pomoRemaining();
    const tx = document.getElementById('pomoTimeText'), ring = document.getElementById('pomoRingProg');
    if (tx) tx.textContent = fmtMMSS(rem);
    if (ring) ring.setAttribute('stroke-dashoffset', POMO_C * (1 - rem / pomoTotal()));
    document.title = pomodoroRunning ? `${fmtMMSS(rem)} · ${pomodoroBreak ? 'Pausa' : 'Studio'}` : BASE_TITLE;
}
function refreshPomodoro(){ const div = document.getElementById('pomoInner'); if (div) div.innerHTML = renderPomodoro(); updatePomoDisplay(); }
function setPomoDuration(type, delta){
    if (type === 'study') { pomodoroStudyMins = Math.min(90, Math.max(5, pomodoroStudyMins + delta)); if (!pomodoroRunning && !pomodoroBreak) pomodoroSeconds = pomodoroStudyMins * 60; }
    else { pomodoroBreakMins = Math.min(30, Math.max(1, pomodoroBreakMins + delta)); if (!pomodoroRunning && pomodoroBreak) pomodoroSeconds = pomodoroBreakMins * 60; }
    localStorage.setItem(POMO_KEY, JSON.stringify({ study: pomodoroStudyMins, brk: pomodoroBreakMins }));
    savePomoState(); refreshPomodoro();
}
function pomoTick(){ if (pomoRemaining() <= 0) pomoFinishPhase(); else updatePomoDisplay(); }
function pomoFinishPhase(whileAway){
    flushStudyTime();
    clearInterval(pomodoroTimer); pomodoroRunning = false; ytPause();
    if (!whileAway && navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (_) {} }
    if (!pomodoroBreak) {
        addPomoSession(); pomodoroBreak = true; pomodoroSeconds = pomodoroBreakMins * 60;
        showToast(whileAway ? '✓ Sessione di studio completata mentre eri via' : '✓ Sessione completata — pausa!');
    } else {
        pomodoroBreak = false; pomodoroSeconds = pomodoroStudyMins * 60;
        showToast(whileAway ? '⏱ La pausa è finita mentre eri via' : '⏱ Pausa finita — al lavoro!');
    }
    savePomoState(); refreshPomodoro(); updatePomoDisplay();
}
function pomodoroToggle(){
    let openYT = false;
    if (pomodoroRunning) {
        flushStudyTime();
        pomodoroSeconds = pomoRemaining(); clearInterval(pomodoroTimer); pomodoroRunning = false; ytPause();
    } else {
        if (pomodoroSeconds <= 0) pomodoroSeconds = pomoTotal();
        const fresh = !pomodoroBreak && pomodoroSeconds === pomodoroStudyMins * 60;
        if (!pomodoroBreak) { pomoSub = data.activeSub; pomoSegStart = pomodoroSeconds; }
        pomoEndAt = Date.now() + pomodoroSeconds * 1000; pomodoroRunning = true;
        clearInterval(pomodoroTimer); pomodoroTimer = setInterval(pomoTick, 500);
        savePomoState();
        if (ytPlaylistUrl && !pomodoroBreak) {
            if (ytMode === 'app') openYT = fresh;
            else ensureYTPlayer(true);
        }
    }
    savePomoState();
    refreshPomodoro();
    if (openYT) openYouTubeApp();      // subito, finché vale il tocco dell'utente
}
function pomodoroReset(){
    flushStudyTime();
    clearInterval(pomodoroTimer); pomodoroRunning = false; pomodoroBreak = false;
    pomodoroSeconds = pomodoroStudyMins * 60; ytPause(); savePomoState(); refreshPomodoro(); updatePomoDisplay();
}

// ── YouTube ─────────────────────────────────────────────────────────────────
let ytPlaylistUrl = localStorage.getItem('studyhub_yt_url') || '';
let ytPlayer = null, ytPlayerUrl = '', ytApiQueue = [];
function loadYTApi(cb){
    if (window.YT && window.YT.Player) { cb(); return; }
    ytApiQueue.push(cb);
    if (document.getElementById('ytApiScript')) return;
    const s = document.createElement('script');
    s.id = 'ytApiScript'; s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => showToast('⚠ YouTube non raggiungibile');
    document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function(){ const q = ytApiQueue; ytApiQueue = []; q.forEach(f => f()); };
function extractYTPlaylistId(url){ const m = url.match(/[?&]list=([a-zA-Z0-9_-]+)/); return m ? m[1] : null; }
function extractYTVideoId(url){ const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : null; }
function destroyYTPlayer(){
    if (ytPlayer && ytPlayer.destroy) { try { ytPlayer.destroy(); } catch (_) {} }
    ytPlayer = null; ytPlayerUrl = '';
    const frame = document.querySelector('#ytDock .yt-frame');
    if (frame) frame.innerHTML = '<div id="ytPlayer"></div>';
}
function ensureYTPlayer(play){
    if (!ytPlaylistUrl) return;
    if (ytPlayer && ytPlayerUrl === ytPlaylistUrl) { if (play && ytPlayer.playVideo) { try { ytPlayer.playVideo(); } catch (_) {} } return; }
    const plId = extractYTPlaylistId(ytPlaylistUrl), vidId = extractYTVideoId(ytPlaylistUrl);
    if (!plId && !vidId) { showToast('⚠ Link YouTube non riconosciuto'); return; }
    destroyYTPlayer();
    ytPlayerUrl = ytPlaylistUrl;
    loadYTApi(() => {
        const vars = { autoplay: play ? 1 : 0, controls: 1, rel: 0, playsinline: 1 };
        if (plId) { vars.listType = 'playlist'; vars.list = plId; }
        const opts = { height:'100%', width:'100%', playerVars: vars, events: { onReady: e => { if (play) { try { e.target.playVideo(); } catch (_) {} } } } };
        if (!plId && vidId) opts.videoId = vidId;
        ytPlayer = new YT.Player('ytPlayer', opts);
    });
    updateYTDock();
}
let ytMode = localStorage.getItem('studyhub_yt_mode') || 'app';
function setYTMode(m){
    ytMode = m === 'embed' ? 'embed' : 'app';
    localStorage.setItem('studyhub_yt_mode', ytMode);
    if (ytMode === 'app') destroyYTPlayer(); else if (ytPlaylistUrl) ensureYTPlayer(pomodoroRunning && !pomodoroBreak);
    refreshPomodoro(); updateYTDock();
}
function youtubeWebUrl(){
    const pl = extractYTPlaylistId(ytPlaylistUrl), v = extractYTVideoId(ytPlaylistUrl);
    if (v) return `https://www.youtube.com/watch?v=${v}${pl ? '&list=' + pl : ''}`;
    if (pl) return `https://www.youtube.com/playlist?list=${pl}`;
    return ytPlaylistUrl;
}
// Apre l'app YouTube (dove funziona l'ascolto in background di Premium)
function openYouTubeApp(){
    if (!ytPlaylistUrl) return;
    savePomoState();
    const web = youtubeWebUrl(), ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
        location.href = `intent://${web.replace(/^https:\/\//, '')}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(web)};end`;
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
        location.href = web.replace(/^https:\/\//, 'youtube://');
    } else window.open(web, '_blank', 'noopener');
}
function ytPause(){ if (ytPlayer && ytPlayer.pauseVideo) { try { ytPlayer.pauseVideo(); } catch (_) {} } }
function saveYTUrl(){
    const inp = document.getElementById('ytUrlInput');
    if (!inp) return;
    const val = inp.value.trim();
    if (val && !extractYTPlaylistId(val) && !extractYTVideoId(val)) { showToast('⚠ Link YouTube non riconosciuto'); return; }
    ytPlaylistUrl = val; localStorage.setItem('studyhub_yt_url', ytPlaylistUrl);
    if (!ytPlaylistUrl || ytMode === 'app') destroyYTPlayer(); else ensureYTPlayer(pomodoroRunning && !pomodoroBreak);
    refreshPomodoro(); updateYTDock();
}
function updateYTDock(){
    const dock = document.getElementById('ytDock');
    if (dock) dock.classList.toggle('offscreen', !(ytPlaylistUrl && ytMode !== 'app' && !data.isGlobal && data.activeTab === 'pomodoro'));
}

// ── Materie ─────────────────────────────────────────────────────────────────
function addNewSubject(){
    const inp = document.getElementById('inSubName'), val = inp.value.trim();
    if (!val) return;
    if (data.subjects[val]) { showToast('⚠ Materia già esistente'); return; }
    const used = new Set(Object.values(data.subjects).map(s => s.color));
    const color = COLORS.find(c => !used.has(c)) || COLORS[Object.keys(data.subjects).length % COLORS.length];
    data.subjects[val] = { topics:[], color, examDate:null, examModeManual:false, examModeOverride:false, sessionLog:{}, todos:[], notepad:'', deletedTopics:{}, algo:'fsrs', retention:0.9, examBoost:true };
    inp.value = '';
    closeModal('modalNewSubject');
    data.activeTab = 'study';
    setView('subject', val);
}
function openEditSubjectModal(name){
    document.getElementById('inEditSubName').value = name;
    document.getElementById('editSubOldName').value = name;
    renderSubSettings();
    openModal('modalEditSubject');
}
function editingSub(){ return data.subjects[document.getElementById('editSubOldName').value]; }
function renderSubSettings(){
    const s = editingSub(), box = document.getElementById('subSettingsBody');
    if (!s || !box) return;
    const fsrs = subAlgo(s) === 'fsrs';
    const chip = (on, label, fn) => `<button class="chip${on ? ' on' : ''}" onclick="${fn}">${label}</button>`;
    const lbl = (text, key) => `<div class="set-lbl"><span>${text}${helpBtn(key)}</span></div>`;
    box.innerHTML = `
        <div class="set-sec" style="padding-top:16px;">${lbl('Colore', 'color')}
            <div class="seg">${COLORS.map(c => `<button class="chip${s.color === c ? ' on' : ''}" style="flex:0 0 auto;width:38px;height:32px;padding:0;" onclick="setSubColor('${c}')"><span class="tab-dot" style="background:${c};width:12px;height:12px;"></span></button>`).join('')}</div></div>
        <div class="set-sec">${lbl('Algoritmo di ripasso', 'algo')}
            <div class="seg">${chip(fsrs, 'FSRS (consigliato)', "setSubAlgo('fsrs')")}${chip(!fsrs, 'Anki classico', "setSubAlgo('sm2')")}</div>
            <div class="set-hint">Se cambi, le date già fissate restano: il nuovo metodo vale dal prossimo ripasso.</div></div>
        ${fsrs ? `<div class="set-sec">${lbl('Ritenzione desiderata', 'retention')}
            <div class="seg">${[0.85, 0.9, 0.95].map(v => chip(s.retention === v, Math.round(v * 100) + '%', `setSubRetention(${v})`)).join('')}</div>
            <div class="set-hint">90% va bene quasi sempre.</div></div>
        <div class="set-sec">${lbl("Più ripassi prima dell'esame", 'examBoost')}
            <div class="seg">${chip(s.examBoost !== false, 'Attivo', s.examBoost !== false ? '' : 'toggleSubExamBoost()')}${chip(s.examBoost === false, 'Disattivato', s.examBoost === false ? '' : 'toggleSubExamBoost()')}</div></div>` : ''}`;
}
function setSubAlgo(v){ const s = editingSub(); if (!s) return; s.algo = v; save(); renderSubSettings(); render(); }
function setSubRetention(v){ const s = editingSub(); if (!s) return; s.retention = v; save(); renderSubSettings(); render(); }
function toggleSubExamBoost(){ const s = editingSub(); if (!s) return; s.examBoost = s.examBoost === false; save(); renderSubSettings(); render(); }
function setSubColor(c){ const s = editingSub(); if (!s) return; s.color = c; save(); renderSubSettings(); render(); }
function confirmRenameSubject(){
    const oldName = document.getElementById('editSubOldName').value;
    const newName = document.getElementById('inEditSubName').value.trim();
    if (!newName || newName === oldName) return;
    if (data.subjects[newName]) { showToast('⚠ Nome già esistente'); return; }
    const ns = {};
    Object.keys(data.subjects).forEach(k => { ns[k === oldName ? newName : k] = data.subjects[k]; });
    data.subjects = ns;
    if (data.activeSub === oldName) data.activeSub = newName;
    document.getElementById('editSubOldName').value = newName;
    save(); render(); showToast('✓ Rinominata');
}
function confirmDeleteSubject(){
    const name = document.getElementById('editSubOldName').value, s = data.subjects[name];
    if (!s) return;
    closeModal('modalEditSubject');
    confirmDialog({ title:'Eliminare materia?', msg:`“${name}” con ${plural(s.topics.length, 'argomento', 'argomenti')}, to-do e note verrà eliminata su tutti i dispositivi sincronizzati.` }, () => {
        const snap = snapshot();
        delete data.subjects[name];
        if (data.activeSub === name) { data.activeSub = null; data.isGlobal = true; }
        save(); render(); showToast('✓ Materia eliminata', snap);
    });
}

// ── Date ────────────────────────────────────────────────────────────────────
function openExamDateModal(){
    const s = data.subjects[data.activeSub];
    document.getElementById('inExamDate').value = s && s.examDate ? s.examDate : '';
    document.getElementById('removeExamBtn').classList.toggle('hidden', !(s && s.examDate));
    openModal('modalExamDate');
}
function confirmExamDate(){
    const s = data.subjects[data.activeSub], iso = parseDateInput(document.getElementById('inExamDate').value);
    if (!s) return;
    if (!iso) { showToast('⚠ Scegli una data'); return; }
    s.examDate = iso; s.examModeOverride = false;
    save(); closeModal('modalExamDate'); render();
}
function removeExamDate(){
    const s = data.subjects[data.activeSub];
    if (!s) return;
    s.examDate = null; s.examModeOverride = false; s.examModeManual = false;
    save(); closeModal('modalExamDate'); render(); showToast('✓ Data esame rimossa');
}
function openDateModal(id){
    const t = findTopic(id);
    document.getElementById('editTopicId').value = id;
    document.getElementById('inNewDate').value = t ? t.next : todayStr();
    openModal('modalEditDate');
}
function confirmManualDate(){
    const t = findTopic(document.getElementById('editTopicId').value);
    const iso = parseDateInput(document.getElementById('inNewDate').value);
    if (!t) { closeModal('modalEditDate'); return; }
    if (!iso) { showToast('⚠ Scegli una data'); return; }
    t.next = iso; delete t.requeueAt; delete t.status;
    save(); closeModal('modalEditDate'); refreshCurrent();
}

// ── CSV / Excel ─────────────────────────────────────────────────────────────
function openCsvImport(){
    closeModal('modalSettings');
    const sel = document.getElementById('csvSubjectTarget'), prev = sel.value;
    sel.innerHTML = '<option value="_external">→ Impegni</option>' +
        Object.keys(data.subjects).map(s => `<option value="${escHtml(s)}">→ Argomenti di ${escHtml(s)}</option>`).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    openModal('modalImportCsv');
}
function handleCsvFile(event){
    const file = event.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = e => { document.getElementById('csvRaw').value = e.target.result; openCsvImport(); };
    r.readAsText(file);
    event.target.value = '';
}
function parseCsv(text){
    text = String(text).replace(/^\uFEFF/, '');
    const first = (text.split(/\r?\n/).find(l => l.trim()) || '');
    const cnt = { ',':0, ';':0, '\t':0 };
    let q = false;
    for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch in cnt) cnt[ch]++; }
    const delim = cnt['\t'] ? '\t' : (cnt[';'] >= cnt[','] && cnt[';'] ? ';' : ',');
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
        else if (ch === '"') inQ = true;
        else if (ch === delim) { row.push(field.trim()); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field.trim()); field = '';
            if (row.some(c => c)) rows.push(row);
            row = [];
        } else field += ch;
    }
    row.push(field.trim());
    if (row.some(c => c)) rows.push(row);
    return rows;
}
function importFromCsv(){
    const raw = document.getElementById('csvRaw').value, target = document.getElementById('csvSubjectTarget').value;
    if (!raw.trim()) { showToast('⚠ Nessun contenuto'); return; }
    const snap = snapshot();
    let imported = 0, errors = 0, dupes = 0;
    parseCsv(raw).forEach((cols, idx) => {
        const title = cols[0] || '', iso = parseDateInput(cols[1]);
        if (!iso) { if (idx > 0 || parseDateInput(cols[0]) !== null || !title) errors++; return; }
        if (!title) { errors++; return; }
        const time = parseTimeInput(cols[2]), endTime = parseTimeInput(cols[3]);
        if (target === '_external') {
            if (data.externalEvents.some(e => e.title === title && e.date === iso && (e.time || null) === time)) { dupes++; return; }
            data.externalEvents.push({ id: uid(), title, date: iso, time, endTime });
        } else if (data.subjects[target]) {
            const topics = data.subjects[target].topics;
            if (topics.some(t => t.name === title && t.next === iso)) { dupes++; return; }
            topics.push(newTopic(title, '', iso, 1));
        }
        imported++;
    });
    save(); closeModal('modalImportCsv');
    document.getElementById('csvRaw').value = '';
    render();
    showToast(`✓ Importati ${imported}${dupes ? ` · ${dupes} doppioni saltati` : ''}${errors ? ` · ${errors} righe non valide` : ''}`, imported ? snap : null);
}

// ── Backup JSON ─────────────────────────────────────────────────────────────
function exportData(){
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `studyhub_backup_${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('✓ Backup esportato');
}
function handleImport(event){
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    const r = new FileReader();
    r.onload = e => {
        let imp;
        try { imp = JSON.parse(e.target.result); if (!imp || typeof imp.subjects !== 'object') throw 0; }
        catch (_) { showToast('⚠ File non valido'); return; }
        closeModal('modalSettings');
        confirmDialog({ title:'Sostituire i dati?', msg:`Il backup contiene ${plural(Object.keys(imp.subjects).length, 'materia', 'materie')} e sostituirà tutti i dati attuali, anche sugli altri dispositivi dopo la sync.`, ok:'Importa' }, () => replaceAllData(imp, '✓ Backup importato'));
    };
    r.readAsText(file);
}

// ── Sync: unione per ARGOMENTO ──────────────────────────────────────────────
// Per ogni materia: impostazioni/to-do/note/ordine dalla versione più recente;
// ogni argomento (con il suo storico) dalla sua versione più recente;
// le eliminazioni vincono se più recenti dell'ultima modifica.
const SYNC_KEY = 'studyhub_sync_url';
let syncUrl = localStorage.getItem(SYNC_KEY) || '', syncInProgress = false, lastSyncAt = 0, _autoSyncTimer = null;
function syncPayloadSig(d){ return JSON.stringify({ s: d.subjects, x: d.deleted, e: d.externalEvents, m: d.extMod }); }
function maxTomb(a, b){ const o = { ...(a || {}) }; Object.entries(b || {}).forEach(([k, v]) => { o[k] = Math.max(v, o[k] || 0); }); return o; }
function pruneTombs(o, keep){ const cut = Date.now() - TOMB_TTL; const r = {}; Object.entries(o).forEach(([k, v]) => { if (v > cut && !keep.has(k)) r[k] = v; }); return r; }
function mergeSubject(L, R){
    const base = !L ? R : !R ? L : ((R._mod || 0) > (L._mod || 0) ? R : L);
    const other = base === L ? R : L;
    const dt = maxTomb(L && L.deletedTopics, R && R.deletedTopics);
    const byId = {};
    [base, other].forEach(S => { if (S) S.topics.forEach(t => { const cur = byId[t.id]; if (!cur || (t._mod || 0) > (cur._mod || 0)) byId[t.id] = t; }); });
    const order = base.topics.map(t => t.id);
    if (other) other.topics.forEach(t => { if (!order.includes(t.id)) order.push(t.id); });
    const topics = order.map(id => byId[id]).filter(t => (t._mod || 0) > (dt[t.id] || 0));
    return { ...base, topics, deletedTopics: pruneTombs(dt, new Set(topics.map(t => t.id))), timeLog: mergeTimeLog(L && L.timeLog, R && R.timeLog) };
}
function subjectNewest(s){ return Math.max(s._mod || 0, ...s.topics.map(t => t._mod || 0)); }
function mergeData(local, remoteRaw){
    const remote = normalizeData(JSON.parse(JSON.stringify(remoteRaw || {})));
    const out = { ...local, subjects:{} };
    const tombs = maxTomb(local.deleted, remote.deleted);
    const order = [...Object.keys(local.subjects), ...Object.keys(remote.subjects).filter(n => !(n in local.subjects))];
    order.forEach(n => {
        const m = mergeSubject(local.subjects[n], remote.subjects[n]);
        if (subjectNewest(m) > (tombs[n] || 0)) out.subjects[n] = m;
    });
    out.deleted = pruneTombs(tombs, new Set(Object.keys(out.subjects)));
    if ((remote.extMod || 0) > (local.extMod || 0)) { out.externalEvents = remote.externalEvents; out.extMod = remote.extMod; }
    out.lastModified = Math.max(local.lastModified || 0, remote.lastModified || 0);
    if (out.activeSub && !out.subjects[out.activeSub]) { out.activeSub = null; out.isGlobal = true; }
    return { merged: out, remote };
}
function getSyncStatus(){ return localStorage.getItem('studyhub_sync_status') || 'none'; }
function setSyncStatus(s){ localStorage.setItem('studyhub_sync_status', s); updateSyncBtn(s); }
function updateSyncBtn(status){
    const dot = document.getElementById('syncDot'), lbl = document.getElementById('syncLabel');
    if (!dot || !lbl) return;
    dot.className = 'sync-status-dot';
    if (!syncUrl) { lbl.textContent = 'Sync'; return; }
    if (status === 'syncing') { lbl.textContent = 'Sync…'; dot.classList.add('busy'); }
    else if (status === 'ok') { lbl.textContent = 'Sync'; dot.classList.add('connected'); }
    else if (status === 'error') { lbl.textContent = 'Errore'; dot.classList.add('error'); }
    else lbl.textContent = 'Sync';
}
function syncNow(){ if (!syncUrl) { openSyncModal(); return; } if (!syncInProgress) doSync(false); }
function scheduleAutoSync(){
    if (!syncUrl) return;
    clearTimeout(_autoSyncTimer);
    _autoSyncTimer = setTimeout(() => { if (!syncInProgress) doSync(true); }, 20000);
}
async function doSync(silent){
    if (!syncUrl || syncInProgress) return;
    if (!navigator.onLine) { if (!silent) showToast('⚠ Offline — sync rimandata'); return; }
    syncInProgress = true; setSyncStatus('syncing');
    try {
        const res = await fetch(`${syncUrl}?action=read&t=${Date.now()}`, { method:'GET', cache:'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let remoteRaw;
        try { remoteRaw = await res.json(); } catch (_) { throw new Error('risposta non valida (accesso “Chiunque”?)'); }
        if (remoteRaw && remoteRaw.error) throw new Error(remoteRaw.error);
        const before = syncPayloadSig(data);
        const { merged, remote } = mergeData(data, remoteRaw);
        const changedLocally = syncPayloadSig(merged) !== before;
        data = merged;
        snapshotSigs();
        persist();
        if (changedLocally) renderWhenIdle();
        if (syncPayloadSig(merged) !== syncPayloadSig(remote)) {
            const wr = await fetch(syncUrl, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            if (!wr.ok) throw new Error('scrittura HTTP ' + wr.status);
            let ack = null;
            try { ack = await wr.json(); } catch (_) {}
            if (!ack || !ack.ok) throw new Error((ack && ack.error) || 'scrittura non confermata');
        }
        lastSyncAt = Date.now();
        setSyncStatus('ok');
        if (!silent) showToast(`✓ Sincronizzato — ${new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}`);
    } catch (e) {
        setSyncStatus('error');
        showToast('⚠ Errore sync: ' + (e.message || 'controlla URL'));
    } finally { syncInProgress = false; }
}
function openSyncModal(){
    closeModal('modalSettings');
    const body = document.getElementById('syncModalBody');
    body.innerHTML = syncUrl ? `
        <div class="sync-info-row"><span class="sync-status-dot connected"></span><span class="sync-info-text">${escHtml(syncUrl.length > 54 ? syncUrl.substring(0, 54) + '…' : syncUrl)}</span></div>
        <p class="muted" style="margin-bottom:16px;">Le modifiche vengono unite argomento per argomento: puoi ripassare la stessa materia su telefono e PC senza perdere nulla. Sync automatica 20 s dopo ogni modifica, ogni 5 minuti e al ritorno nell'app.${lastSyncAt ? `<br>Ultima sync: ${new Date(lastSyncAt).toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}` : ''}</p>
        <button class="btn btn-primary" style="margin-bottom:8px;" onclick="closeModal('modalSync');doSync(false)">↻ Sincronizza ora</button>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;"><button class="btn btn-secondary" style="margin:0;" onclick="openVersions()">🕘 Versioni salvate</button>${helpBtn('versions')}</div>
        <div class="btn-row"><button class="btn btn-secondary" onclick="changeSyncUrl()">Cambia URL</button><button class="btn btn-secondary" onclick="disconnectSync()">Disconnetti</button></div>
        <button class="btn btn-secondary" onclick="closeModal('modalSync')">Chiudi</button>` : `
        <p class="muted" style="margin-bottom:14px;">Serve solo se usi l'app su più dispositivi. ${helpBtn('sync')}<br>Incolla qui l'indirizzo dello script Google (lo script è in Impostazioni).</p>
        <input type="text" id="inSyncUrl" placeholder="https://script.google.com/macros/s/…/exec" data-enter="saveSyncUrl">
        <div class="modal-btns"><button class="btn btn-primary" onclick="saveSyncUrl()">Connetti</button><button class="btn btn-secondary" onclick="closeModal('modalSync')">Annulla</button></div>`;
    openModal('modalSync');
}
function changeSyncUrl(){
    document.getElementById('syncModalBody').innerHTML = `<p class="muted" style="margin-bottom:12px;">Nuovo URL:</p>
        <input type="text" id="inSyncUrl" placeholder="https://script.google.com/macros/s/…/exec" data-enter="saveSyncUrl">
        <div class="modal-btns"><button class="btn btn-primary" onclick="saveSyncUrl()">Salva</button><button class="btn btn-secondary" onclick="openSyncModal()">Indietro</button></div>`;
}
function saveSyncUrl(){
    const val = document.getElementById('inSyncUrl').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(val)) { showToast('⚠ URL non valido (script.google.com)'); return; }
    syncUrl = val; localStorage.setItem(SYNC_KEY, syncUrl);
    closeModal('modalSync'); updateSyncBtn('none'); doSync(false);
}
function disconnectSync(){
    syncUrl = ''; localStorage.removeItem(SYNC_KEY); localStorage.removeItem('studyhub_sync_status');
    clearTimeout(_autoSyncTimer);
    closeModal('modalSync'); updateSyncBtn('none'); showToast('✓ Disconnesso');
}
// ── Versioni salvate nel foglio Google (script v3) ──────────────────────────
async function openVersions(){
    const body = document.getElementById('syncModalBody');
    const back = `<button class="btn btn-secondary" onclick="openSyncModal()">Indietro</button>`;
    body.innerHTML = `<p class="muted">Carico le versioni…</p>`;
    try {
        const res = await fetch(`${syncUrl}?action=versions&t=${Date.now()}`, { cache:'no-store' });
        const j = await res.json();
        if (j.error) throw new Error(j.error === 'unknown action' ? 'Lo script non conserva ancora le versioni: aggiornalo alla v3 (Impostazioni → Script).' : j.error);
        const vs = (j.versions || []).slice().reverse();
        body.innerHTML = `<p class="muted" style="margin-bottom:10px;">Lo script conserva l'ultima versione di ogni giorno in cui hai sincronizzato (fino a 30). Ripristinarne una sostituisce i dati su tutti i dispositivi; puoi annullare subito dopo.</p>
            ${vs.length ? vs.map(v => `<div class="ver-row"><span>${fmtDateLong(v.day)} <span class="muted">· ${v.at ? new Date(v.at).toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : ''} · ${Math.max(1, Math.round(v.size / 1024))} KB</span></span><button class="chip" onclick="restoreVersion(${Number(v.row)})">Ripristina</button></div>`).join('')
                        : '<p class="muted">Nessuna versione ancora: la prima viene salvata alla prossima sincronizzazione.</p>'}
            ${back}`;
    } catch (e) {
        body.innerHTML = `<p class="muted" style="margin-bottom:12px;">⚠ ${escHtml(e.message || 'Errore di rete')}</p>${back}`;
    }
}
async function restoreVersion(row){
    try {
        const res = await fetch(`${syncUrl}?action=version&row=${row}&t=${Date.now()}`, { cache:'no-store' });
        const imp = await res.json();
        if (imp.error) throw new Error(imp.error);
        if (!imp || typeof imp.subjects !== 'object') throw new Error('versione non valida');
        closeModal('modalSync');
        confirmDialog({ title:'Ripristinare questa versione?', msg:`Contiene ${plural(Object.keys(imp.subjects).length, 'materia', 'materie')}. Sostituirà i dati attuali su tutti i dispositivi sincronizzati.`, ok:'Ripristina', danger:false }, () => {
            replaceAllData(imp, '✓ Versione ripristinata');
            doSync(true);
        });
    } catch (e) { showToast('⚠ ' + (e.message || 'Errore di rete')); }
}
function replaceAllData(imp, msg){
    const snap = snapshot(), oldNames = Object.keys(data.subjects);
    const ui = { isGlobal: data.isGlobal, activeSub: data.activeSub, activeTab: data.activeTab, globalView: data.globalView };
    data = normalizeData(imp);
    Object.assign(data, ui);
    data = normalizeData(data);
    _sig = {}; oldNames.forEach(nm => { if (!data.subjects[nm]) _sig[nm] = { m:'#', t:{} }; });
    _extSig = '#';
    save(); render(); showToast(msg, snap);
}
function mergeTimeLog(a, b){
    const out = {};
    [a || {}, b || {}].forEach(src => Object.entries(src).forEach(([dev, days]) => {
        const o = out[dev] = out[dev] || {};
        Object.entries(days || {}).forEach(([d, v]) => { o[d] = Math.max(o[d] || 0, Number(v) || 0); });
    }));
    return out;
}

// ── Impostazioni ────────────────────────────────────────────────────────────
const APPS_SCRIPT_CODE = `// Study Hub — sync v3: dati divisi in più celle + una versione al giorno (ultimi 30 giorni)
const SHEET_NAME = 'StudyHub';
const VERSIONS_SHEET = 'Versioni';
const CHUNK = 45000;
const KEEP_VERSIONS = 30;

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'read') return out(readMain());
  if (p.action === 'versions') {
    const sh = getSheet(VERSIONS_SHEET);
    const last = sh.getLastRow();
    const list = [];
    if (last >= 1) {
      sh.getRange(1, 1, last, 3).getValues().forEach(function (r, i) {
        if (r[0] !== '') list.push({ row: i + 1, day: unmark(r[0]), at: unmark(r[1]), size: Number(unmark(r[2])) || 0 });
      });
    }
    return out(JSON.stringify({ versions: list }));
  }
  if (p.action === 'version') {
    const sh = getSheet(VERSIONS_SHEET);
    const row = Number(p.row);
    if (!row || row > sh.getLastRow()) return out(JSON.stringify({ error: 'versione non trovata' }));
    const cols = sh.getLastColumn();
    const cells = cols > 3 ? sh.getRange(row, 4, 1, cols - 3).getValues()[0] : [];
    return out(cells.filter(function (c) { return c !== ''; }).map(unmark).join('') || '{}');
  }
  return out(JSON.stringify({ error: 'unknown action' }));
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = e.postData.contents;
    JSON.parse(body); // valida
    const sheet = getSheet(SHEET_NAME);
    const rows = [];
    for (let i = 0; i < body.length; i += CHUNK) rows.push(['~' + body.substring(i, i + CHUNK)]);
    sheet.clearContents();
    const range = sheet.getRange(1, 1, rows.length, 1);
    range.setNumberFormat('@');
    range.setValues(rows);
    try { saveVersion(body); } catch (verr) { console.error(verr); }
    return out(JSON.stringify({ ok: true, chunks: rows.length }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  } finally {
    lock.releaseLock();
  }
}

function saveVersion(body) {
  const sh = getSheet(VERSIONS_SHEET);
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const row = ['~' + day, '~' + new Date().toISOString(), '~' + body.length];
  for (let i = 0; i < body.length; i += CHUNK) row.push('~' + body.substring(i, i + CHUNK));
  const last = sh.getLastRow();
  let target = last + 1;
  if (last >= 1 && unmark(sh.getRange(last, 1).getValue()) === day) target = last;
  if (sh.getMaxColumns() < row.length) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());
  if (target <= last && sh.getLastColumn() > 0) sh.getRange(target, 1, 1, sh.getLastColumn()).clearContent();
  const range = sh.getRange(target, 1, 1, row.length);
  range.setNumberFormat('@');
  range.setValues([row]);
  const rows = sh.getLastRow();
  if (rows > KEEP_VERSIONS) sh.deleteRows(1, rows - KEEP_VERSIONS);
}

function readMain() {
  const sheet = getSheet(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < 1) return '{}';
  return sheet.getRange(1, 1, last, 1).getValues().map(function (r) { return unmark(r[0]); }).join('') || '{}';
}

function unmark(v) { v = String(v); return v.charAt(0) === '~' ? v.slice(1) : v; }

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function out(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}`;
function openSettings(){ renderSettings(); openModal('modalSettings'); }
function renderSettings(){
    const light = document.body.classList.contains('light');
    const seg = (key, val, label, on) => `<button class="chip${on ? ' on' : ''}" onclick="setSetting('${key}','${val}')">${label}</button>`;
    const lbl = (text, key) => `<div class="set-lbl"><span>${text}${key ? helpBtn(key) : ''}</span></div>`;
    document.getElementById('settingsBody').innerHTML = `
        <div class="set-sec"><button class="btn btn-primary" style="margin-top:0;" onclick="openTutorial()">📖 Guida rapida</button></div>
        <div class="set-sec"><div class="set-lbl"><span>App sul telefono${helpBtn('install')}</span></div>${installSectionHtml()}</div>
        <div class="set-sec">${lbl('Tema')}<div class="seg">${seg('theme','dark','○ Scuro', !light)}${seg('theme','light','◐ Chiaro', light)}</div></div>
        <div class="set-sec">${lbl('I tuoi dati', 'backup')}
            <div class="btn-row">
                <button class="btn btn-secondary" style="margin-top:0;" onclick="exportData()">⬇ Esporta backup</button>
                <button class="btn btn-secondary" style="margin-top:0;" onclick="document.getElementById('importFileInput').click()">⬆ Importa backup</button>
            </div>
            <div class="set-hint">Fai un backup ogni tanto: i dati sono salvati solo su questo dispositivo.</div></div>
        <div class="set-sec">${lbl('Sincronizzazione', 'sync')}
            <button class="btn btn-secondary" style="margin-top:0;" onclick="openSyncModal()">☁ ${syncUrl ? 'Collegata — gestisci' : 'Configura'}</button>
            <div class="set-hint">Solo se usi l'app su più dispositivi.</div></div>
        <div class="set-sec">${lbl('Orientamento schermo', 'orientation')}
            <div class="seg">${seg('orientation','any','Automatico', settings.orientation === 'any')}${seg('orientation','portrait','Verticale', settings.orientation === 'portrait')}${seg('orientation','landscape','Orizzontale', settings.orientation === 'landscape')}</div></div>
        <div class="set-sec">${lbl('Archivia impegni passati dopo', 'archiveDays')}
            <div class="seg">${[7,30,90].map(n => seg('archiveDays', n, n + ' giorni', settings.archiveDays === n)).join('')}${seg('archiveDays', 0, 'Mai', !settings.archiveDays)}</div></div>
        <div class="set-sec">${lbl('Bilanciamento del carico', 'loadBalance')}
            <div class="seg">${seg('loadBalance', 1, 'Attivo', settings.loadBalance)}${seg('loadBalance', 0, 'Disattivato', !settings.loadBalance)}</div></div>
        <div class="set-sec">${lbl('Limite ripassi al giorno', 'dailyMax')}
            <div class="seg">${seg('dailyMax', 0, 'Nessuno', !settings.dailyMax)}${[20, 40, 60, 100].map(n => seg('dailyMax', n, String(n), settings.dailyMax === n)).join('')}</div></div>
        <div class="set-sec">${lbl('Importa da Excel / CSV', 'csv')}
            <button class="btn btn-secondary" style="margin-top:0;" onclick="openCsvImport()">📅 Importa CSV / Excel</button></div>
        <div class="set-sec"><div class="set-lbl"><span>Script Google (v3)${helpBtn('script')}</span><span class="link-action" onclick="toggleScriptBox()">mostra / nascondi</span></div>
            <div id="scriptBox" class="hidden">
                <div class="csv-help">Incollalo su <a href="https://script.google.com" target="_blank" rel="noopener" style="color:var(--accent)">script.google.com</a> e distribuiscilo come App Web (esegui come: Me · accesso: Chiunque). Per aggiornare uno script esistente: Gestisci deployment → Modifica → Nuova versione.</div>
                <textarea readonly onclick="this.select()" class="mono" style="font-size:.62rem;min-height:170px;color:var(--text-mid);">${escHtml(APPS_SCRIPT_CODE)}</textarea>
            </div></div>`;
}
function setSetting(key, val){
    if (key === 'theme') setTheme(val === 'light');
    else if (key === 'orientation') { settings.orientation = val; saveSettings(); applyOrientation(true); }
    else if (key === 'archiveDays') { settings.archiveDays = Number(val); saveSettings(); render(); }
    else if (key === 'loadBalance') { settings.loadBalance = Number(val) === 1; saveSettings(); render(); }
    else if (key === 'dailyMax') { settings.dailyMax = Number(val); saveSettings(); render(); }
    renderSettings();
}
function toggleScriptBox(){ const box = document.getElementById('scriptBox'); if (box) box.classList.toggle('hidden'); }
// ── Guida rapida & aiuto "?" ────────────────────────────────────────────────
const TUTORIAL_KEY = 'studyhub_tutorial_done';
const TUTORIAL = [
    { icon:'👋', title:'Benvenuta!', html:`Study Hub ti dice <b>cosa ripassare e quando</b>, così non dimentichi quello che hai studiato.<br><br>Ti bastano 2 minuti per capire come funziona.` },
    { icon:'📲', title:'Mettila sulla schermata Home', html:`Così si apre come una vera app e i tuoi dati restano al sicuro.<br><br><b>Android:</b> ⚙ Impostazioni → <b>Installa l'app</b>, oppure in Chrome menu <b>⋮</b> → <b>Installa app</b>.<br><b>iPhone:</b> in <b>Safari</b> tasto <b>Condividi</b> ⬆ → <b>Aggiungi alla schermata Home</b>.<br><br>Poi apri sempre l'app dall'icona.` },
    { icon:'➕', title:'1. Crea una materia', html:`Tocca il <b>+</b> nella barra in alto e scrivi il nome, per esempio “Anatomia”.<br><br>Ogni materia ha la sua scheda in alto.` },
    { icon:'📝', title:'2. Dopo aver studiato', html:`Apri la materia → scheda <b>Studio</b> → scrivi l'argomento che hai studiato → <b>Pianifica</b>.<br><br>Il primo ripasso sarà <b>domani</b>.<br><br>Hai il programma d'esame? Usa <b>+ Incolla programma</b> e spunta gli argomenti man mano.` },
    { icon:'🔁', title:'3. Ogni giorno: Ripasso', html:`Apri la scheda <b>Ripasso</b>. Ripeti l'argomento a mente, poi scegli:<br><br>
        <span style="color:var(--danger)"><b>Ripeti</b></span> — non me lo ricordavo<br>
        <span style="color:var(--text-mid)"><b>Incerto</b></span> — ricordato a fatica<br>
        <span style="color:var(--accent)"><b>Da consolidare</b></span> — ricordato bene<br>
        <span style="color:var(--success-bright)"><b>Buono</b></span> — facilissimo<br><br>
        L'app decide da sola quando riproportelo.` },
    { icon:'📅', title:'4. Agenda', html:`Tocca <b>Agenda</b> in alto a sinistra per vedere ripassi e impegni di tutte le materie.<br><br>Dalla vista <b>Ripasso</b> dell'Agenda fai i ripassi di tutte le materie insieme.` },
    { icon:'🎯', title:"5. La data dell'esame", html:`Nella materia tocca <b>Imposta data esame</b>.<br><br>Vedrai il conto alla rovescia e i ripassi si organizzeranno per arrivare pronta. Nella scheda <b>Stat</b> trovi quanto sei preparata.` },
    { icon:'💾', title:'6. I tuoi dati', html:`I dati sono salvati <b>solo su questo telefono</b>.<br><br>Ogni tanto apri <b>⚙ Impostazioni</b> → <b>Esporta backup</b>: se cambi telefono, con <b>Importa backup</b> recuperi tutto.` },
    { icon:'✨', title:'Ultimi consigli', html:`Hai toccato qualcosa per sbaglio? In basso compare <b>Annulla</b>.<br><br>Nelle impostazioni, il tasto <span class="help-btn" style="pointer-events:none;">?</span> spiega cosa fa ogni opzione.<br><br>Puoi rivedere questa guida da <b>⚙ Impostazioni → Guida rapida</b>.` }
];
let _tutStep = 0;
function openTutorial(){ _tutStep = 0; closeModal('modalSettings'); renderTutorial(); openModal('modalTutorial'); }
function renderTutorial(){
    const s = TUTORIAL[_tutStep], last = _tutStep === TUTORIAL.length - 1;
    document.getElementById('tutBody').innerHTML = `
        <div class="tut-icon">${s.icon}</div>
        <div class="modal-title" style="text-align:center;margin-bottom:12px;">${s.title}</div>
        <div class="tut-text">${s.html}</div>
        <div class="tut-dots">${TUTORIAL.map((_, i) => `<span class="${i === _tutStep ? 'on' : ''}"></span>`).join('')}</div>
        <div class="modal-btns">
            ${_tutStep ? `<button class="btn btn-secondary" onclick="tutGo(-1)">Indietro</button>` : `<button class="btn btn-secondary" onclick="finishTutorial()">Salta</button>`}
            <button class="btn btn-primary" onclick="${last ? 'finishTutorial()' : 'tutGo(1)'}">${last ? 'Inizia' : 'Avanti'}</button>
        </div>`;
}
function tutGo(d){ _tutStep = Math.max(0, Math.min(TUTORIAL.length - 1, _tutStep + d)); renderTutorial(); }
function finishTutorial(){ localStorage.setItem(TUTORIAL_KEY, '1'); closeModal('modalTutorial'); }

const HELP = {
    algo:      { t:'Algoritmo di ripasso', b:`È il “metodo” con cui l'app decide <b>quando</b> riproporti un argomento.<br><br><b>FSRS</b> (consigliato): calcola quanto ricordi ogni argomento e te lo ripropone poco prima che tu lo dimentichi.<br><br><b>Anki classico</b>: il metodo tradizionale dell'app Anki. Più prevedibile, un po' meno preciso.<br><br>Nel dubbio, lascia <b>FSRS</b>. Puoi cambiarlo quando vuoi senza perdere nulla.` },
    retention: { t:'Ritenzione desiderata', b:`Quanto vuoi essere sicura di ricordare gli argomenti.<br><br><b>90%</b> — va bene quasi sempre.<br><b>95%</b> — ricordi di più, ma ripassi più spesso.<br><b>85%</b> — ripassi meno, ma rischi di dimenticare qualcosa.` },
    examBoost: { t:'95% in modalità esame', b:`Nell'ultima settimana prima dell'esame (o quando attivi tu la modalità esame) i ripassi diventano più frequenti, così arrivi più preparata. Consigliato lasciarlo attivo.` },
    color:     { t:'Colore', b:`Il colore della materia nelle schede e nel calendario. Serve solo a riconoscerla a colpo d'occhio.` },
    orientation:{ t:'Orientamento schermo', b:`Blocca lo schermo in verticale o in orizzontale, così non gira quando inclini il telefono.<br><br>Funziona solo se hai messo l'app sulla schermata Home (Android). Su computer non serve.` },
    archiveDays:{ t:'Archivia impegni passati', b:`Gli impegni già passati spariscono dal calendario dopo questi giorni, così resta in ordine.<br><br><b>Non vengono cancellati</b>: li ritrovi scrivendo nella barra di ricerca dell'Agenda.` },
    loadBalance:{ t:'Bilanciamento del carico', b:`Evita giornate con troppi ripassi: quando due giorni vanno bene uguale, l'app sceglie quello più libero.<br><br>Lascialo <b>Attivo</b>.` },
    dailyMax:  { t:'Limite ripassi al giorno', b:`Il numero massimo di ripassi che vuoi in un giorno. Se un giorno è già pieno, l'app anticipa un po' alcuni ripassi (non li rimanda mai, per non farti dimenticare).<br><br><b>Nessuno</b> = nessun limite. Se non sai, lascia così.` },
    sync:      { t:'Sincronizzazione', b:`Serve <b>solo</b> se usi l'app su più dispositivi (per esempio telefono e computer) e vuoi gli stessi dati su entrambi.<br><br>Richiede un foglio Google da preparare una volta: fatti aiutare da chi ti ha passato l'app.<br><br>Se usi un solo telefono, <b>non ti serve</b>: basta fare ogni tanto il backup.` },
    backup:    { t:'Backup', b:`<b>Esporta backup</b> scarica un file con tutti i tuoi dati. Conservalo (per esempio su Google Drive o inviatelo per email).<br><br><b>Importa backup</b> carica quel file e riporta tutto com'era: utile se cambi telefono o se il browser cancella i dati.<br><br>Fallo ogni settimana o due.` },
    csv:       { t:'Importa da Excel', b:`Per aggiungere tanti impegni o argomenti in una volta da un foglio Excel.<br><br>Il foglio deve avere le colonne: <b>Titolo</b>, <b>Data</b> (GG/MM/AAAA) e, se vuoi, <b>Ora</b>. In Excel: File → Salva come → <b>CSV</b>.` },
    script:    { t:'Script Google', b:`È il codice da copiare in Google per attivare la sincronizzazione. Ti serve solo se la stai configurando: altrimenti ignoralo.` },
    install:   { t:"Installare l'app", b:`Installata, Study Hub si apre dalla schermata Home come un'app vera: niente barra di Chrome, e se la chiudi per sbaglio non perdi nulla (nemmeno il timer).<br><br>Usa il pulsante <b>Installa l'app</b>. Se non funziona, lo stesso pulsante ti dice cosa fare.` },
    ytmode:    { t:'Musica da YouTube', b:`<b>App YouTube</b> (consigliato): quando avvii lo studio si apre l'app YouTube con la tua playlist. Con <b>YouTube Premium</b> la musica continua anche se esci o spegni lo schermo. Poi torna qui: il timer è andato avanti da solo.<br><br><b>Dentro Study Hub</b>: la musica suona dentro l'app, ma si ferma appena esci o spegni lo schermo. Il motivo: YouTube non permette di usare Premium nei video inseriti in altre app.` },
    versions:  { t:'Versioni salvate', b:`Con la sincronizzazione attiva, Google conserva una copia dei tuoi dati per ogni giorno (fino a 30 giorni).<br><br>Se qualcosa va storto, scegli un giorno e tocca <b>Ripristina</b> per tornare a com'era.` }
};
// ── Installazione come app ──────────────────────────────────────────────────
let _installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _installEvt = e; refreshInstallUi(); });
window.addEventListener('appinstalled', () => { _installEvt = null; showToast('✓ App installata: aprila dalla schermata Home'); refreshInstallUi(); });
function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true; }
function isIOS(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
function refreshInstallUi(){
    if (!document.getElementById('modalSettings').classList.contains('hidden')) renderSettings();
    if (data.isGlobal) { const b = document.getElementById('installBanner'); if (b) b.outerHTML = installBannerHtml(); }
}
function installBannerHtml(){
    if (isStandalone() || !_installEvt || localStorage.getItem('studyhub_install_dismissed')) return '<div id="installBanner"></div>';
    return `<div id="installBanner" class="card welcome" style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:1.6rem;">📲</span>
        <span style="flex:1;font-size:.84rem;line-height:1.45;">Installa Study Hub sul telefono: si apre come un'app e il timer non si perde.</span>
        <button class="btn btn-primary btn-small" onclick="installApp()">Installa</button>
        <span class="link-action" onclick="localStorage.setItem('studyhub_install_dismissed','1');refreshInstallUi()" title="Non mostrare più">✕</span>
    </div>`;
}
async function installApp(){
    if (!_installEvt) { openInstallCheck(); return; }
    try { _installEvt.prompt(); await _installEvt.userChoice; } catch (_) {}
    _installEvt = null; refreshInstallUi();
}
function installSectionHtml(){
    if (isStandalone()) return `<div class="set-hint" style="margin-top:0;color:var(--success-bright);">✓ Stai usando l'app installata.</div>`;
    return `<button class="btn btn-${_installEvt ? 'primary' : 'secondary'}" style="margin-top:0;" onclick="installApp()">📲 Installa l'app</button>
        <div class="set-hint">${_installEvt ? 'Un tocco e la trovi sulla schermata Home.' : "Non si installa? Tocca il pulsante: ti dico cosa fare e controllo se qualcosa non va."}</div>`;
}
async function openInstallCheck(){
    closeModal('modalSettings');
    document.getElementById('helpTitle').textContent = 'Installare l\'app';
    const body = document.getElementById('helpBody');
    body.innerHTML = '<p>Controllo in corso…</p>';
    openModal('modalHelp');
    const rows = [];
    const ok = (good, text, fix) => rows.push(`<div class="chk-row"><span class="${good ? 'ok' : 'ko'}">${good ? '✓' : '✗'}</span><span>${text}${!good && fix ? `<br><span class="muted">${fix}</span>` : ''}</span></div>`);
    ok(location.protocol === 'https:', 'Indirizzo sicuro (https)', "Apri l'app dal link https di GitHub Pages.");
    let man = null;
    try {
        const link = document.querySelector('link[rel="manifest"]');
        const r = await fetch(link.href, { cache:'no-store' });
        man = r.ok ? await r.json() : null;
    } catch (_) {}
    ok(!!man, 'File manifest.webmanifest presente', 'Carica manifest.webmanifest nella stessa cartella di index.html su GitHub.');
    if (man) {
        let iconsOk = true;
        for (const ic of (man.icons || [])) {
            try { const r = await fetch(new URL(ic.src, new URL('manifest.webmanifest', location.href)).href, { cache:'no-store' }); if (!r.ok) iconsOk = false; } catch (_) { iconsOk = false; }
        }
        ok(iconsOk && (man.icons || []).length >= 2, 'Icone presenti', 'Carica icon-192.png, icon-512.png e icon-maskable-512.png accanto a index.html.');
    }
    let sw = false;
    try { const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration(); sw = !!(reg && (reg.active || reg.waiting || reg.installing)); } catch (_) {}
    ok(sw, 'Service worker attivo', 'Carica sw.js accanto a index.html, poi ricarica la pagina due volte.');
    const steps = isIOS()
        ? `<b>Su iPhone</b> usa <b>Safari</b> (non Chrome): tasto <b>Condividi</b> ⬆ → <b>Aggiungi alla schermata Home</b>.`
        : `<b>Su Android</b> usa <b>Chrome</b>: menu <b>⋮</b> in alto a destra → <b>Installa app</b>.<br><br>
           Se vedi solo <b>Aggiungi a schermata Home</b>, quella crea un semplice collegamento che si apre come scheda di Chrome. In quel caso ricarica la pagina, aspetta qualche secondo e riapri il menu.`;
    body.innerHTML = `${rows.join('')}
        <div style="margin-top:16px;">${steps}</div>
        <div style="margin-top:14px;"><b>Avevi già un'icona sulla schermata Home che apre una scheda di Chrome?</b> È un vecchio collegamento: eliminala e installa di nuovo come spiegato qui sopra.</div>
        ${_installEvt ? `<button class="btn btn-primary" style="margin-top:16px;" onclick="closeModal('modalHelp');installApp()">📲 Installa ora</button>` : ''}`;
}
function helpBtn(key){ return `<button class="help-btn" onclick="event.stopPropagation();showHelp('${key}')" aria-label="Aiuto">?</button>`; }
function showHelp(key){
    const h = HELP[key];
    if (!h) return;
    document.getElementById('helpTitle').textContent = h.t;
    document.getElementById('helpBody').innerHTML = h.b;
    openModal('modalHelp');
}

// ── Eventi globali ──────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const open = [...document.querySelectorAll('.modal-overlay:not(.hidden)')].pop();
        if (open) closeModal(open.id);
        return;
    }
    if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.enter) {
        e.preventDefault();
        const fn = window[e.target.dataset.enter];
        if (typeof fn === 'function') fn();
        return;
    }
    const inReview = data.isGlobal ? data.globalView === 'mixed' && !agendaQuery.trim() : data.activeTab === 'ripasso';
    if (inReview && !isTyping() && !anyModalOpen() && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const map = { '1':'ripeti', '2':'incerto', '3':'consolida', '4':'buono' };
        if (map[e.key]) {
            let first = null;
            if (data.isGlobal) { const x = mixedQueue()[0]; if (x) first = { id: x.t.id, name: x.name }; }
            else { const sub = data.subjects[data.activeSub], t = sub && dueTopics(sub, data.activeSub)[0]; if (t) first = { id: t.id, name: data.activeSub }; }
            if (first) { e.preventDefault(); rate(first.id, map[e.key], first.name); }
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTyping() && _undoSnap) { e.preventDefault(); undoLast(); }
});
document.addEventListener('focusout', flushPendingRender);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { savePomoState(); return; }
    if (pomodoroRunning) pomoTick();
    if (syncUrl && !syncInProgress && Date.now() - lastSyncAt > 60000) doSync(true);
    if (settings.orientation !== 'any') applyOrientation(false);
});
window.addEventListener('online', () => { if (syncUrl) doSync(true); });

// ── Avvio ───────────────────────────────────────────────────────────────────
let _lastDay = todayStr();
function init(){
    if (localStorage.getItem('studyhub_theme') === 'light') document.body.classList.add('light');
    applyThemeIcon();
    document.querySelectorAll('.modal-overlay').forEach(m => {
        let downOnBackdrop = false;
        m.addEventListener('mousedown', e => { downOnBackdrop = e.target === m; });
        m.addEventListener('click', e => { if (e.target === m && downOnBackdrop) closeModal(m.id); });
    });
    restorePomoState();
    render();
    updateSyncBtn(getSyncStatus());
    applyOrientation(false);
    if (!localStorage.getItem(TUTORIAL_KEY)) {
        if (Object.keys(data.subjects).length) localStorage.setItem(TUTORIAL_KEY, '1');   // chi usa già l'app non la rivede
        else setTimeout(openTutorial, 400);
    }
    if (_loadError) showToast('⚠ Dati locali illeggibili — copia salvata, ripristina da sync o backup');
    if (syncUrl) setTimeout(() => doSync(true), 1500);
    setInterval(() => {
        if (syncUrl && !syncInProgress && document.visibilityState === 'visible') doSync(true);
    }, 5 * 60 * 1000);
    // A mezzanotte (app lasciata aperta) aggiorna ripassi e calendario
    setInterval(() => { const d = todayStr(); if (d !== _lastDay) { _lastDay = d; renderWhenIdle(); } }, 60 * 1000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW non registrato:', err));
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
function saveSubTopicTodo(){ saveSubTopic(false); }
