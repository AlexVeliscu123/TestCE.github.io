const app = document.getElementById("app");
const LETTERS = ["a", "b", "c"];
const STORE_KEY = "tests-ce-resultados";
const THEME_KEY = "tests-ce-tema";
const MODE_KEY = "tests-ce-modo";
const MAX_FALLOS = 2; // 2 fallos o menos = aprobado; 3 o más = suspenso

let timer = null;
function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

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
  if (meta) meta.setAttribute("content", next === "dark" ? "#12385f" : "#0a4c8c");
}

/* ---------- Inicio ---------- */
function showHome() {
  clearTimer();
  const results = loadResults();
  const mode = getMode();
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
      tiles += `<button class="tile ${cls}" data-id="${id}">
        <strong>Test ${id}</strong><small>${info}</small></button>`;
    } else {
      tiles += `<button class="tile" disabled><strong>Test ${id}</strong><small>Próximamente</small></button>`;
    }
  }
  app.innerHTML = `
    <h1>Elige un test</h1>
    <p class="lead">Aprobado con ${MAX_FALLOS} fallos o menos. Con ${MAX_FALLOS + 1} o más, suspenso.</p>
    <div class="modes" role="group" aria-label="Modo de test">
      <button class="mode" data-mode="estudio" aria-pressed="${mode === "estudio"}">
        <strong>Modo estudio</strong>
        <span>Ves al instante si has acertado y pasa solo a la siguiente.</span>
      </button>
      <button class="mode" data-mode="examen" aria-pressed="${mode === "examen"}">
        <strong>Modo examen</strong>
        <span>Sin pistas. La nota y los fallos los ves al finalizar.</span>
      </button>
    </div>
    <div class="grid">${tiles}</div>`;
  app.querySelectorAll(".mode").forEach(b => b.addEventListener("click", () => {
    setMode(b.dataset.mode);
    app.querySelectorAll(".mode").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  }));
  app.querySelectorAll(".tile[data-id]").forEach(b =>
    b.addEventListener("click", () => startTest(Number(b.dataset.id))));
  window.scrollTo(0, 0);
}

function startTest(id) {
  clearTimer();
  const test = TESTS.find(t => t.id === id);
  const state = { test, i: 0, answers: [], mode: getMode() };
  showQuestion(state);
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

/* ---------- Pregunta ---------- */
function countFallos(state) {
  let f = 0;
  state.answers.forEach((a, i) => { if (a != null && a !== state.test.preguntas[i][4]) f++; });
  return f;
}

function showQuestion(state) {
  clearTimer();
  const { test, i, mode } = state;
  const q = test.preguntas[i];
  const total = test.preguntas.length;
  const last = i === total - 1;
  const exam = mode === "examen";
  const answeredCount = state.answers.filter(a => a != null).length;
  const fallosNow = countFallos(state);
  const live = exam
    ? `<span class="pill live">Contestadas ${answeredCount}/${total}</span>`
    : `<span class="pill live ${fallosNow > MAX_FALLOS ? "warn" : ""}">Fallos: ${fallosNow}</span>`;

  const navHtml = exam ? `
    <p class="nav-title">Ir a una pregunta:</p>
    <div class="nav">${test.preguntas.map((_, n) =>
      `<button data-go="${n}" class="${n === i ? "current" : state.answers[n] != null ? "answered" : ""}" aria-label="Pregunta ${n + 1}">${n + 1}</button>`
    ).join("")}</div>` : "";

  app.innerHTML = `
    <div class="meta">
      <span><span class="pill">${exam ? "Examen" : "Estudio"}</span> ${test.titulo}</span>
      ${live}
      <span>Pregunta ${i + 1} de ${total}</span>
    </div>
    <div class="progress"><i style="width:${((i + (state.answers[i] != null ? 1 : 0)) / total) * 100}%"></i></div>
    <div class="card">
      <p class="question">${q[0]}</p>
      <div id="q-img"></div>
      <div class="opts">
        ${[1, 2, 3].map((n, k) => q[n] == null ? "" : `<button class="opt" data-k="${k}">
          <span class="letter">${LETTERS[k]}</span><span>${q[n]}</span></button>`).join("")}
      </div>
      <div id="feedback"></div>
    </div>
    <div class="actions">
      ${exam ? `<button class="btn ghost" id="prev" ${i === 0 ? "disabled" : ""}>Anterior</button>
        <button class="btn ghost" id="skip" ${last ? "disabled" : ""}>Siguiente</button>
        <button class="btn finish" id="finish">Finalizar examen</button>`
        : `<button class="btn" id="next" hidden></button>`}
    </div>
    ${navHtml}`;

  const buttons = app.querySelectorAll(".opt");
  attachImage(test.id, i, q[5]);

  if (exam) {
    // Marca la respuesta ya elegida (se puede cambiar antes de finalizar)
    if (state.answers[i] != null) {
      buttons.forEach(x => { if (Number(x.dataset.k) === state.answers[i]) x.classList.add("selected"); });
    }
    buttons.forEach(b => b.addEventListener("click", () => {
      state.answers[i] = Number(b.dataset.k);
      buttons.forEach(x => x.classList.toggle("selected", x === b));
      if (!last) {
        buttons.forEach(x => (x.disabled = true));
        timer = setTimeout(() => { state.i++; showQuestion(state); window.scrollTo(0, 0); }, 280);
      } else {
        // Última pregunta: se queda para que pulses Finalizar
        document.getElementById("finish").focus();
        updateNavMark(state);
      }
    }));
    document.getElementById("prev").addEventListener("click", () => { state.i--; showQuestion(state); window.scrollTo(0, 0); });
    document.getElementById("skip").addEventListener("click", () => { state.i++; showQuestion(state); window.scrollTo(0, 0); });
    document.getElementById("finish").addEventListener("click", () => {
      const sin = total - state.answers.filter(a => a != null).length;
      if (sin > 0 && !confirm(`Te quedan ${sin} preguntas sin contestar (cuentan como fallo). ¿Finalizar igualmente?`)) return;
      showResults(state);
    });
    app.querySelectorAll(".nav button").forEach(b => b.addEventListener("click", () => {
      state.i = Number(b.dataset.go); showQuestion(state); window.scrollTo(0, 0);
    }));
    return;
  }

  // Modo estudio: respuesta al instante y avance automático
  buttons.forEach(b => b.addEventListener("click", () => {
    const k = Number(b.dataset.k);
    state.answers[i] = k;
    const ok = k === q[4];
    buttons.forEach(x => {
      x.disabled = true;
      if (Number(x.dataset.k) === q[4]) x.classList.add("correct");
    });
    if (!ok) b.classList.add("wrong");
    document.getElementById("feedback").innerHTML = ok
      ? `<p class="feedback ok">¡Correcto!</p>`
      : `<p class="feedback ko">Incorrecto. La respuesta correcta es la ${LETTERS[q[4]]}).</p>`;
    const next = document.getElementById("next");
    next.hidden = false;
    next.textContent = last ? "Ver resultado" : "Siguiente ahora";
    next.focus();
    const go = () => { clearTimer(); if (last) showResults(state); else { state.i++; showQuestion(state); window.scrollTo(0, 0); } };
    next.addEventListener("click", go);
    timer = setTimeout(go, ok ? 1200 : 2800);
  }));
}

function updateNavMark(state) {
  const nb = app.querySelectorAll(".nav button")[state.i];
  if (nb) nb.classList.add("answered");
  const pill = app.querySelector(".pill.live");
  if (pill) pill.textContent = `Contestadas ${state.answers.filter(a => a != null).length}/${state.test.preguntas.length}`;
}

/* ---------- Resultados ---------- */
function showResults(state) {
  clearTimer();
  const { test, answers } = state;
  const total = test.preguntas.length;
  const fallos = [];
  test.preguntas.forEach((q, i) => { if (answers[i] !== q[4]) fallos.push(i); });
  const aciertos = total - fallos.length;
  saveResult(test.id, aciertos, total);
  const aprobado = fallos.length <= MAX_FALLOS;
  const nota = ((aciertos / total) * 10).toFixed(1).replace(".", ",");
  const review = fallos.map(i => {
    const q = test.preguntas[i];
    const tu = answers[i] == null ? "Sin responder" : `${LETTERS[answers[i]]}) ${q[1 + answers[i]]}`;
    return `<div class="review">
      <p><strong>${i + 1}. ${q[0]}</strong></p>
      <p class="tu">Tu respuesta: ${tu}</p>
      <p class="ok">Correcta: ${LETTERS[q[4]]}) ${q[1 + q[4]]}</p></div>`;
  }).join("");
  app.innerHTML = `
    <div class="score ${aprobado ? "pass" : "fail"}">
      <p class="verdict">${aprobado ? "¡APROBADO!" : "SUSPENSO"}</p>
      <div class="big">${aciertos} / ${total}</div>
      <p>Nota: ${nota} sobre 10 · Fallos: ${fallos.length}</p>
      <p class="rule">Se aprueba con ${MAX_FALLOS} fallos o menos.</p>
    </div>
    ${fallos.length ? `<h2>Preguntas falladas</h2>${review}` : "<p><strong>¡Sin ningún fallo!</strong></p>"}
    <div class="actions">
      <button class="btn" id="retry">Repetir test</button>
      <button class="btn ghost" id="back">Volver a los tests</button>
    </div>`;
  document.getElementById("retry").addEventListener("click", () => startTest(test.id));
  document.getElementById("back").addEventListener("click", showHome);
  window.scrollTo(0, 0);
}

document.getElementById("home-link").addEventListener("click", e => { e.preventDefault(); showHome(); });
document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
showHome();
