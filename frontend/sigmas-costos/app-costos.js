const money = new Intl.NumberFormat("es-CO");
const toast = document.getElementById("toast");
let toastTimer;

const references = [
  {
    code: "CT-001",
    name: "Camiseta básica",
    desc: "Camiseta de manga corta · Talla M · Blanco",
    garment: "Camiseta · M · Blanco",
    materials: [
      { name: "Algodón jersey blanco", code: "TEL-001", qty: 1.2, unit: "m", cost: 18000 },
      { name: "Hilo blanco", code: "INS-001", qty: 15, unit: "m", cost: 120 },
      { name: "Etiqueta tejida", code: "INS-002", qty: 1, unit: "und", cost: 650 },
    ],
  },
  {
    code: "BL-002",
    name: "Blusa de lino",
    desc: "Blusa de lino · Talla M · Arena",
    garment: "Blusa · M · Arena",
    materials: [
      { name: "Lino arena", code: "TEL-002", qty: 1.4, unit: "m", cost: 25000 },
      { name: "Hilo blanco", code: "INS-001", qty: 18, unit: "m", cost: 120 },
      { name: "Botón 12 mm", code: "INS-004", qty: 6, unit: "und", cost: 350 },
      { name: "Etiqueta tejida", code: "INS-002", qty: 1, unit: "und", cost: 650 },
    ],
  },
  {
    code: "PT-003",
    name: "Pantalón confort",
    desc: "Pantalón confort · Talla M · Blanco",
    garment: "Pantalón · M · Blanco",
    materials: [
      { name: "Algodón jersey blanco", code: "TEL-001", qty: 1.6, unit: "m", cost: 18000 },
      { name: "Elástico 3 cm", code: "INS-003", qty: 0.8, unit: "m", cost: 1800 },
      { name: "Hilo blanco", code: "INS-001", qty: 20, unit: "m", cost: 120 },
      { name: "Etiqueta tejida", code: "INS-002", qty: 1, unit: "und", cost: 650 },
    ],
  },
];

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
  const n = Number.isInteger(qty) ? qty : qty.toFixed(2).replace(".", ",");
  return `${n} ${unit}`;
}

function shortName(name) {
  return name
    .replace(" blanco", "")
    .replace(" arena", "")
    .replace("Algodón jersey", "Algodón jersey")
    .trim();
}

function totalOf(ref) {
  return ref.materials.reduce((sum, m) => sum + m.qty * m.cost, 0);
}

function populateSelect() {
  const select = document.getElementById("referencia");
  select.innerHTML = references
    .map((r) => `<option value="${r.code}">${r.code} · ${r.name}</option>`)
    .join("");
}

function renderOthers(activeCode) {
  const body = document.getElementById("others-body");
  body.innerHTML = "";
  references.forEach((ref) => {
    const tr = document.createElement("tr");
    if (ref.code === activeCode) tr.classList.add("is-highlight");
    const total = totalOf(ref);
    tr.innerHTML = `
      <td class="mat-name">${ref.code}</td>
      <td>${ref.name}</td>
      <td>${ref.garment}</td>
      <td>${ref.materials.length} materiales</td>
      <td class="num">${formatMoney(total)}</td>
    `;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      document.getElementById("referencia").value = ref.code;
      renderReference(ref.code);
    });
    body.appendChild(tr);
  });
}

function renderReference(code) {
  const ref = references.find((r) => r.code === code) || references[0];
  const total = totalOf(ref);

  document.getElementById("ref-desc").textContent = ref.desc;
  document.getElementById("ref-unit").textContent = "Unidad de cálculo: 1 prenda";
  document.getElementById("ref-count").textContent = `${ref.materials.length} materiales`;
  document.getElementById("total-amount").textContent = formatMoney(total);
  document.getElementById("side-total").textContent = formatMoney(total);
  document.getElementById("side-hint").textContent = `COP · ${ref.code} · 1 prenda`;

  const body = document.getElementById("breakdown-body");
  body.innerHTML = "";
  const parts = [];
  ref.materials.forEach((m) => {
    const sub = m.qty * m.cost;
    parts.push(formatMoney(sub));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mat-name">${m.name}</td>
      <td>${m.code}</td>
      <td>${formatQty(m.qty, m.unit)}</td>
      <td class="num">${formatMoney(m.cost)} / ${m.unit}</td>
      <td class="num">${formatMoney(sub)}</td>
    `;
    body.appendChild(tr);
  });

  document.getElementById("calc-note").textContent =
    `Cálculo verificable: ${parts.join(" + ")} = ${formatMoney(total)} COP por prenda.`;

  const shareBar = document.getElementById("share-bar");
  const shareList = document.getElementById("share-list");
  shareBar.innerHTML = "";
  shareList.innerHTML = "";

  ref.materials.forEach((m) => {
    const sub = m.qty * m.cost;
    const pct = total ? (sub / total) * 100 : 0;
    const seg = document.createElement("span");
    seg.style.width = `${pct}%`;
    shareBar.appendChild(seg);

    const li = document.createElement("li");
    li.innerHTML = `<span>${shortName(m.name)}</span><strong>${pct.toFixed(1).replace(".", ",")} %</strong>`;
    shareList.appendChild(li);
  });

  renderOthers(ref.code);
}

populateSelect();
document.getElementById("referencia").addEventListener("change", (event) => {
  renderReference(event.target.value);
});

document.getElementById("btn-export").addEventListener("click", () => {
  showToast("Desglose exportado · función de muestra");
});

document.getElementById("btn-cotizacion").addEventListener("click", () => {
  const code = document.getElementById("referencia").value;
  showToast(`Cotización de ${code} lista para armar`);
});

document.getElementById("user-menu").addEventListener("click", () => {
  showToast("Menú de cuenta · María Pérez");
});

renderReference("CT-001");
