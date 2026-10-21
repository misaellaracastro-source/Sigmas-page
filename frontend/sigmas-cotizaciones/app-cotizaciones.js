const money = new Intl.NumberFormat("es-CO");
const toast = document.getElementById("toast");
let toastTimer;

const references = [
  {
    code: "CT-001",
    name: "Camiseta básica",
    hint: "Talla M · Blanco · 3 materiales asociados",
    unitCost: 24050,
    materials: [
      { name: "Algodón jersey blanco", qty: 1.2, unit: "m", cost: 18000 },
      { name: "Hilo blanco", qty: 15, unit: "m", cost: 120 },
      { name: "Etiqueta tejida", qty: 1, unit: "und", cost: 650 },
    ],
  },
  {
    code: "BL-002",
    name: "Blusa de lino",
    hint: "Talla M · Arena · 4 materiales asociados",
    unitCost: 41340,
    materials: [
      { name: "Lino arena", qty: 1.4, unit: "m", cost: 25000 },
      { name: "Hilo blanco", qty: 18, unit: "m", cost: 120 },
      { name: "Botón 12 mm", qty: 6, unit: "und", cost: 350 },
      { name: "Etiqueta tejida", qty: 1, unit: "und", cost: 650 },
    ],
  },
  {
    code: "PT-003",
    name: "Pantalón confort",
    hint: "Talla M · Blanco · 4 materiales asociados",
    unitCost: 36890,
    materials: [
      { name: "Algodón jersey blanco", qty: 1.6, unit: "m", cost: 18000 },
      { name: "Elástico 3 cm", qty: 0.8, unit: "m", cost: 1800 },
      { name: "Hilo blanco", qty: 20, unit: "m", cost: 120 },
      { name: "Etiqueta tejida", qty: 1, unit: "und", cost: 650 },
    ],
  },
];

const quotes = [
  {
    id: "COT-2026-003",
    date: "13/10/2026",
    refCode: "CT-001",
    refName: "Camiseta básica",
    qty: 100,
    total: 2405000,
  },
  {
    id: "COT-2026-002",
    date: "12/10/2026",
    refCode: "BL-002",
    refName: "Blusa de lino",
    qty: 50,
    total: 2067000,
  },
  {
    id: "COT-2026-001",
    date: "10/10/2026",
    refCode: "PT-003",
    refName: "Pantalón confort",
    qty: 30,
    total: 1106700,
  },
];

let currentEstimate = null;

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

function formatMoney(value) {
  return "$" + money.format(Math.round(value));
}

function formatQty(qty, unit) {
  const n = Number.isInteger(qty) ? qty : Number(qty.toFixed(2));
  const text = String(n).replace(".", ",");
  return `${text} ${unit}`;
}

function nextQuoteId() {
  const nums = quotes
    .map((q) => Number(String(q.id).split("-").pop()))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `COT-2026-${String(next).padStart(3, "0")}`;
}

function populateSelect() {
  const select = document.getElementById("referencia");
  select.innerHTML = references
    .map((r) => `<option value="${r.code}">${r.code} · ${r.name}</option>`)
    .join("");
}

function getRef(code) {
  return references.find((r) => r.code === code) || references[0];
}

function updateHints() {
  const ref = getRef(document.getElementById("referencia").value);
  document.getElementById("ref-hint").textContent = ref.hint;
  document.getElementById("unit-cost-line").textContent =
    `Costo de materiales / prenda: ${formatMoney(ref.unitCost)} COP`;
}

function clearErrors() {
  document.querySelectorAll(".is-bad").forEach((el) => el.classList.remove("is-bad"));
  document.querySelectorAll(".field-error").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
}

function renderEstimate(ref, qty) {
  const total = ref.unitCost * qty;
  currentEstimate = { ref, qty, total };

  document.getElementById("side-total").textContent = formatMoney(total);
  document.getElementById("side-hint").textContent = `COP · ${qty} prendas · ${ref.code}`;
  document.getElementById("side-formula").textContent = `${qty} × ${formatMoney(ref.unitCost)}`;

  document.getElementById("materials-title").textContent = `Materiales para ${qty} prendas`;
  document.getElementById("materials-sub").textContent =
    `${ref.code} · ${ref.name} · Consumos calculados a partir de la referencia`;

  const body = document.getElementById("materials-body");
  body.innerHTML = "";
  ref.materials.forEach((m) => {
    const totalQty = m.qty * qty;
    const subtotal = totalQty * m.cost;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mat-name">${m.name}</td>
      <td>${formatQty(m.qty, m.unit)}</td>
      <td>${formatQty(totalQty, m.unit)}</td>
      <td class="num">${formatMoney(m.cost)} / ${m.unit}</td>
      <td class="num">${formatMoney(subtotal)}</td>
    `;
    body.appendChild(tr);
  });

  document.getElementById("materials-count").textContent =
    `${ref.materials.length} materiales · unidades explícitas`;
  document.getElementById("materials-total").textContent = `${formatMoney(total)} COP`;
}

function renderHistory() {
  const body = document.getElementById("history-body");
  body.innerHTML = "";
  let sum = 0;
  quotes.forEach((q, index) => {
    sum += q.total;
    const tr = document.createElement("tr");
    if (index === 0) tr.classList.add("is-highlight");
    tr.innerHTML = `
      <td class="mat-name">${q.id}</td>
      <td>${q.date}</td>
      <td>${q.refCode} · ${q.refName}</td>
      <td>${money.format(q.qty)} prendas</td>
      <td class="num">${formatMoney(q.total)}</td>
    `;
    body.appendChild(tr);
  });
  document.getElementById("history-summary").textContent =
    `${quotes.length} solicitudes · Total estimado de materiales: ${formatMoney(sum)} COP`;
}

document.getElementById("referencia").addEventListener("change", () => {
  updateHints();
  const qty = Number(document.getElementById("cantidad").value) || 1;
  renderEstimate(getRef(document.getElementById("referencia").value), qty);
});

document.getElementById("cantidad").addEventListener("input", () => {
  const qty = Number(document.getElementById("cantidad").value);
  if (qty > 0) {
    renderEstimate(getRef(document.getElementById("referencia").value), qty);
  }
});

document.getElementById("quote-form").addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();
  const qty = Number(document.getElementById("cantidad").value);
  if (!(qty > 0) || !Number.isInteger(qty)) {
    const input = document.getElementById("cantidad");
    const error = document.getElementById("cantidad-error");
    input.classList.add("is-bad");
    error.textContent = "Indica un número entero de prendas mayor a 0.";
    error.hidden = false;
    return;
  }
  const ref = getRef(document.getElementById("referencia").value);
  renderEstimate(ref, qty);
  showToast("Estimación calculada");
});

document.getElementById("btn-clear").addEventListener("click", () => {
  document.getElementById("referencia").value = "CT-001";
  document.getElementById("cantidad").value = "100";
  clearErrors();
  updateHints();
  renderEstimate(getRef("CT-001"), 100);
  showToast("Formulario restablecido");
});

document.getElementById("btn-save").addEventListener("click", () => {
  if (!currentEstimate) return;
  const ref = currentEstimate.ref;
  const qty = currentEstimate.qty;
  const id = nextQuoteId();
  quotes.unshift({
    id,
    date: document.getElementById("fecha").value,
    refCode: ref.code,
    refName: ref.name,
    qty,
    total: currentEstimate.total,
  });
  document.getElementById("numero").value = nextQuoteId();
  renderHistory();
  showToast(`Cotización ${id} guardada`);
});

document.getElementById("btn-export").addEventListener("click", () => {
  showToast("Cotización exportada · función de muestra");
});

document.getElementById("user-menu").addEventListener("click", () => {
  showToast("Menú de cuenta · María Pérez");
});

populateSelect();
updateHints();
renderEstimate(getRef("CT-001"), 100);
renderHistory();
