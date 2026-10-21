const NIT_RE = /^\d{3}\.?\d{3}\.?\d{3}-?\d$/;
const USER_RE = /^[a-zA-Z][a-zA-Z0-9._]{2,30}$/;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASS_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const auth = document.getElementById("auth");
const workspace = document.getElementById("workspace");
const notice = document.getElementById("notice");
const form = document.getElementById("panel-register");

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}

function clearErrors() {
  document.querySelectorAll(".is-bad").forEach((input) => {
    input.classList.remove("is-bad");
    input.removeAttribute("aria-invalid");
  });
  document.querySelectorAll(".field-error").forEach((node) => {
    node.hidden = true;
    node.textContent = "";
  });
  document.querySelectorAll(".hint").forEach((node) => {
    node.hidden = false;
  });
}

function setError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(id + "-error");
  const hint = document.getElementById(id + "-hint");
  if (input) {
    input.classList.add("is-bad");
    input.setAttribute("aria-invalid", "true");
  }
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
  if (hint) hint.hidden = true;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBusy(button, label, task) {
  const text = button.querySelector("span");
  const previous = text ? text.textContent : button.textContent;
  button.disabled = true;
  if (text) text.textContent = label;
  try {
    await task();
  } finally {
    button.disabled = false;
    if (text) text.textContent = previous;
  }
}

function openWorkspace() {
  document.getElementById("ws-user").textContent = document.getElementById("usuario").value.trim();
  document.getElementById("ws-empresa").textContent = document.getElementById("empresa").value.trim();
  auth.hidden = true;
  workspace.hidden = false;
  window.scrollTo(0, 0);
}

document.querySelectorAll(".eye").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.target);
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.setAttribute("aria-pressed", String(!visible));
    button.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
    button.querySelector(".icon-show").hidden = !visible;
    button.querySelector(".icon-hide").hidden = visible;
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();

  const empresa = document.getElementById("empresa");
  const nit = document.getElementById("nit");
  const nombre = document.getElementById("nombre");
  const usuario = document.getElementById("usuario");
  const correo = document.getElementById("correo");
  const password = document.getElementById("password");
  const password2 = document.getElementById("password2");
  const terms = document.getElementById("terms");

  let ok = true;

  if (empresa.value.trim().length < 3) {
    setError("empresa", "Escribe el nombre de la empresa.");
    ok = false;
  }
  if (!NIT_RE.test(nit.value.trim())) {
    setError("nit", "Incluye el NIT y el dígito de verificación.");
    ok = false;
  }
  if (nombre.value.trim().length < 3) {
    setError("nombre", "Escribe el nombre completo del administrador.");
    ok = false;
  }
  if (!USER_RE.test(usuario.value.trim())) {
    setError("usuario", "Usa letras, puntos o guion bajo. Mínimo 3 caracteres.");
    ok = false;
  }
  if (!MAIL_RE.test(correo.value.trim())) {
    setError("correo", "Escribe un correo electrónico válido.");
    ok = false;
  }
  if (!PASS_RE.test(password.value)) {
    setError("password", "Mínimo 8 caracteres, con letras y números.");
    ok = false;
  }
  if (password2.value !== password.value) {
    setError("password2", "Las contraseñas no coinciden.");
    ok = false;
  }
  if (!terms.checked) {
    setError("terms", "Debes aceptar los términos y la política de datos.");
    ok = false;
  }
  if (!ok) return;

  withBusy(event.submitter, "Creando…", async () => {
    await wait(500);
    openWorkspace();
  });
});

document.getElementById("back-btn").addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("close-btn").addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("go-login").addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("logout").addEventListener("click", () => {
  workspace.hidden = true;
  auth.hidden = false;
  clearErrors();
  notice.hidden = true;
  window.scrollTo(0, 0);
});
