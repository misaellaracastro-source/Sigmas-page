const money = new Intl.NumberFormat("es-CO");
const toast = document.getElementById("toast");
let toastTimer;

const materials = [
  { code: "TEL-001", name: "Algodón jersey", type: "Tela", color: "Blanco", unit: "m", qty: 300, cost: 18000 },
  { code: "INS-001", name: "Hilo", type: "Insumo", color: "Blanco", unit: "m", qty: 6000, cost: 120 },
  { code: "INS-002", name: "Etiqueta tejida", type: "Insumo", color: "Natural", unit: "und", qty: 800, cost: 650 },
  { code: "TEL-002", name: "Lino", type: "Tela", color: "Arena", unit: "m", qty: 120, cost: 25000 },
  { code: "INS-003", name: "Elástico 3 cm", type: "Insumo", color: "Blanco", unit: "m", qty: 500, cost: 1800 },
  { code: "INS-004", name: "Botón 12 mm", type: "Insumo", color: "Marfil", unit: "und", qty: 1000, cost: 350 },
];

let filtered = [...materials];
let editingCode = null;

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

function unitLabel(unit) {
  return unit === "und" ? "und" : "m";
}

function updateValor() {
  const qty = Number(document.getElementById("cantidad").value) || 0;
  const cost = Number(document.getElementById("costo").value) || 0;
  const unit = document.getElementById("unidad").value;
  const total = qty * cost;
  document.getElementById("valor-total").textContent = formatMoney(total);
  document.getElementById("valor-detail").textContent =
    `${money.format(qty)} ${unit} × ${formatMoney(cost)} / ${unit} · COP`;
  const hint = document.getElementById("cantidad-hint");
  const costoLabel = document.querySelector('label[for="costo"]');
  if (unit === "und") {
    hint.textContent = "La cantidad se registra en unidades (und).";
    costoLabel.innerHTML = 'Costo unitario (COP / und) <span class="req">*</span>';
  } else {
    hint.textContent = "La cantidad se registra en metros (m).";
    costoLabel.innerHTML = 'Costo unitario (COP / m) <span class="req">*</span>';
  }
}

function clearErrors() {
  document.querySelectorAll(".is-bad").forEach((el) => el.classList.remove("is-bad"));
  document.querySelectorAll(".field-error").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
}

function setError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(id + "-error");
  if (input) input.classList.add("is-bad");
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function nextCode(type) {
  const prefix = type === "Tela" ? "TEL" : "INS";
  const nums = materials
    .filter((m) => m.code.startsWith(prefix))
    .map((m) => Number(m.code.split("-")[1]))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

function summarize(list) {
  const telas = list.filter((m) => m.type === "Tela").length;
  const insumos = list.filter((m) => m.type === "Insumo").length;
  document.getElementById("inventory-summary").textContent =
    `${list.length} materiales · ${telas} telas · ${insumos} insumos`;
  const total = list.reduce((sum, m) => sum + m.qty * m.cost, 0);
  document.getElementById("showing-label").textContent =
    `Mostrando ${list.length} de ${materials.length} materiales`;
  document.getElementById("total-label").textContent =
    `Valor total: ${formatMoney(total)} COP`;
}

function renderTable() {
  const body = document.getElementById("inventory-body");
  body.innerHTML = "";
  filtered.forEach((item, index) => {
    const tr = document.createElement("tr");
    if (index === 0) tr.classList.add("is-highlight");
    tr.innerHTML = `
      <td class="material-name">${item.code} · ${item.name}</td>
      <td>${item.type}</td>
      <td>${item.color}</td>
      <td>${item.unit}</td>
      <td>${money.format(item.qty)} ${unitLabel(item.unit)}</td>
      <td class="num">${formatMoney(item.cost)}</td>
      <td><button type="button" class="link-btn" data-edit="${item.code}">Editar</button></td>
    `;
    body.appendChild(tr);
  });
  summarize(filtered);

  body.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = materials.find((m) => m.code === btn.dataset.edit);
      if (!item) return;
      editingCode = item.code;
      document.getElementById("nombre").value = item.name;
      document.getElementById("tipo").value = item.type;
      document.getElementById("color").value = item.color;
      document.getElementById("unidad").value = item.unit;
      document.getElementById("cantidad").value = item.qty;
      document.getElementById("costo").value = item.cost;
      updateValor();
      showToast(`Editando ${item.code}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function applyFilters() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const type = document.getElementById("filter-tipo").value;
  filtered = materials.filter((m) => {
    const matchType = !type || m.type === type;
    const hay = `${m.code} ${m.name} ${m.color}`.toLowerCase();
    const matchQ = !q || hay.includes(q);
    return matchType && matchQ;
  });
  renderTable();
}

function resetForm() {
  editingCode = null;
  document.getElementById("material-form").reset();
  document.getElementById("nombre").value = "";
  document.getElementById("color").value = "";
  document.getElementById("cantidad").value = "";
  document.getElementById("costo").value = "";
  document.getElementById("tipo").value = "Tela";
  document.getElementById("unidad").value = "m";
  clearErrors();
  updateValor();
}

["cantidad", "costo", "unidad"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateValor);
  document.getElementById(id).addEventListener("change", updateValor);
});

document.getElementById("btn-clear").addEventListener("click", () => {
  resetForm();
  showToast("Formulario limpio");
});

document.getElementById("material-form").addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();

  const name = document.getElementById("nombre").value.trim();
  const type = document.getElementById("tipo").value;
  const color = document.getElementById("color").value.trim();
  const unit = document.getElementById("unidad").value;
  const qty = Number(document.getElementById("cantidad").value);
  const cost = Number(document.getElementById("costo").value);

  let ok = true;
  if (name.length < 2) {
    setError("nombre", "Escribe el nombre del material.");
    ok = false;
  }
  if (color.length < 2) {
    setError("color", "Escribe el color.");
    ok = false;
  }
  if (!(qty > 0)) {
    setError("cantidad", "Indica una cantidad mayor a 0.");
    ok = false;
  }
  if (!(cost >= 0) || document.getElementById("costo").value === "") {
    setError("costo", "Indica el costo unitario.");
    ok = false;
  }
  if (!ok) return;

  if (editingCode) {
    const item = materials.find((m) => m.code === editingCode);
    Object.assign(item, { name, type, color, unit, qty, cost });
    showToast(`Material ${editingCode} actualizado`);
  } else {
    const code = nextCode(type);
    materials.unshift({ code, name, type, color, unit, qty, cost });
    showToast(`Material ${code} registrado`);
  }

  editingCode = null;
  applyFilters();
  resetForm();
});

document.getElementById("btn-search").addEventListener("click", applyFilters);
document.getElementById("search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyFilters();
  }
});
document.getElementById("filter-tipo").addEventListener("change", applyFilters);

document.getElementById("btn-export").addEventListener("click", () => {
  showToast("Exportación de muestra lista");
});

document.getElementById("user-menu").addEventListener("click", () => {
  showToast("Menú de cuenta · María Pérez");
});

updateValor();
renderTable();
