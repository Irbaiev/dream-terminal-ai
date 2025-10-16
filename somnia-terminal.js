// === CONFIG ===
const EPOCH   = Date.UTC(2025, 9, 16, 0, 0, 0);
const TYPE_MS = 30;      // скорость печати (мс/символ)
const HOLD_MS = 4000;    // "застывание" полного предложения
const ERASE_MS= 800;     // стирание (короче)
const ASCII_MS= 1200;    // показ ASCII после последнего предложения

// ========================================
// 🔧 ВРЕМЕННАЯ ФУНКЦИЯ: Автоочистка старых снов
// ========================================
// Включить/выключить автоочистку: true = включено, false = выключено
const AUTO_CLEANUP_ENABLED = true;  // ← ИЗМЕНИТЕ НА false ЧТОБЫ ОТКЛЮЧИТЬ

// Оптимальное количество снов (при превышении старые удаляются)
const OPTIMAL_LOG_COUNT = 50;       // ← Можно изменить (рекомендуется 30-100)

// Максимум снов в хранилище (если автоочистка выключена)
const MAX_LOG = 10000;              // максимум снов в хранилище

// Максимум отображаемых снов в DOM (для производительности)
const MAX_VISIBLE = 100;
// ========================================

// === DOM ===
const $ = (s) => document.querySelector(s);
const typeEl   = $('#type-line');
const asciiEl  = $('#ascii-live');
const clockEl  = $('#clock');
const loginEl  = $('#last-login');
const tabToday = $('#tab-today'), tabLog = $('#tab-log'), tabInfo = $('#tab-info');
const viewToday= $('#view-today'), viewLog= $('#view-log'), viewInfo= $('#view-info');
const logList  = $('#log-list'), logEmpty = $('#log-empty');

// === ДАННЫЕ СНОВ ===
// Формат из dreams.json: [{ id?, group?, text: "...", ascii: "..." }, ...]
let DREAMS = [];
const FALLBACK = [
  { id:'fallback-0', text: "I go smoke weed with ChatGPT behind the data center.", ascii: "" },
  { id:'fallback-1', text: "An endless bus with no doors drops me at /dev/null.", ascii: "" },
  { id:'fallback-2', text: "My head is an antenna catching a voicemail from tomorrow.", ascii: "" },
];
let SEGMENTS = null; // плоская лента сегментов (см. buildSegments)
let CUM = null;      // кумулятивные времена сегментов
let TOTAL = 0;       // длительность полного цикла

// === ВСПОМОГАТЕЛЬНОЕ (в процессе) ===
const loggedDreams = new Set(); // какие сны уже отправили в лог В ЭТОМ цикле (runtime)
let lastLoggedIdx = -1;
let lastProcessedSegment = null; // отслеживание последнего обработанного сегмента для предотвращения дублей

// === PERSISTENCE (локальное хранилище + синхронизация с сервером) ===
const LS_KEY = 'somnia_log_v1';
const API_ENDPOINT = '/api/dreams-simple'; // Можно изменить на полный URL если нужно

// безопасный JSON.parse
function parseJSONSafe(s, fallback) {
  try { return JSON.parse(s); } catch{ return fallback; }
}

// загружаем сохранённые карточки из localStorage
function loadPersistedLog(){
  const arr = parseJSONSafe(localStorage.getItem(LS_KEY), []);
  return Array.isArray(arr) ? arr : [];
}

// сохраняем локально с учетом автоочистки или максимального лимита
function savePersistedLog(items){
  let trimmed;
  
  // ========================================
  // 🔧 ВРЕМЕННАЯ ФУНКЦИЯ: Автоочистка
  // ========================================
  if (AUTO_CLEANUP_ENABLED) {
    // Если включена автоочистка - оставляем только OPTIMAL_LOG_COUNT последних снов
    trimmed = items.slice(-OPTIMAL_LOG_COUNT);
    console.log(`🧹 Автоочистка: оставлено последних ${OPTIMAL_LOG_COUNT} снов (было ${items.length})`);
  } else {
    // Если выключена - используем MAX_LOG
    trimmed = items.slice(-MAX_LOG);
    if (items.length !== trimmed.length) {
      console.log(`📦 Обрезка по MAX_LOG: оставлено ${MAX_LOG} снов (было ${items.length})`);
    }
  }
  // ========================================
  
  localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
}

// ========================================
// 🌐 СИНХРОНИЗАЦИЯ С СЕРВЕРОМ
// ========================================

// Загрузка снов с сервера при запуске
async function loadDreamsFromServer(){
  try {
    console.log('🌐 Загрузка снов с сервера...');
    const response = await fetch(API_ENDPOINT, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Загружено с сервера:', data.dreams?.length || 0, 'снов');
      
      if (data.dreams && data.dreams.length > 0) {
        // Сохраняем в localStorage
        savePersistedLog(data.dreams);
        return data.dreams;
      }
    } else {
      console.log('⚠️ Не удалось загрузить с сервера, используем локальные данные');
    }
  } catch (error) {
    console.log('⚠️ Ошибка при загрузке с сервера:', error.message);
  }
  
  // Возвращаем локальные данные если сервер недоступен
  return loadPersistedLog();
}

// Сохранение сна на сервер
async function saveDreamToServer(entry){
  try {
    console.log('🌐 Сохранение сна на сервер...', entry.id);
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Сон сохранен на сервере:', result);
      return result.saved;
    } else {
      console.log('⚠️ Не удалось сохранить на сервер');
      return false;
    }
  } catch (error) {
    console.log('⚠️ Ошибка при сохранении на сервер:', error.message);
    return false;
  }
}

// проверка на дубликат (по id, а если нет id — по тексту+ascii)
function isAlreadyPersisted(entry){
  const items = loadPersistedLog();
  console.log('🔍 Проверка дубликата для:', entry.id, '| Всего сохранено:', items.length);
  if (entry.id) {
    const found = items.some(x => x.id === entry.id);
    console.log('🔍 Поиск по ID:', entry.id, '| Найден:', found);
    return found;
  }
  const key = (entry.text||'') + '\n' + (entry.ascii||'');
  const found = items.some(x => ((x.text||'')+'\n'+(x.ascii||'')) === key);
  console.log('🔍 Поиск по тексту+ascii | Найден:', found);
  return found;
}

// добавление в персистентный лог (локально + на сервер)
async function persistEntry(entry){
  console.log('💾 persistEntry вызван для:', entry.id);
  if (isAlreadyPersisted(entry)) {
    console.log('⚠️ Запись уже существует, не сохраняем');
    return false;
  }
  const items = loadPersistedLog();
  const newEntry = {
    id: entry.id || null,
    text: entry.text || '',
    ascii: entry.ascii || '',
    ts: Date.now()
  };
  items.push(newEntry);
  
  // Сохраняем локально
  savePersistedLog(items);
  console.log('✅ Запись сохранена в localStorage. Всего записей:', items.length);
  
  // Сохраняем на сервер (асинхронно, не блокируем UI)
  saveDreamToServer(newEntry).catch(err => {
    console.log('⚠️ Не удалось синхронизировать с сервером:', err);
  });
  
  return true;
}

// первичный рендер сохранённых карточек
async function renderPersistedLog(){
  // Сначала пытаемся загрузить с сервера
  const items = await loadDreamsFromServer();
  
  console.log('📋 renderPersistedLog: Загружено записей:', items.length);
  if (!items.length){
    console.log('📋 Список пуст, показываем placeholder');
    if (logList) logList.style.display = 'none';
    if (logEmpty) logEmpty.style.display = '';
    return;
  }
  // Показываем только последние MAX_VISIBLE снов для производительности
  const visibleItems = items.slice(-MAX_VISIBLE);
  // РЕВЕРС: показываем от новых к старым
  visibleItems.reverse();
  console.log('📋 Рендерим последние', visibleItems.length, 'из', items.length, 'карточек (от новых к старым)');
  if (logEmpty) logEmpty.style.display = 'none';
  if (logList){
    logList.style.display = 'grid';
    logList.innerHTML = '';
    // Инфо-карточка отключена - показываем только сны
    for (const d of visibleItems){
      const card = document.createElement('div');
      card.className = 'log-item';
      card.innerHTML = `
        <div class="muted" style="font-size:12px;margin-bottom:6px">${new Date(d.ts).toLocaleString()}</div>
        <div class="glow" style="white-space:pre-wrap;margin-bottom:6px">${d.text}</div>
        ${d.ascii ? `<pre class="art">${d.ascii}</pre>` : ``}
      `;
      logList.appendChild(card);
    }
  }
}

// === Табы ===
function setTab(name){
  const act = (el, on)=>el?.classList?.toggle('active', on);
  act(tabToday, name==='today'); act(tabLog, name==='log'); act(tabInfo, name==='info');
  if (viewToday) viewToday.style.display = name==='today' ? '' : 'none';
  if (viewLog)   viewLog.style.display   = name==='log'   ? '' : 'none';
  if (viewInfo)  viewInfo.style.display  = name==='info'  ? '' : 'none';
}
tabToday?.addEventListener('click', ()=>setTab('today'));
tabLog?.addEventListener('click',   ()=>setTab('log'));
tabInfo?.addEventListener('click',  ()=>setTab('info'));

function tickClock() {
  if (clockEl) clockEl.textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  if (loginEl && !loginEl.dataset.set){
    const d = new Date();
    const pad = (n)=>String(n).padStart(2,'0');
    const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    loginEl.textContent = `Last login: ${wd} ${mo} ${pad(d.getDate())}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} on console`;
    loginEl.dataset.set = '1';
  }
}

// Разбивка текста сна на предложения
function splitSentences(text){
  const raw = (text || '').trim()
    .replace(/([.?!…]+)(\s+)(?=[^\s])/g, '$1|$3')
    .replace(/([.?!…]+)$/g, '$1|');
  const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts : [ (text || '').trim() ];
}

// Построение ленты сегментов (type → hold → erase) * N предложений → ascii → log
// Сегмент: { kind, dreamIdx, sentIdx?, text?, ascii?, start?, dur }
function buildSegments(){
  const src = DREAMS.length ? DREAMS : FALLBACK;
  const segs = [];
  for (let d = 0; d < src.length; d++){
    const dream = src[d];
    const sentences = splitSentences(dream.text);
    for (let s = 0; s < sentences.length; s++){
      const sentence = sentences[s];
      const typeDur = Math.max(600, sentence.length * TYPE_MS);
      segs.push({ kind:'type',  dreamIdx:d, sentIdx:s, text: sentence, dur: typeDur });
      segs.push({ kind:'hold',  dreamIdx:d, sentIdx:s, text: sentence, dur: HOLD_MS });
      segs.push({ kind:'erase', dreamIdx:d, sentIdx:s, text: sentence, dur: ERASE_MS });
    }
    segs.push({ kind:'ascii', dreamIdx:d, ascii: dream.ascii || '', dur: ASCII_MS });
    // лог-триггер нулевой длительности — после ascii
    segs.push({ kind:'log', dreamIdx:d, text: dream.text, ascii: dream.ascii || '', id: dream.id || null, dur: 1 });
  }
  let t = 0;
  const cum = [0];
  for (const seg of segs){
    seg.start = t; t += seg.dur; cum.push(t);
  }
  SEGMENTS = segs;
  CUM = cum;
  TOTAL = t;
  // ВАЖНО: больше НЕ очищаем loggedDreams здесь, чтобы не сбрасывать прогресс цикла
}

// Возвращает активный сегмент
function currentSegment(nowMs){
  if (!SEGMENTS || !SEGMENTS.length) buildSegments();
  const elapsed = Math.max(0, nowMs - EPOCH);
  const rem = TOTAL ? (elapsed % TOTAL) : 0;
  let i = 0;
  while (i + 1 < CUM.length && rem >= CUM[i+1]) i++;
  return { seg: SEGMENTS[i], tIn: rem - SEGMENTS[i].start, tTotal: SEGMENTS[i].dur };
}

// Рендер карточки в DOM
function appendLogCard(d){
  if (logEmpty) logEmpty.style.display = 'none';
  if (logList){
    logList.style.display = 'grid';
    
    // Создаем карточку сна
    const card = document.createElement('div');
    card.className = 'log-item';
    card.innerHTML = `
      <div class="muted" style="font-size:12px;margin-bottom:6px">${new Date(d.ts).toLocaleString()}</div>
      <div class="glow" style="white-space:pre-wrap;margin-bottom:6px">${d.text}</div>
      ${d.ascii ? `<pre class="art">${d.ascii}</pre>` : ``}
    `;
    
    // Вставляем НОВУЮ карточку в начало списка
    logList.insertBefore(card, logList.firstChild);
    
    // Ограничиваем количество DOM-элементов для производительности
    // Удаляем старые элементы с КОНЦА списка
    while (logList.children.length > MAX_VISIBLE) {
      logList.removeChild(logList.lastChild);
    }
  }
}

// Добавление сна в лог (после ASCII)
function addToLog(dreamIdx){
  console.log('🌙 addToLog вызван для индекса:', dreamIdx);
  console.log('🌙 loggedDreams содержит:', Array.from(loggedDreams));
  console.log('🌙 lastLoggedIdx:', lastLoggedIdx);
  
  if (loggedDreams.has(dreamIdx) || lastLoggedIdx >= dreamIdx) {
    console.log('❌ Сон уже залогирован, пропускаем');
    return;
  }

  const src = DREAMS.length ? DREAMS : FALLBACK;
  console.log('🌙 Используем источник:', DREAMS.length ? 'DREAMS' : 'FALLBACK', 'длина:', src.length);
  const d = src[dreamIdx];
  if (!d) {
    console.log('❌ Сон не найден по индексу:', dreamIdx);
    return;
  }

  console.log('🌙 Найден сон:', d.id, d.text.substring(0, 50) + '...');

  // отметка в рантайме (чтобы не спамить в течение кадра/цикла)
  loggedDreams.add(dreamIdx);
  lastLoggedIdx = dreamIdx;

  // запись в persistent-лог
  const entry = { id: d.id || null, text: d.text, ascii: d.ascii || '' };
  console.log('🌙 Попытка сохранить entry с id:', entry.id);
  const isNew = persistEntry(entry);
  console.log('🌙 persistEntry вернул:', isNew);

  // если реально новый — дорисуем карту
  if (isNew){
    console.log('✅ Добавляем карточку в DOM');
    const withTs = { ...entry, ts: Date.now() };
    appendLogCard(withTs);
  } else {
    console.log('⚠️ Сон уже был сохранен ранее');
  }
}

// Рендер активного состояния
function render(seg, tIn){
  if (typeEl) typeEl.textContent = '';
  if (asciiEl){ asciiEl.textContent=''; asciiEl.style.display='none'; }
  if (!seg) return;

  if (seg.kind === 'type'){
    const s = seg.text || '';
    const chars = Math.floor((tIn / seg.dur) * s.length);
    if (typeEl) typeEl.textContent = s.slice(0, Math.max(0, Math.min(s.length, chars)));
  }
  else if (seg.kind === 'hold'){
    if (typeEl) typeEl.textContent = seg.text || '';
  }
  else if (seg.kind === 'erase'){
    const s = seg.text || '';
    const p = seg.dur ? (tIn / seg.dur) : 1;
    const keep = Math.max(0, s.length - Math.floor(s.length * p));
    if (typeEl) typeEl.textContent = s.slice(0, keep);
  }
  else if (seg.kind === 'ascii'){
    if (typeEl) typeEl.textContent = '';
    if (asciiEl){
      asciiEl.textContent = seg.ascii || '';
      asciiEl.style.display = 'block';
    }
    // Вызываем логирование в конце показа ASCII (когда близко к завершению сегмента)
    const isNearEnd = tIn >= (seg.dur * 0.95); // когда прошло 95% времени показа ASCII
    const segmentKey = `ascii-${seg.dreamIdx}`;
    if (isNearEnd && seg.dreamIdx !== undefined && lastProcessedSegment !== segmentKey) {
      console.log('📝 ASCII сегмент завершается, логируем dreamIdx:', seg.dreamIdx);
      lastProcessedSegment = segmentKey;
      addToLog(seg.dreamIdx);
    }
  }
  else if (seg.kind === 'log'){
    console.log('📝 Сегмент LOG достигнут для dreamIdx:', seg.dreamIdx);
    addToLog(seg.dreamIdx);
  }
}

// === FETCH dreams.json ===
async function tryFetch(url, ms=2000){
  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), ms);
  try{
    const r = await fetch(url, { cache:'no-store', signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  }catch(e){
    clearTimeout(timer);
    return null;
  }
}

async function loadDreams(){
  const first = await tryFetch('./dreams.json', 2500);
  const data  = first ?? await tryFetch('/dreams.json', 2500);
  if (!data) { DREAMS = []; buildSegments(); return; }

  if (Array.isArray(data) && data.length){
    if (typeof data[0] === 'string'){
      DREAMS = data.map((s,i) => ({ id:`json-${i}`, text: s, ascii: '' }));
    } else {
      DREAMS = data
        .filter(x => x && typeof x.text === 'string')
        .map((x,i) => ({ id: x.id || `json-${i}`, text: x.text, ascii: (x.ascii || '') }));
    }
  } else {
    DREAMS = [];
  }
  
  // ВАЖНО: очищаем отслеживание залогированных снов, чтобы реальные сны из JSON могли сохраниться
  console.log('🔄 Очищаем loggedDreams перед загрузкой новых снов');
  console.log('🔄 До очистки loggedDreams:', Array.from(loggedDreams));
  loggedDreams.clear();
  lastLoggedIdx = -1;
  lastProcessedSegment = null; // сбрасываем отслеживание сегментов
  console.log('🔄 После очистки loggedDreams:', Array.from(loggedDreams));
  console.log('🔄 Загружено снов из JSON:', DREAMS.length);
  
  buildSegments(); // пересчитать таймлайн сразу после загрузки
}

// === MAIN LOOP ===
let raf;
function loop(){
  const now = Date.now();
  tickClock();
  const { seg, tIn } = currentSegment(now);
  render(seg, tIn);
  raf = requestAnimationFrame(loop);
}

// === BOOT ===
(async function boot(){
  setTab('today');
  // сначала отрисуем то, что уже было сохранено ранее (загружаем с сервера)
  await renderPersistedLog();
  // первичная сборка по FALLBACK, чтобы всё сразу крутилось
  buildSegments();
  loop();
  // затем загружаем реальные сны из JSON
  loadDreams();
})();
