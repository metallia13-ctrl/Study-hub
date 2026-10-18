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
    nota:      { label:'Nota',           color:'var(--warning)' }
};

// ── Utility ─────────────────────────────────────────────────────────────────
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
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
    try { return Object.assign({ orientation:'any', archiveDays:30 }, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
    catch (_) { return { orientation:'any', archiveDays:30 }; }
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
        if (typeof s._mod !== 'number') s._mod = fb;
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
            if (!t.next) t.next = todayStr();
            if (!Array.isArray(t.history)) t.history = [];
            t.archived = !!t.archived;
            if (typeof t._mod !== 'number') t._mod = s._mod;
        });
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
    target.innerHTML = `
        <div class="search"><input type="search" id="agendaSearch" placeholder="Cerca impegni e argomenti (anche archiviati)…" value="${escHtml(agendaQuery)}" oninput="onAgendaSearch(this.value)"></div>
        <div id="agendaControls">
            <div class="view-toggle">${vb('today','Oggi')}${vb('dayview','Giorno')}${vb('week','Settimana')}${vb('month','Mese')}</div>
            <div class="filter-bar">
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
    if (cold) cold.classList.toggle('hidden', searching);
    if (searching) return renderSearchResults(area);
    if (data.globalView === 'today') renderTodayWidget(area);
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
        { type:'ripasso', id:t.id, name:t.name, subject:`${s} · prossimo ${fmtDateShort(t.next)}`, color:topicColor(t, data.subjects[s]), time:null },
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
    let due = sub.topics.filter(t => t.next <= today);
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
    const dueN = dueTopics(sub, name).length;
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
                <button class="chip warn" onclick="applyImprevisto()">⚠ Imprevisto +1g</button>
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
        if (ytPlaylistUrl) ensureYTPlayer(false);
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
function triageBoxHtml(active, handler){
    const dot = (n, label, bg, fg) => `<div class="t-dot ${active === n ? 'active' : ''}" style="background:${bg};color:${fg}" onclick="${handler(n)}">${label}</div>`;
    return `<div class="triage-box">${dot(1,'Base','var(--success)','#000')}${dot(2,'Complesso','var(--warning)','#000')}${dot(3,'Esame','var(--danger)','#fff')}</div>`;
}
function renderStudyTab(target){
    target.innerHTML = `<div class="card">
        <div class="section-label">Nuovo argomento studiato</div>
        <div id="studyTriage">${triageBoxHtml(data.triage, n => `setTriage(${n})`)}</div>
        <input type="text" id="inT" placeholder="Nome argomento" onkeydown="if(event.key==='Enter')addTopic()">
        <textarea id="inN" placeholder="Note (facoltative)…"></textarea>
        <button class="btn btn-primary" onclick="addTopic()">Pianifica — primo ripasso domani</button>
    </div>`;
}
function setTriage(n){
    data.triage = n;
    const box = document.getElementById('studyTriage');
    if (box) box.innerHTML = triageBoxHtml(n, k => `setTriage(${k})`);
    save();
}
function newTopic(name, notes, next, triage){
    return { id: uid(), name, notes: notes || '', next, interval: 1, easeFactor: 2.5, triage: triage || 1,
             repeats: 0, history: [], archived: false, created: todayStr() };
}
function addTopic(){
    const inT = document.getElementById('inT'), inN = document.getElementById('inN');
    const name = inT.value.trim();
    if (!name) { inT.focus(); return; }
    data.subjects[data.activeSub].topics.push(newTopic(name, inN.value, shiftDate(todayStr(), 1), data.triage));
    save();
    inT.value = ''; inN.value = '';
    showToast('✓ Registrato — ripasso domani');
}

// ── SM-2 ────────────────────────────────────────────────────────────────────
function srsCompute(t, q){
    const ef = t.easeFactor || 2.5, iv = t.interval || 1;
    if (q === 'ripeti')    return { interval: 1, ef: Math.max(1.3, r2(ef - 0.2)) };
    if (q === 'incerto')   return { interval: iv <= 1 ? 1 : Math.max(2, Math.round(iv * 1.2)), ef: Math.max(1.3, r2(ef - 0.15)) };
    if (q === 'consolida') return { interval: iv <= 1 ? 3 : Math.max(iv + 1, Math.round(iv * Math.max(1.3, ef - 0.15))), ef };
    return { interval: iv <= 1 ? 4 : Math.max(iv + 1, Math.round(iv * ef)), ef: Math.min(3.0, r2(ef + 0.05)) };
}
function srsLabel(t, q){ if (q === 'ripeti') return 'oggi'; const i = srsCompute(t, q).interval; return i === 1 ? 'domani' : i + 'gg'; }

// ── Ripasso (con feedback giornaliero) ──────────────────────────────────────
function renderRipassoTab(target, sub){
    const examM = isExamModeFinal(data.activeSub);
    const due = dueTopics(sub, data.activeSub);
    if (!due.length) {
        const upcoming = sub.topics.filter(t => !(examM && t.triage !== 3) && t.next > todayStr()).map(t => t.next).sort();
        const next = upcoming[0];
        const nNext = next ? upcoming.filter(d => d === next).length : 0;
        target.innerHTML = `<div class="card empty"><span class="big">✓</span>Sessione completata${examM ? ' · modalità esame' : ''}
            ${next ? `<div style="margin-top:8px;">Prossimo ripasso: <b style="color:var(--text);">${dueLabel(next).t}</b> · ${plural(nNext, 'argomento', 'argomenti')}</div>` : ''}</div>`;
        return;
    }
    const today = todayStr();
    target.innerHTML = `<div class="muted" style="margin-bottom:10px;">${plural(due.length, 'argomento', 'argomenti')} da ripassare</div>` +
        due.map(t => {
            const col = topicColor(t, sub), id = jsArg(t.id);
            const requeued = t.requeueAt && localDateStr(new Date(t.requeueAt)) === today;
            const late = daysFromToday(t.next);
            const btn = (q, key) => `<button class="rate-btn" style="--rc:${Q_INFO[q].color}" onclick="rate(${id},'${q}')"><span class="rate-lbl">${Q_INFO[q].label}</span><span class="rate-iv">${srsLabel(t, q)}</span><span class="rate-key">${key}</span></button>`;
            return `<div class="review-card${requeued ? ' requeued' : ''}" style="--c:${col}" id="rc-${escHtml(t.id)}">
                <div class="review-name">${escHtml(t.name)}</div>
                <div class="review-meta">Intervallo ${t.interval}g · ${plural(t.history.filter(h => h.q !== 'reset' && h.q !== 'nota').length, 'ripasso', 'ripassi')}${late < 0 ? ` · <span class="rep">in ritardo ${-late}g</span>` : ''}${t.repeats ? ` · <span class="rep">ripetuto ${t.repeats}✕</span>` : ''}${requeued ? ' · in coda' : ''}</div>
                <input type="text" class="fb-input" id="fb-${escHtml(t.id)}" placeholder="Feedback di oggi (facoltativo)…" autocomplete="off">
                ${notesBlockHtml(t)}
                <div class="rate-grid">${btn('ripeti','1')}${btn('incerto','2')}${btn('consolida','3')}${btn('buono','4')}</div>
            </div>`;
        }).join('');
}
function notesBlockHtml(t, open){
    const id = escHtml(t.id);
    return `<span class="notes-toggle" onclick="toggleNotes(${jsArg(t.id)})">▸ Note${t.notes ? ' •' : ''}</span>
        <div id="nb-${id}" class="notes-content${open ? '' : ' hidden'}">
            <textarea id="nt-${id}">${escHtml(t.notes)}</textarea>
            <button class="btn btn-secondary btn-small" onclick="saveNote(${jsArg(t.id)})">Salva note</button>
        </div>`;
}
function findTopic(id){
    const sub = data.subjects[data.activeSub];
    return sub ? sub.topics.find(x => x.id === id) : null;
}
function pushHistory(t, entry){
    t.history.push(entry);
    if (t.history.length > HISTORY_CAP) t.history.splice(0, t.history.length - HISTORY_CAP);
}
function rate(id, q){
    const t = findTopic(id);
    if (!t) return;
    const snap = snapshot();
    const fbEl = document.getElementById(`fb-${id}`);
    const note = fbEl ? fbEl.value.trim() : '';
    const r = srsCompute(t, q);
    t.interval = r.interval;
    t.easeFactor = r.ef;
    const entry = { d: todayStr(), ts: Date.now(), q, iv: t.interval };
    if (note) entry.note = note;
    pushHistory(t, entry);
    if (q === 'ripeti') { t.repeats += 1; t.requeueAt = Date.now(); }
    else { t.next = shiftDate(todayStr(), t.interval); delete t.requeueAt; }
    save();
    refreshTab();
    showToast(q === 'ripeti' ? `↻ “${t.name}” in fondo alla coda` : `✓ ${Q_INFO[q].label} · ${t.interval === 1 ? 'domani' : 'tra ' + t.interval + 'gg'}${note ? ' · feedback salvato' : ''}`, snap);
}
function toggleNotes(id){ const el = document.getElementById(`nb-${id}`); if (el) el.classList.toggle('hidden'); }
function saveNote(id){
    const t = findTopic(id), area = document.getElementById(`nt-${id}`);
    if (!t || !area) return;
    t.notes = area.value; save(); showToast('✓ Note salvate');
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
function renderHistoryTab(target, sub){
    target.innerHTML = `
        <div class="search"><input type="search" id="archSearch" placeholder="Cerca in nome, note e feedback (anche archiviati)…" value="${escHtml(archQuery)}" oninput="onArchSearch(this.value)"></div>
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
    let pool = examM ? sub.topics.filter(t => t.triage === 3) : sub.topics;
    const archivedN = pool.filter(t => t.archived).length;
    const items = q ? pool.filter(t => topicMatches(t, q)) : pool.filter(t => !t.archived);
    list.innerHTML = '';
    items.forEach(t => list.appendChild(buildArchItem(t, sub, !q)));
    if (!items.length) list.innerHTML = `<div class="card empty">${q ? `Nessun argomento trovato per “${escHtml(archQuery.trim())}”` : (sub.topics.length ? 'Tutti gli argomenti sono archiviati' : 'Nessun argomento — registrane uno in Studio')}</div>`;
    foot.textContent = q ? '' : (archivedN ? `${plural(archivedN, 'argomento archiviato', 'argomenti archiviati')} — usa la ricerca per vederli` : (items.length > 1 ? 'Trascina ⠿ per riordinare' : ''));
}
function buildArchItem(t, sub, draggable){
    const el = document.createElement('div');
    el.className = `arch-item draggable-item${expandedTopics.has(t.id) ? ' open' : ''}${t.archived ? ' is-archived' : ''}`;
    el.dataset.id = t.id;
    el.style.setProperty('--c', topicColor(t, sub));
    fillArchItem(el, t);
    if (draggable) attachDrag(el, t);
    return el;
}
function fillArchItem(el, t){
    const open = expandedTopics.has(t.id), due = dueLabel(t.next), id = jsArg(t.id);
    el.classList.toggle('open', open);
    el.innerHTML = `<div class="topic-row" onclick="toggleArch(${id})">
            <span class="drag-handle" onclick="event.stopPropagation()" title="Trascina per riordinare">⠿</span>
            <span class="tr-name">${escHtml(t.name)}</span>
            ${t.archived ? '<span class="badge">archiviato</span>' : ''}
            ${t.repeats ? `<span class="tr-due late">${t.repeats}✕</span>` : ''}
            <span class="tr-due ${due.c}">${due.t}</span>
            <span class="tr-chev">›</span>
        </div>
        ${open ? `<div class="topic-detail">${archDetailHtml(t)}</div>` : ''}`;
}
function archDetailHtml(t){
    const id = jsArg(t.id);
    const hist = [...t.history].reverse();
    const showAll = expandedHist.has(t.id), shown = showAll ? hist : hist.slice(0, 8);
    const histHtml = hist.length ? `<div class="hist">${shown.map(h => {
            const qi = Q_INFO[h.q] || Q_INFO.nota;
            return `<div class="hist-item" style="--hc:${qi.color}">
                <div class="hist-head"><span class="hist-q">${qi.label}</span><span>${fmtDateLong(h.d)}</span>${h.iv && h.q !== 'reset' && h.q !== 'nota' ? `<span>→ ${h.iv === 1 && h.q !== 'ripeti' ? 'domani' : h.q === 'ripeti' ? 'stesso giorno' : h.iv + 'gg'}</span>` : ''}
                    <span class="hist-edit" onclick="editHistNote(${id},${h.ts})" title="${h.note ? 'Modifica' : 'Aggiungi'} feedback">✎</span></div>
                ${h.note ? `<div class="hist-note">${escHtml(h.note)}</div>` : ''}
            </div>`;
        }).join('')}</div>${hist.length > shown.length ? `<div class="hist-more" onclick="toggleHistAll(${id})">Mostra tutti (${hist.length})</div>` : (showAll && hist.length > 8 ? `<div class="hist-more" onclick="toggleHistAll(${id})">Mostra meno</div>` : '')}`
        : `<div class="muted" style="margin-bottom:14px;">Nessun ripasso registrato. Il feedback che scrivi in Ripasso apparirà qui, giorno per giorno.</div>`;
    return `
        <div class="kv">
            <div><b>${fmtDateShort(t.next)}</b><span>Prossimo</span></div>
            <div><b>${t.interval}g</b><span>Intervallo</span></div>
            <div><b>${t.easeFactor.toFixed(2)}</b><span>Facilità</span></div>
            <div><b>${t.repeats}</b><span>Ripetuto</span></div>
        </div>
        <div class="set-lbl">Priorità</div>
        ${triageBoxHtml(t.triage, n => `updateTriageInHistory(${id},${n})`)}
        ${notesBlockHtml(t, !!t.notes)}
        <div class="set-lbl" style="margin-top:18px;">Storico ripassi <span class="link-action" onclick="addFreeNote(${id})">+ nota</span></div>
        ${histHtml}
        <div class="detail-actions" style="margin-top:16px;">
            <button class="chip" onclick="openDateModal(${id})">Ripianifica</button>
            <button class="chip" onclick="resetTopic(${id})">↺ Reset completo</button>
            <button class="chip" onclick="toggleArchiveTopic(${id})">${t.archived ? '⤒ Ripristina' : '⤓ Archivia'}</button>
            <button class="chip warn" onclick="deleteTopic(${id})">Elimina</button>
        </div>
        ${t.created ? `<div class="muted" style="margin-top:12px;font-size:.62rem;">Registrato il ${fmtDate(t.created)}</div>` : ''}`;
}
function rerenderArchItem(id){
    const el = [...document.querySelectorAll('#historyList .arch-item')].find(x => x.dataset.id === id);
    const t = findTopic(id);
    if (el && t) { fillArchItem(el, t); el.style.setProperty('--c', topicColor(t, data.subjects[data.activeSub])); }
    else renderArchList();
}
function toggleArch(id){
    if (expandedTopics.has(id)) expandedTopics.delete(id); else expandedTopics.add(id);
    rerenderArchItem(id);
}
function toggleHistAll(id){ if (expandedHist.has(id)) expandedHist.delete(id); else expandedHist.add(id); rerenderArchItem(id); }
function attachDrag(card, t){
    const handle = card.querySelector('.drag-handle');
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
        const list = card.parentNode, all = [...list.querySelectorAll('.draggable-item')];
        const fromIdx = all.indexOf(dragSrc), toIdx = all.indexOf(card);
        const topics = data.subjects[data.activeSub].topics;
        const srcT = topics.find(x => x.id === dragSrc.dataset.id), dstT = topics.find(x => x.id === card.dataset.id);
        if (!srcT || !dstT) return;
        topics.splice(topics.indexOf(srcT), 1);
        let di = topics.indexOf(dstT);
        if (fromIdx < toIdx) di += 1;
        topics.splice(di, 0, srcT);
        save();
        list.insertBefore(dragSrc, fromIdx < toIdx ? card.nextSibling : card);
        dragSrc = null;
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
    if (t) { if (expand) expandedTopics.add(t.id); if (t.archived) archQuery = t.name; }
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

// Feedback: modifica di una voce dello storico, o nota libera di oggi
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
    t.next = shiftDate(todayStr(), 1);
    delete t.requeueAt;
    pushHistory(t, { d: todayStr(), ts: Date.now(), q: 'reset', iv: 1 });
}
function resetTopic(id){
    const t = findTopic(id);
    if (!t) return;
    confirmDialog({
        title: 'Reset completo?',
        msg: `“${t.name}” ripartirà da zero come appena studiato: intervallo 1 giorno, facilità 2,50, ripetizioni azzerate, primo ripasso domani. Lo storico dei feedback resta.`,
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
        msg: `Tutti i ${sub.topics.length} argomenti di “${data.activeSub}” ripartiranno da zero (intervallo 1g, facilità 2,50, ripetizioni azzerate, ripasso domani). Lo storico resta.`,
        ok: 'Reset tutto'
    }, () => {
        const snap = snapshot();
        sub.topics.forEach(applyFullReset); save(); refreshTab();
        showToast(`✓ ${plural(sub.topics.length, 'argomento resettato', 'argomenti resettati')}`, snap);
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
    confirmDialog({ title:'Eliminare argomento?', msg:`“${t.name}” e il suo storico verranno eliminati.` }, () => {
        const snap = snapshot();
        const sub = data.subjects[data.activeSub];
        sub.topics = sub.topics.filter(x => x.id !== id);
        expandedTopics.delete(id);
        save(); refreshTab(); showToast('✓ Argomento eliminato', snap);
    });
}
function applyImprevisto(){
    const today = todayStr(), sub = data.subjects[data.activeSub];
    const due = sub.topics.filter(t => t.next <= today);
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
function sessionCounts(sub){
    const counts = { ...sub.sessionLog };   // log delle versioni precedenti
    const fromHist = {};
    sub.topics.forEach(t => t.history.forEach(h => { if (h.q !== 'reset' && h.q !== 'nota') fromHist[h.d] = (fromHist[h.d] || 0) + 1; }));
    Object.keys(fromHist).forEach(d => { counts[d] = Math.max(counts[d] || 0, fromHist[d]); });
    return counts;
}
function renderStats(target, sub){
    const topics = sub.topics, total = topics.length;
    if (!total) { target.innerHTML = `<div class="card empty">Nessun argomento registrato</div>`; return; }
    const today = todayStr();
    const acquired = topics.filter(t => t.interval >= 8).length;
    const uncertain = topics.filter(t => t.interval > 1 && t.interval < 8).length;
    const critical = topics.filter(t => t.repeats >= 2).length;
    const dueToday = topics.filter(t => t.next <= today).length;
    const examCount = topics.filter(t => t.triage === 3).length;
    const archived = topics.filter(t => t.archived).length;
    const pct = n => Math.round((n / total) * 100);
    const log = sessionCounts(sub), days = [], counts = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days.push(d.getDate() + '/' + (d.getMonth() + 1));
        counts.push(log[localDateStr(d)] || 0);
    }
    const maxCount = Math.max(...counts, 1), week = counts.slice(7).reduce((a, b) => a + b, 0);
    const bars = counts.map((c, i) => `<div class="session-bar${i === 13 ? ' today' : ''}" style="height:${Math.max(3, Math.round((c / maxCount) * 60))}px;" title="${days[i]}: ${c} ripassi"></div>`).join('');
    const labels = days.map((d, i) => `<div class="session-label">${i % 2 === 1 ? d : ''}</div>`).join('');
    target.innerHTML = `
        <div class="card">
            <div class="section-label">Panoramica${archived ? `<span>${archived} archiviati</span>` : ''}</div>
            <div class="stat-grid">
                <div class="stat-box"><div class="stat-number">${total}</div><div class="stat-label">Totale</div></div>
                <div class="stat-box"><div class="stat-number" style="color:var(--warning)">${dueToday}</div><div class="stat-label">Da ripassare</div></div>
                <div class="stat-box"><div class="stat-number" style="color:var(--success-bright)">${acquired}</div><div class="stat-label">Acquisiti</div></div>
                <div class="stat-box"><div class="stat-number" style="color:var(--danger)">${critical}</div><div class="stat-label">Critici</div></div>
            </div>
        </div>
        <div class="card">
            <div class="section-label">Distribuzione</div>
            ${[['Acquisiti (≥8g)',acquired,'var(--success-bright)'],['In consolidamento',uncertain,'var(--accent)'],['Priorità esame',examCount,'var(--exam-color)'],['Critici (≥2 Ripeti)',critical,'var(--danger)']].map(([l, n, c]) => `
            <div class="progress-bar-wrap">
                <div class="progress-label"><span>${l}</span><span>${n}/${total} · ${pct(n)}%</span></div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct(n)}%;background:${c}"></div></div>
            </div>`).join('')}
        </div>
        <div class="card">
            <div class="section-label">Ripassi — ultime 2 settimane <span>${week} questa settimana</span></div>
            <div class="session-bar-wrap">${bars}</div>
            <div class="session-labels">${labels}</div>
        </div>
        <div class="card">
            <div class="section-label">Zona pericolosa</div>
            <p class="muted" style="margin-bottom:4px;">Riporta tutti gli argomenti della materia allo stato iniziale. Lo storico dei feedback resta.</p>
            <button class="btn btn-secondary" style="color:var(--danger);" onclick="resetAllTopics()">↺ Reset completo di tutti gli argomenti</button>
        </div>`;
}

// ── Pomodoro (basato sull'orario reale) ─────────────────────────────────────
const POMO_KEY = 'studyhub_pomo', POMO_SESS_KEY = 'studyhub_pomo_sessions';
let pomoCfg = (() => { try { return JSON.parse(localStorage.getItem(POMO_KEY)) || {}; } catch (_) { return {}; } })();
let pomodoroStudyMins = pomoCfg.study || 25, pomodoroBreakMins = pomoCfg.brk || 5;
let pomodoroSeconds = pomodoroStudyMins * 60;
let pomodoroRunning = false, pomodoroBreak = false, pomodoroTimer = null, pomoEndAt = 0;
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
function renderPomodoro(){
    const rem = pomoRemaining(), offset = POMO_C * (1 - rem / pomoTotal());
    const hasYT = ytPlaylistUrl.trim().length > 0;
    const stepper = (type, val, step) => `<div class="stepper"><button onclick="setPomoDuration('${type}',-${step})">−</button><span>${val}</span><button onclick="setPomoDuration('${type}',${step})">+</button></div>`;
    return `<div style="text-align:center;">
        <div class="pomo-ring">
            <svg width="150" height="150" viewBox="0 0 150 150">
                <circle class="track" cx="75" cy="75" r="${POMO_R}"/>
                <circle id="pomoRingProg" class="${pomodoroBreak ? 'break-progress' : 'progress'}" cx="75" cy="75" r="${POMO_R}" stroke-dasharray="${POMO_C}" stroke-dashoffset="${offset}"/>
            </svg>
            <div class="pomo-time"><span id="pomoTimeText">${fmtMMSS(rem)}</span><span class="pomo-label">${pomodoroBreak ? 'Pausa' : 'Studio'}</span></div>
        </div>
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
            <div class="field-lbl" style="margin-bottom:6px;">YouTube — link playlist o video</div>
            <div style="display:flex;gap:8px;align-items:flex-end;">
                <input type="text" id="ytUrlInput" placeholder="https://youtube.com/playlist?list=…" value="${escHtml(ytPlaylistUrl)}" style="flex:1;font-size:.8rem;margin-bottom:0;" onkeydown="if(event.key==='Enter')saveYTUrl()">
                <button class="btn btn-secondary btn-small" onclick="saveYTUrl()">Salva</button>
            </div>
            <div class="muted" style="margin-top:8px;${hasYT ? 'color:var(--success-bright);' : ''}">${hasYT ? '✓ Parte con il timer e continua anche se cambi tab' : 'Nessuna playlist collegata'}</div>
        </div>
    </div>`;
}
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
    refreshPomodoro();
}
function pomoTick(){ if (pomoRemaining() <= 0) pomoFinishPhase(); else updatePomoDisplay(); }
function pomoFinishPhase(){
    clearInterval(pomodoroTimer); pomodoroRunning = false; ytPause();
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (_) {} }
    if (!pomodoroBreak) { addPomoSession(); pomodoroBreak = true; pomodoroSeconds = pomodoroBreakMins * 60; showToast('✓ Sessione completata — pausa!'); }
    else { pomodoroBreak = false; pomodoroSeconds = pomodoroStudyMins * 60; showToast('⏱ Pausa finita — al lavoro!'); }
    refreshPomodoro();
}
function pomodoroToggle(){
    if (pomodoroRunning) { pomodoroSeconds = pomoRemaining(); clearInterval(pomodoroTimer); pomodoroRunning = false; ytPause(); }
    else {
        if (pomodoroSeconds <= 0) pomodoroSeconds = pomoTotal();
        pomoEndAt = Date.now() + pomodoroSeconds * 1000; pomodoroRunning = true;
        if (ytPlaylistUrl && !pomodoroBreak) ensureYTPlayer(true);
        clearInterval(pomodoroTimer); pomodoroTimer = setInterval(pomoTick, 500);
    }
    refreshPomodoro();
}
function pomodoroReset(){
    clearInterval(pomodoroTimer); pomodoroRunning = false; pomodoroBreak = false;
    pomodoroSeconds = pomodoroStudyMins * 60; ytPause(); refreshPomodoro();
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
function ytPause(){ if (ytPlayer && ytPlayer.pauseVideo) { try { ytPlayer.pauseVideo(); } catch (_) {} } }
function saveYTUrl(){
    const inp = document.getElementById('ytUrlInput');
    if (!inp) return;
    const val = inp.value.trim();
    if (val && !extractYTPlaylistId(val) && !extractYTVideoId(val)) { showToast('⚠ Link YouTube non riconosciuto'); return; }
    ytPlaylistUrl = val; localStorage.setItem('studyhub_yt_url', ytPlaylistUrl);
    if (!ytPlaylistUrl) destroyYTPlayer(); else ensureYTPlayer(pomodoroRunning && !pomodoroBreak);
    refreshPomodoro(); updateYTDock();
}
function updateYTDock(){
    const dock = document.getElementById('ytDock');
    if (dock) dock.classList.toggle('offscreen', !(ytPlaylistUrl && !data.isGlobal && data.activeTab === 'pomodoro'));
}

// ── Materie ─────────────────────────────────────────────────────────────────
function addNewSubject(){
    const inp = document.getElementById('inSubName'), val = inp.value.trim();
    if (!val) return;
    if (data.subjects[val]) { showToast('⚠ Materia già esistente'); return; }
    const used = new Set(Object.values(data.subjects).map(s => s.color));
    const color = COLORS.find(c => !used.has(c)) || COLORS[Object.keys(data.subjects).length % COLORS.length];
    data.subjects[val] = { topics:[], color, examDate:null, examModeManual:false, examModeOverride:false, sessionLog:{}, todos:[], notepad:'', deletedTopics:{} };
    inp.value = '';
    closeModal('modalNewSubject');
    data.activeTab = 'study';
    setView('subject', val);
}
function openEditSubjectModal(name){
    document.getElementById('inEditSubName').value = name;
    document.getElementById('editSubOldName').value = name;
    openModal('modalEditSubject');
}
function confirmRenameSubject(){
    const oldName = document.getElementById('editSubOldName').value;
    const newName = document.getElementById('inEditSubName').value.trim();
    if (!newName || newName === oldName) { closeModal('modalEditSubject'); return; }
    if (data.subjects[newName]) { showToast('⚠ Nome già esistente'); return; }
    const ns = {};
    Object.keys(data.subjects).forEach(k => { ns[k === oldName ? newName : k] = data.subjects[k]; });
    data.subjects = ns;
    if (data.activeSub === oldName) data.activeSub = newName;
    save(); closeModal('modalEditSubject'); render(); showToast('✓ Rinominata');
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
    t.next = iso; delete t.requeueAt;
    save(); closeModal('modalEditDate'); refreshTab();
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
        confirmDialog({ title:'Sostituire i dati?', msg:`Il backup contiene ${plural(Object.keys(imp.subjects).length, 'materia', 'materie')} e sostituirà tutti i dati attuali, anche sugli altri dispositivi dopo la sync.`, ok:'Importa' }, () => {
            const snap = snapshot(), oldNames = Object.keys(data.subjects);
            data = normalizeData(imp);
            _sig = {}; oldNames.forEach(nm => { if (!data.subjects[nm]) _sig[nm] = { m:'#', t:{} }; });
            _extSig = '#';
            save(); render(); showToast('✓ Backup importato', snap);
        });
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
    return { ...base, topics, deletedTopics: pruneTombs(dt, new Set(topics.map(t => t.id))) };
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
        <div class="btn-row"><button class="btn btn-secondary" onclick="changeSyncUrl()">Cambia URL</button><button class="btn btn-secondary" onclick="disconnectSync()">Disconnetti</button></div>
        <button class="btn btn-secondary" onclick="closeModal('modalSync')">Chiudi</button>` : `
        <p class="muted" style="margin-bottom:14px;">Incolla l'URL della Web App di Google Apps Script (lo script è in Impostazioni).</p>
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

// ── Impostazioni ────────────────────────────────────────────────────────────
const APPS_SCRIPT_CODE = `// Study Hub — sync v2 (dati divisi in più celle: niente più limite 50.000 caratteri)
const SHEET_NAME = 'StudyHub';
const CHUNK = 45000;

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'read') {
    const sheet = getSheet();
    const last = sheet.getLastRow();
    if (last < 1) return out('{}');
    const txt = sheet.getRange(1, 1, last, 1).getValues()
      .map(function (r) { const v = String(r[0]); return v.charAt(0) === '~' ? v.slice(1) : v; })
      .join('');
    return out(txt || '{}');
  }
  return out(JSON.stringify({ error: 'unknown action' }));
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = e.postData.contents;
    JSON.parse(body); // valida
    const sheet = getSheet();
    const rows = [];
    for (let i = 0; i < body.length; i += CHUNK) rows.push(['~' + body.substring(i, i + CHUNK)]);
    sheet.clearContents();
    const range = sheet.getRange(1, 1, rows.length, 1);
    range.setNumberFormat('@');
    range.setValues(rows);
    return out(JSON.stringify({ ok: true, chunks: rows.length }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  } finally {
    lock.releaseLock();
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function out(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}`;
function openSettings(){ renderSettings(); openModal('modalSettings'); }
function renderSettings(){
    const light = document.body.classList.contains('light');
    const seg = (key, val, label, on) => `<button class="chip${on ? ' on' : ''}" onclick="setSetting('${key}','${val}')">${label}</button>`;
    document.getElementById('settingsBody').innerHTML = `
        <div class="set-sec"><div class="set-lbl">Tema</div><div class="seg">${seg('theme','dark','○ Scuro', !light)}${seg('theme','light','◐ Chiaro', light)}</div></div>
        <div class="set-sec"><div class="set-lbl">Orientamento schermo</div>
            <div class="seg">${seg('orientation','any','Automatico', settings.orientation === 'any')}${seg('orientation','portrait','Verticale', settings.orientation === 'portrait')}${seg('orientation','landscape','Orizzontale', settings.orientation === 'landscape')}</div>
            <div class="set-hint">Vale per questo dispositivo. Il blocco funziona con l'app installata (Android); su PC non ha effetto.</div></div>
        <div class="set-sec"><div class="set-lbl">Archivia impegni passati dopo</div>
            <div class="seg">${[7,30,90].map(n => seg('archiveDays', n, n + ' giorni', settings.archiveDays === n)).join('')}${seg('archiveDays', 0, 'Mai', !settings.archiveDays)}</div>
            <div class="set-hint">Gli impegni archiviati non compaiono più nel calendario ma restano salvati: li ritrovi con la ricerca dell'Agenda.</div></div>
        <div class="set-sec"><div class="set-lbl">Dati</div>
            <button class="btn btn-secondary" style="margin-top:0;" onclick="openSyncModal()">☁ Sincronizzazione${syncUrl ? ' · collegata' : ''}</button>
            <div class="btn-row" style="margin-top:8px;">
                <button class="btn btn-secondary" onclick="document.getElementById('importFileInput').click()">⬆ Importa backup</button>
                <button class="btn btn-secondary" onclick="exportData()">⬇ Esporta backup</button>
            </div>
            <button class="btn btn-secondary" onclick="openCsvImport()">📅 Importa CSV / Excel</button></div>
        <div class="set-sec"><div class="set-lbl">Script Google Apps Script (v2) <span class="link-action" onclick="toggleScriptBox()">mostra / nascondi</span></div>
            <div id="scriptBox" class="hidden">
                <div class="csv-help">Incollalo su <a href="https://script.google.com" target="_blank" rel="noopener" style="color:var(--accent)">script.google.com</a> e distribuiscilo come App Web (esegui come: Me · accesso: Chiunque). Per aggiornare uno script esistente: Gestisci deployment → Modifica → Nuova versione.</div>
                <textarea readonly onclick="this.select()" class="mono" style="font-size:.62rem;min-height:170px;color:var(--text-mid);">${escHtml(APPS_SCRIPT_CODE)}</textarea>
            </div></div>`;
}
function setSetting(key, val){
    if (key === 'theme') setTheme(val === 'light');
    else if (key === 'orientation') { settings.orientation = val; saveSettings(); applyOrientation(true); }
    else if (key === 'archiveDays') { settings.archiveDays = Number(val); saveSettings(); render(); }
    renderSettings();
}
function toggleScriptBox(){ const box = document.getElementById('scriptBox'); if (box) box.classList.toggle('hidden'); }

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
    if (!data.isGlobal && data.activeTab === 'ripasso' && !isTyping() && !anyModalOpen() && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const map = { '1':'ripeti', '2':'incerto', '3':'consolida', '4':'buono' };
        if (map[e.key]) {
            const sub = data.subjects[data.activeSub], first = sub && dueTopics(sub, data.activeSub)[0];
            if (first) { e.preventDefault(); rate(first.id, map[e.key]); }
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTyping() && _undoSnap) { e.preventDefault(); undoLast(); }
});
document.addEventListener('focusout', flushPendingRender);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
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
    render();
    updateSyncBtn(getSyncStatus());
    applyOrientation(false);
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
