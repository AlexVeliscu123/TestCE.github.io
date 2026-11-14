const app = document.getElementById("app");
const LETTERS = ["a", "b", "c"];
const STORE_KEY = "tests-ce-resultados";
const THEME_KEY = "tests-ce-tema";
const MODE_KEY = "tests-ce-modo";
const FAILS_KEY = "tests-ce-fallos";
const HIST_KEY = "tests-ce-historial";
const EXAM_QUESTIONS = 20; // preguntas del examen real
const HIST_MAX = 60;       // intentos que se guardan
const HIST_WINDOW = 10;    // intentos recientes que cuentan para la probabilidad
const HIST_MIN = 3;        // intentos mínimos para dar una estimación
const EXAM_MINUTES = 20; // tiempo máximo del modo examen
const MAX_FALLOS = 2; // 2 fallos o menos = aprobado; 3 o más = suspenso

let timer = null;
let clock = null;
function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (clock) { clearInterval(clock); clock = null; }
}
function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
// Cuenta atrás del examen: al llegar a 0 se sale del test y queda suspenso
function startClock(state) {
  const el = document.getElementById("clock");
  if (!el || !state.deadline) return;
  const tick = () => {
    const rem = state.deadline - Date.now();
    if (rem <= 0) { state.timeUp = true; showResults(state); return; }
    el.textContent = `⏱ ${fmtTime(rem)}`;
    el.classList.toggle("warn", rem <= 60000);
  };
  tick();
  if (!state.timeUp) clock = setInterval(tick, 500);
}

/* ---------- Almacenamiento ---------- */
function loadResults() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
}
function saveResult(id, aciertos, total) {
  try {
    const r = loadResults();
    if (!r[id] || aciertos > r[id].mejor) r[id] = { mejor: aciertos, total };
    localStorage.setItem(STORE_KEY, JSON.stringify(r));
  } catch (e) { /* sin almacenamiento: no pasa nada */ }
}
/* ---------- Historial de intentos y probabilidad de aprobar ---------- */
function loadHist() {
  try { const h = JSON.parse(localStorage.getItem(HIST_KEY)); return Array.isArray(h) ? h : []; } catch (e) { return []; }
}
function saveAttempt(id, fallos, total) {
  try {
    const h = loadHist();
    h.push({ id, fallos, total });
    localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-HIST_MAX)));
  } catch (e) {}
}
// P(X <= MAX_FALLOS) con X ~ Binomial(EXAM_QUESTIONS, p)
function probAprobar(p) {
  const n = EXAM_QUESTIONS;
  let sum = 0;
  for (let k = 0; k <= MAX_FALLOS; k++) {
    let c = 1;
    for (let j = 1; j <= k; j++) c = c * (n - k + j) / j;
    sum += c * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
  return sum;
}
const ARC = Math.PI * 80; // longitud del arco del velocímetro
function gaugeSvg(pct) {
  const len = (pct / 100) * ARC;
  return `<svg class="speedo" viewBox="0 0 200 118" role="img" aria-label="${pct === null ? "Sin datos todavía" : pct + "% de probabilidad"}">
    <path class="sp-track" d="M20 100 A80 80 0 0 1 180 100" pathLength="${ARC}"/>
    ${pct === null ? "" : `<path class="sp-val" d="M20 100 A80 80 0 0 1 180 100" stroke-dasharray="${len} ${ARC}"/>`}
    <text x="100" y="92" class="sp-num" text-anchor="middle">${pct === null ? "–" : pct + "%"}</text>
    <text x="20" y="116" class="sp-end" text-anchor="middle">0</text>
    <text x="180" y="116" class="sp-end" text-anchor="middle">100</text>
  </svg>`;
}
function statsHtml() {
  const h = loadHist();
  if (h.length < HIST_MIN) {
    const faltan = HIST_MIN - h.length;
    return `<section class="hero" aria-label="Tu progreso">
      ${gaugeSvg(null)}
      <div class="hero-txt">
        <h2>Tu probabilidad de aprobar</h2>
        <p>${h.length ? `Llevas ${h.length} ${h.length === 1 ? "test" : "tests"}. ` : ""}Haz ${faltan} ${faltan === 1 ? "test más" : "tests más"} y te diré cuántas opciones tienes de aprobar el examen.</p>
      </div>
    </section>`;
  }
  const rec = h.slice(-HIST_WINDOW);
  const fal = rec.reduce((a, x) => a + x.fallos, 0);
  const tot = rec.reduce((a, x) => a + x.total, 0);
  const media = fal / rec.length;
  const pct = Math.min(99, Math.max(1, Math.round(probAprobar(fal / tot) * 100)));
  const cls = pct >= 75 ? "good" : pct >= 40 ? "mid" : "low";
  const aprob = rec.filter(x => x.fallos <= MAX_FALLOS).length;
  const bars = rec.map(x => {
    const hgt = Math.min(100, 16 + x.fallos * 12);
    return `<i class="${x.fallos <= MAX_FALLOS ? "ok" : "bad"}" style="height:${hgt}%" title="Test ${x.id}: ${x.fallos} ${x.fallos === 1 ? "fallo" : "fallos"}"><b>${x.fallos}</b></i>`;
  }).join("");
  return `<section class="hero ${cls}" aria-label="Tu progreso">
    ${gaugeSvg(pct)}
    <div class="hero-txt">
      <h2>Tu probabilidad de aprobar</h2>
      <p>Media de ${media.toFixed(1).replace(".", ",")} fallos por test. Has aprobado ${aprob} de tus últimos ${rec.length}.</p>
      <div class="bars" role="img" aria-label="Fallos de tus últimos tests">${bars}</div>
      <small>Fallos por test, del más antiguo al más reciente. Estimación orientativa para un examen de ${EXAM_QUESTIONS} preguntas.</small>
    </div>
  </section>`;
}

/* ---------- Fallos pendientes (de todos los tests) ----------
   Se guarda una marca "test-pregunta" por cada pregunta fallada y aún no corregida. */
function loadFails() {
  try { return JSON.parse(localStorage.getItem(FAILS_KEY)) || {}; } catch (e) { return {}; }
}
function saveFails(f) {
  try { localStorage.setItem(FAILS_KEY, JSON.stringify(f)); } catch (e) {}
}
function pendingOfTest(f, id) {
  return Object.keys(f).filter(k => k.startsWith(id + "-")).length;
}
// Tras hacer un test normal: lo fallado se apunta, lo acertado se quita
function updateFailsFromTest(test, answers) {
  const f = loadFails();
  test.preguntas.forEach((q, i) => {
    const k = `${test.id}-${i}`;
    if (answers[i] === q[4]) delete f[k]; else f[k] = 1;
  });
  saveFails(f);
}
// Tras un repaso: lo acertado se quita y el "mejor" de cada test se actualiza
function updateFailsFromRepaso(state) {
  const f = loadFails();
  const tocados = new Set();
  state.test.preguntas.forEach((q, i) => {
    const [tid, idx] = state.origins[i];
    tocados.add(tid);
    if (state.answers[i] === q[4]) delete f[`${tid}-${idx}`];
  });
  saveFails(f);
  try {
    const r = loadResults();
    tocados.forEach(tid => {
      if (r[tid]) r[tid].mejor = Math.max(r[tid].mejor, r[tid].total - pendingOfTest(f, tid));
    });
    localStorage.setItem(STORE_KEY, JSON.stringify(r));
  } catch (e) {}
}

const MODE_DESC = {
  estudio: "Ves al instante si has acertado y pasa solo a la siguiente.",
  examen: `Sin pistas y con ${EXAM_MINUTES} minutos. La nota y los fallos los ves al finalizar.`
};
/* ---------- Explicaciones (librito) ---------- */
const BOOK_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3.5A1.5 1.5 0 0 1 2 16.5z"/><path d="M22 5.5A1.5 1.5 0 0 0 20.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>`;
function getExpl(testId, idx) {
  return (typeof EXPLICACIONES !== "undefined" && EXPLICACIONES[`${testId}-${idx + 1}`]) || "";
}
// Librito + panel desplegable para la pantalla de resultados
function bookBlock(id, text) {
  if (!text) return "";
  return `<button class="book inline" type="button" data-book="${id}" aria-expanded="false" aria-label="Ver explicación" title="Ver explicación">${BOOK_SVG}<span>Explicación</span></button>
    <div class="explain" id="${id}" hidden><p>${text}</p></div>`;
}
function bindBooks() {
  app.querySelectorAll("[data-book]").forEach(b => b.addEventListener("click", () => {
    const box = document.getElementById(b.dataset.book);
    const open = box.hidden;
    box.hidden = !open;
    b.setAttribute("aria-expanded", String(open));
  }));
}

function getMode() {
  try { return localStorage.getItem(MODE_KEY) === "examen" ? "examen" : "estudio"; } catch (e) { return "estudio"; }
}
function setMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) {} }

/* ---------- Tema claro / oscuro ---------- */
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? "#0a0d10" : "#14181d");
}

/* ---------- Inicio ---------- */
function showHome() {
  clearTimer();
  const results = loadResults();
  const mode = getMode();
  const nFails = Object.keys(loadFails()).length;
  let tiles = "";
  for (let id = 1; id <= TOTAL_TESTS; id++) {
    const t = TESTS.find(x => x.id === id);
    if (t) {
      const r = results[id];
      let cls = "", info = `${t.preguntas.length} preguntas`;
      if (r) {
        const fallos = r.total - r.mejor;
        cls = fallos <= MAX_FALLOS ? "pass" : "fail";
        info = `Mejor: ${fallos} ${fallos === 1 ? "fallo" : "fallos"}`;
      }
      tiles += `<button class="tile ${cls}" data-id="${id}" style="--i:${id}">
        <strong><span class="tl">Test</span>${id}</strong><small>${info}</small></button>`;
    } else {
      tiles += `<button class="tile" disabled style="--i:${id}"><strong><span class="tl">Test</span>${id}</strong><small>Próximamente</small></button>`;
    }
  }
  app.innerHTML = `
    <h1>Elige un test</h1>
    <p class="lead">Aprobado con ${MAX_FALLOS} fallos o menos. Con ${MAX_FALLOS + 1} o más, suspenso.</p>
    ${statsHtml()}
    <div class="seg" role="group" aria-label="Modo de test">
      <button class="seg-btn" data-mode="estudio" aria-pressed="${mode === "estudio"}">Modo estudio</button>
      <button class="seg-btn" data-mode="examen" aria-pressed="${mode === "examen"}">Modo examen</button>
    </div>
    <p class="seg-desc" id="mode-desc">${MODE_DESC[mode]}</p>
    <div class="quick">
      <button class="quick-btn rand" id="random">
        <span class="qi" aria-hidden="true">🎲</span>
        <span class="qt"><strong>Test aleatorio</strong><small>Uno al azar, en modo examen</small></span>
      </button>
      <button class="quick-btn fails" id="repaso" ${nFails ? "" : "disabled"}>
        <span class="qi" aria-hidden="true">${nFails}</span>
        <span class="qt"><strong>Repasar mis fallos</strong><small>${nFails ? (nFails === 1 ? "1 pregunta pendiente" : `${nFails} preguntas pendientes`) : "Sin fallos pendientes"}</small></span>
      </button>
    </div>
    <h2 class="grid-title">Todos los tests</h2>
    <div class="grid">${tiles}</div>`;
  app.querySelectorAll(".seg-btn").forEach(b => b.addEventListener("click", () => {
    setMode(b.dataset.mode);
    app.querySelectorAll(".seg-btn").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    document.getElementById("mode-desc").textContent = MODE_DESC[b.dataset.mode];
  }));
  document.getElementById("random").addEventListener("click", startRandom);
  const rb = document.getElementById("repaso");
  if (rb) rb.addEventListener("click", startRepaso);
  app.querySelectorAll(".tile[data-id]").forEach(b =>
    b.addEventListener("click", () => startTest(Number(b.dataset.id))));
  window.scrollTo(0, 0);
}

function startTest(id, forceMode) {
  clearTimer();
  const test = TESTS.find(t => t.id === id);
  const state = { test, i: 0, answers: [], mode: forceMode || getMode() };
  if (state.mode === "examen") state.deadline = Date.now() + EXAM_MINUTES * 60000;
  showQuestion(state);
  window.scrollTo(0, 0);
}

// Test aleatorio: elige uno cualquiera y lo abre siempre en modo examen
function startRandom() {
  if (!TESTS.length) return;
  const t = TESTS[Math.floor(Math.random() * TESTS.length)];
  startTest(t.id, "examen");
}

function startRepaso() {
  clearTimer();
  const f = loadFails();
  const preguntas = [], origins = [];
  TESTS.forEach(t => t.preguntas.forEach((q, i) => {
    if (f[`${t.id}-${i}`]) { preguntas.push(q); origins.push([t.id, i]); }
  }));
  if (!preguntas.length) { showHome(); return; }
  const test = { id: "repaso", titulo: "Repaso de fallos", preguntas };
  showQuestion({ test, i: 0, answers: [], mode: getMode(), origins });
  window.scrollTo(0, 0);
}

/* ---------- Imágenes automáticas ----------
   Mete las imágenes en la carpeta "img" con el nombre t{test}-p{pregunta}.{ext}
   Ejemplo: img/t1-p9.png  (test 1, pregunta 9). Si no existe, no se muestra nada. */
const IMG_DIR = "img";
const IMG_EXTS = ["png", "jpg", "jpeg", "webp", "svg"];

function attachImage(testId, idx, custom) {
  const box = document.getElementById("q-img");
  if (!box) return;
  const base = `${IMG_DIR}/t${testId}-p${idx + 1}`;
  const candidates = custom ? [custom] : IMG_EXTS.map(e => `${base}.${e}`);
  let n = 0;
  const img = new Image();
  img.className = "q-img";
  img.alt = "Imagen de la pregunta";
  img.onload = () => box.appendChild(img);
  img.onerror = () => { n++; if (n < candidates.length) img.src = candidates[n]; };
  img.src = candidates[0];
}

/* ---------- Navegación ---------- */
// Cambia de pregunta SIN mover el scroll (te quedas donde estás en la pantalla)
function goTo(state, n) {
  state.dir = n > state.i ? "fwd" : n < state.i ? "back" : null;
  state.i = n;
  showQuestion(state);
}
// Siguiente pregunta sin contestar (da la vuelta al final). -1 si ya están todas.
function nextPending(state, from) {
  const total = state.test.preguntas.length;
  for (let k = 1; k < total; k++) {
    const n = (from + k) % total;
    if (state.answers[n] == null) return n;
  }
  return -1;
}
function finishTest(state) {
  const total = state.test.preguntas.length;
  const sin = total - state.answers.filter(a => a != null).length;
  if (sin > 0 && !confirm(`Te quedan ${sin} ${sin === 1 ? "pregunta" : "preguntas"} sin contestar (cuentan como fallo). ¿Finalizar igualmente?`)) return;
  showResults(state);
}

/* ---------- Pregunta ---------- */
function countFallos(state) {
  let f = 0;
  state.answers.forEach((a, i) => { if (a != null && a !== state.test.preguntas[i][4]) f++; });
  return f;
}
function pillInfo(state) {
  const total = state.test.preguntas.length;
  if (state.mode === "examen") {
    return { text: `Contestadas ${state.answers.filter(a => a != null).length}/${total}`, warn: false };
  }
  const f = countFallos(state);
  return { text: `Fallos: ${f}`, warn: !state.origins && f > MAX_FALLOS };
}
function updatePill(state) {
  const pill = app.querySelector(".pill.live");
  if (!pill) return;
  const p = pillInfo(state);
  pill.textContent = p.text;
  pill.classList.toggle("warn", p.warn);
}
function navClass(state, n) {
  const a = state.answers[n];
  const cls = [];
  if (a != null) {
    if (state.mode === "examen") cls.push("answered");
    else cls.push(a === state.test.preguntas[n][4] ? "ok" : "bad");
  }
  if (n === state.i) cls.push("current");
  return cls.join(" ");
}
function updateNav(state) {
  app.querySelectorAll(".nav button").forEach((b, n) => { b.className = navClass(state, n); });
  const done = state.answers.filter(a => a != null).length;
  const bar = app.querySelector(".progress i");
  if (bar) bar.style.width = `${(done / state.test.preguntas.length) * 100}%`;
}

function showQuestion(state) {
  clearTimer();
  const { test, i, mode } = state;
  const q = test.preguntas[i];
  const total = test.preguntas.length;
  const exam = mode === "examen";
  const [exT, exI] = state.origins ? state.origins[i] : [test.id, i];
  const ex = exam ? "" : getExpl(exT, exI);
  const pill = pillInfo(state);
  const done = state.answers.filter(a => a != null).length;

  const navHtml = `
    <p class="nav-title">Ir a una pregunta:</p>
    <div class="nav">${test.preguntas.map((_, n) =>
      `<button data-go="${n}" class="${navClass(state, n)}" aria-label="Pregunta ${n + 1}">${n + 1}</button>`
    ).join("")}</div>`;

  // Animación distinta según el movimiento: entrar, ir adelante o ir atrás
  const anim = state.dir === "fwd" ? "to-next" : state.dir === "back" ? "to-prev" : "enter";
  state.dir = null;

  app.innerHTML = `
    <div class="qwrap ${anim}">
    <div class="meta">
      <span><span class="pill">${exam ? "Examen" : "Estudio"}</span> ${test.titulo}</span>
      <span class="pill live ${pill.warn ? "warn" : ""}">${pill.text}</span>
      ${state.deadline ? `<span class="pill clock" id="clock"></span>` : ""}
      <span>Pregunta ${i + 1} de ${total}</span>
    </div>
    <div class="progress"><i style="width:${(done / total) * 100}%"></i></div>
    <div class="card ${ex ? "has-book" : ""}">
      ${ex ? `<button class="book" id="book" type="button" hidden aria-expanded="false" aria-label="Ver explicación" title="Ver explicación">${BOOK_SVG}</button>` : ""}
      ${state.origins ? `<p class="origin">Test ${state.origins[i][0]} · pregunta ${state.origins[i][1] + 1}</p>` : ""}
      <p class="question">${q[0]}</p>
      <div class="qbody">
        <div id="q-img"></div>
        <div class="opts">
          ${[1, 2, 3].map((n, k) => q[n] == null ? "" : `<button class="opt" data-k="${k}">
            <span class="letter">${LETTERS[k]}</span><span>${q[n]}</span></button>`).join("")}
        </div>
      </div>
      <div id="feedback"></div>
      ${ex ? `<div class="explain" id="explain" hidden><p>${ex}</p><button class="btn" id="explain-next" type="button">Continuar</button></div>` : ""}
    </div>
    </div>
    <div class="actions">
      <button class="btn ghost" id="prev" ${i === 0 ? "disabled" : ""}>Anterior</button>
      <button class="btn ghost" id="skip" ${i === total - 1 ? "disabled" : ""}>Siguiente</button>
      <button class="btn finish" id="finish">${exam ? "Finalizar examen" : "Finalizar test"}</button>
    </div>
    ${navHtml}`;

  startClock(state);
  const buttons = app.querySelectorAll(".opt");
  if (state.origins) attachImage(state.origins[i][0], state.origins[i][1], q[5]);
  else attachImage(test.id, i, q[5]);

  // Navegación libre (igual en los dos modos)
  document.getElementById("prev").addEventListener("click", () => goTo(state, i - 1));
  document.getElementById("skip").addEventListener("click", () => goTo(state, i + 1));
  document.getElementById("finish").addEventListener("click", () => finishTest(state));
  app.querySelectorAll(".nav button").forEach(b =>
    b.addEventListener("click", () => goTo(state, Number(b.dataset.go))));

  const prevAnswer = state.answers[i];

  const bookBtn = document.getElementById("book");
  if (bookBtn) {
    const box = document.getElementById("explain");
    bookBtn.addEventListener("click", () => {
      const open = box.hidden;
      box.hidden = !open;
      bookBtn.setAttribute("aria-expanded", String(open));
      if (open) clearTimer(); // mientras lees, no pasa solo a la siguiente
    });
    document.getElementById("explain-next").addEventListener("click", () => {
      const n = nextPending(state, i);
      if (n < 0) showResults(state); else goTo(state, n);
    });
  }

  if (exam) {
    // Examen: sin pistas; la respuesta se puede cambiar hasta finalizar
    if (prevAnswer != null) {
      buttons.forEach(x => { if (Number(x.dataset.k) === prevAnswer) x.classList.add("selected"); });
    }
    buttons.forEach(b => b.addEventListener("click", () => {
      const first = state.answers[i] == null;
      state.answers[i] = Number(b.dataset.k);
      buttons.forEach(x => x.classList.toggle("selected", x === b));
      updatePill(state);
      updateNav(state);
      if (!first) return; // si solo cambias una respuesta, te quedas aquí
      const n = nextPending(state, i);
      if (n >= 0) {
        buttons.forEach(x => (x.disabled = true));
        timer = setTimeout(() => goTo(state, n), 280);
      } else {
        document.getElementById("finish").focus(); // ya están todas contestadas
      }
    }));
    return;
  }

  // Estudio: resultado al instante
  const showFeedback = k => {
    const ok = k === q[4];
    buttons.forEach(x => {
      x.disabled = true;
      if (Number(x.dataset.k) === q[4]) x.classList.add("correct");
    });
    if (!ok) buttons[k].classList.add("wrong");
    const bk = document.getElementById("book");
    if (bk) bk.hidden = false;
    document.getElementById("feedback").innerHTML = ok
      ? `<p class="feedback ok">¡Correcto!</p>`
      : `<p class="feedback ko">Incorrecto. La respuesta correcta es la ${LETTERS[q[4]]}).</p>`;
    return ok;
  };

  if (prevAnswer != null) { showFeedback(prevAnswer); return; } // ya contestada: solo repaso

  buttons.forEach(b => b.addEventListener("click", () => {
    const k = Number(b.dataset.k);
    state.answers[i] = k;
    const ok = showFeedback(k);
    updatePill(state);
    updateNav(state);
    // Avance automático a la siguiente sin contestar; si no queda ninguna, resultados
    timer = setTimeout(() => {
      const n = nextPending(state, i);
      if (n < 0) showResults(state); else goTo(state, n);
    }, ex ? (ok ? 2600 : 3600) : (ok ? 1200 : 2800));
  }));
}

/* ---------- Resultados ---------- */
function showResults(state) {
  clearTimer();
  const { test, answers } = state;
  const total = test.preguntas.length;
  const fallos = [];
  test.preguntas.forEach((q, i) => { if (answers[i] !== q[4]) fallos.push(i); });
  const aciertos = total - fallos.length;
  if (state.origins) { showRepasoResults(state, fallos); return; }
  const timeUp = !!state.timeUp;
  // Si se acaba el tiempo, el resultado cuenta como suspenso
  saveResult(test.id, timeUp ? Math.min(aciertos, total - MAX_FALLOS - 1) : aciertos, total);
  saveAttempt(test.id, fallos.length, total);
  updateFailsFromTest(test, answers);
  const aprobado = !timeUp && fallos.length <= MAX_FALLOS;
  const nota = ((aciertos / total) * 10).toFixed(1).replace(".", ",");
  const review = fallos.map(i => {
    const q = test.preguntas[i];
    const tu = answers[i] == null ? "Sin responder" : `${LETTERS[answers[i]]}) ${q[1 + answers[i]]}`;
    return `<div class="review">
      <p><strong>${i + 1}. ${q[0]}</strong></p>
      <p class="tu">Tu respuesta: ${tu}</p>
      <p class="ok">Correcta: ${LETTERS[q[4]]}) ${q[1 + q[4]]}</p>
      ${bookBlock(`ex-${i}`, getExpl(test.id, i))}</div>`;
  }).join("");
  // Todas las preguntas con su explicación (para repasar también las acertadas)
  const todas = test.preguntas.map((q, i) => {
    const ex = getExpl(test.id, i);
    if (!ex) return "";
    const ok = answers[i] === q[4];
    return `<div class="review all ${ok ? "good" : ""}">
      <p><strong>${i + 1}. ${q[0]}</strong></p>
      <p class="ok">Correcta: ${LETTERS[q[4]]}) ${q[1 + q[4]]}</p>
      <div class="explain open"><p>${ex}</p></div></div>`;
  }).join("");
  app.innerHTML = `
    <div class="score ${aprobado ? "pass" : "fail"}">
      <p class="verdict">${aprobado ? "¡APROBADO!" : timeUp ? "TIEMPO AGOTADO · SUSPENSO" : "SUSPENSO"}</p>
      <div class="big">${aciertos} / ${total}</div>
      <p>Nota: ${nota} sobre 10 · Fallos: ${fallos.length}</p>
      <p class="rule">${timeUp ? `Se acabaron los ${EXAM_MINUTES} minutos del examen. Las preguntas sin contestar cuentan como fallo.` : `Se aprueba con ${MAX_FALLOS} fallos o menos.`}</p>
    </div>
    ${fallos.length ? `<h2>Preguntas falladas</h2>${review}` : "<p><strong>¡Sin ningún fallo!</strong></p>"}
    ${todas ? `<details class="all-details"><summary>Ver todas las preguntas con su explicación</summary>${todas}</details>` : ""}
    <div class="actions">
      <button class="btn" id="retry">Repetir test</button>
      <button class="btn ghost" id="back">Volver a los tests</button>
    </div>`;
  bindBooks();
  document.getElementById("retry").addEventListener("click", () => startTest(test.id));
  document.getElementById("back").addEventListener("click", showHome);
  window.scrollTo(0, 0);
}

function showRepasoResults(state, fallos) {
  const { test, answers } = state;
  const total = test.preguntas.length;
  const corregidos = total - fallos.length;
  updateFailsFromRepaso(state);
  const quedan = Object.keys(loadFails()).length;
  const review = fallos.map(i => {
    const q = test.preguntas[i];
    const [tid, idx] = state.origins[i];
    const tu = answers[i] == null ? "Sin responder" : `${LETTERS[answers[i]]}) ${q[1 + answers[i]]}`;
    return `<div class="review">
      <p><strong>Test ${tid} · ${idx + 1}. ${q[0]}</strong></p>
      <p class="tu">Tu respuesta: ${tu}</p>
      <p class="ok">Correcta: ${LETTERS[q[4]]}) ${q[1 + q[4]]}</p>
      ${bookBlock(`ex-${i}`, getExpl(tid, idx))}</div>`;
  }).join("");
  app.innerHTML = `
    <div class="score ${quedan ? "fail" : "pass"}">
      <p class="verdict">${quedan ? "REPASO TERMINADO" : "¡SIN FALLOS PENDIENTES!"}</p>
      <div class="big">${corregidos} / ${total}</div>
      <p>Fallos corregidos: ${corregidos} · Te quedan: ${quedan}</p>
    </div>
    ${fallos.length ? `<h2>Siguen pendientes</h2>${review}` : "<p><strong>¡Has corregido todos los fallos!</strong></p>"}
    <div class="actions">
      ${quedan ? `<button class="btn" id="retry">Repasar los que quedan</button>` : ""}
      <button class="btn ghost" id="back">Volver a los tests</button>
    </div>`;
  bindBooks();
  const rt = document.getElementById("retry");
  if (rt) rt.addEventListener("click", startRepaso);
  document.getElementById("back").addEventListener("click", showHome);
  window.scrollTo(0, 0);
}

document.getElementById("home-link").addEventListener("click", e => { e.preventDefault(); showHome(); });
document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
showHome();

/* ---------- Pantalla de bienvenida ---------- */
(function () {
  const splash = document.getElementById("splash");
  if (!splash) return;
  const quitar = () => { splash.remove(); document.body.classList.add("ready"); };
  splash.addEventListener("animationend", e => { if (e.animationName === "splash-out") quitar(); });
  setTimeout(quitar, 2600); // por si acaso
})();
