const app = document.getElementById("app");
const LETTERS = ["a", "b", "c"];
const STORE_KEY = "tests-ce-resultados";

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

function showHome() {
  const results = loadResults();
  let tiles = "";
  for (let id = 1; id <= TOTAL_TESTS; id++) {
    const t = TESTS.find(x => x.id === id);
    if (t) {
      const r = results[id];
      tiles += `<button class="tile ${r ? "done" : ""}" data-id="${id}">
        <strong>Test ${id}</strong>
        <small>${r ? `Mejor: ${r.mejor}/${r.total}` : `${t.preguntas.length} preguntas`}</small></button>`;
    } else {
      tiles += `<button class="tile" disabled><strong>Test ${id}</strong><small>Próximamente</small></button>`;
    }
  }
  app.innerHTML = `<h1>Elige un test</h1>
    <p class="lead">Cada test tiene 20 preguntas con tres respuestas (a, b, c). Verás al instante si has acertado.</p>
    <div class="grid">${tiles}</div>`;
  app.querySelectorAll(".tile[data-id]").forEach(b =>
    b.addEventListener("click", () => startTest(Number(b.dataset.id))));
}

function startTest(id) {
  const test = TESTS.find(t => t.id === id);
  const state = { test, i: 0, answers: [] };
  showQuestion(state);
}

function showQuestion(state) {
  const { test, i } = state;
  const q = test.preguntas[i];
  const total = test.preguntas.length;
  const img = q[5] ? `<img class="q-img" src="${q[5]}" alt="Imagen de la pregunta">` : "";
  app.innerHTML = `
    <div class="meta"><span>${test.titulo}</span><span>Pregunta ${i + 1} de ${total}</span></div>
    <div class="progress"><i style="width:${(i / total) * 100}%"></i></div>
    <p class="question">${q[0]}</p>
    ${img}
    <div class="opts">
      ${[1, 2, 3].map((n, k) => q[n] == null ? "" : `<button class="opt" data-k="${k}">
        <span class="letter">${LETTERS[k]}</span><span>${q[n]}</span></button>`).join("")}
    </div>
    <div id="next-area"></div>`;
  const buttons = app.querySelectorAll(".opt");
  buttons.forEach(b => b.addEventListener("click", () => {
    const k = Number(b.dataset.k);
    state.answers[i] = k;
    buttons.forEach(x => {
      x.disabled = true;
      if (Number(x.dataset.k) === q[4]) x.classList.add("correct");
    });
    if (k !== q[4]) b.classList.add("wrong");
    const last = i === total - 1;
    const area = document.getElementById("next-area");
    area.innerHTML = `<button class="btn" id="next">${last ? "Ver resultado" : "Siguiente"}</button>`;
    const next = document.getElementById("next");
    next.focus();
    next.addEventListener("click", () => {
      if (last) showResults(state); else { state.i++; showQuestion(state); }
    });
  }));
}

function showResults(state) {
  const { test, answers } = state;
  const total = test.preguntas.length;
  const fallos = [];
  test.preguntas.forEach((q, i) => { if (answers[i] !== q[4]) fallos.push(i); });
  const aciertos = total - fallos.length;
  saveResult(test.id, aciertos, total);
  const nota = ((aciertos / total) * 10).toFixed(1).replace(".", ",");
  const review = fallos.map(i => {
    const q = test.preguntas[i];
    return `<div class="review">
      <p><strong>${i + 1}. ${q[0]}</strong></p>
      <p class="tu">Tu respuesta: ${LETTERS[answers[i]]}) ${q[1 + answers[i]]}</p>
      <p class="ok">Correcta: ${LETTERS[q[4]]}) ${q[1 + q[4]]}</p></div>`;
  }).join("");
  app.innerHTML = `
    <div class="score ${fallos.length === 0 ? "pass" : ""}">
      <div class="big">${aciertos} / ${total}</div>
      <p>Nota: ${nota} sobre 10 · Errores: ${fallos.length}</p>
    </div>
    ${fallos.length ? `<h2>Preguntas falladas</h2>${review}` : "<p>¡Sin ningún error!</p>"}
    <button class="btn" id="retry">Repetir test</button>
    <button class="btn ghost" id="back">Volver a los tests</button>`;
  document.getElementById("retry").addEventListener("click", () => startTest(test.id));
  document.getElementById("back").addEventListener("click", showHome);
}

document.getElementById("home-link").addEventListener("click", e => { e.preventDefault(); showHome(); });
showHome();
