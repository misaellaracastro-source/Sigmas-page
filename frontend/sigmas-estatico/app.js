const NIT_RE = /^\d{3}\.?\d{3}\.?\d{3}-?\d$/;
const USER_RE = /^[a-zA-Z][a-zA-Z0-9._]{2,30}$/;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBER_KEY = "sigmas.remember";

const auth = document.getElementById("auth");
const workspace = document.getElementById("workspace");
const notice = document.getElementById("notice");
const topPrompt = document.getElementById("top-prompt");
const topLink = document.getElementById("top-link");
const panels = {
  login: document.getElementById("panel-login"),
  register: document.getElementById("panel-register"),
  forgot: document.getElementById("panel-forgot"),
};

const nitInput = document.getElementById("nit");
const usuarioInput = document.getElementById("usuario");
const passwordInput = document.getElementById("password");
const rememberInput = document.getElementById("remember");

function showPanel(name) {
  Object.entries(panels).forEach(([key, form]) => {
    form.hidden = key !== name;
  });
  clearErrors();
  notice.hidden = true;
  if (name === "login") {
    topPrompt.textContent = "¿Aún no tienes una cuenta?";
    topLink.textContent = "Registrar empresa →";
    topLink.dataset.go = "register";
  } else {
    topPrompt.textContent = "¿Ya tienes acceso?";
    topLink.textContent = "Iniciar sesión →";
    topLink.dataset.go = "login";
  }
  const main = document.querySelector(".auth-main");
  main.style.animation = "none";
  void main.offsetWidth;
  main.style.animation = "";
}

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
  input.classList.add("is-bad");
  input.setAttribute("aria-invalid", "true");
  error.textContent = message;
  error.hidden = false;
  if (hint) hint.hidden = true;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBusy(button, label, task) {
  const text = button.querySelector("span");
  const previous = text.textContent;
  button.disabled = true;
  text.textContent = label;
  try {
    await task();
  } finally {
    button.disabled = false;
    text.textContent = previous;
  }
}

function openWorkspace() {
  window.location.href = "../sigmas-dashboard/dashboard.html";
}

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => showPanel(button.dataset.go));
});

document.getElementById("toggle-pass").addEventListener("click", () => {
  const button = document.getElementById("toggle-pass");
  const visible = passwordInput.type === "text";
  passwordInput.type = visible ? "password" : "text";
  button.setAttribute("aria-pressed", String(!visible));
  button.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
  button.querySelector(".icon-show").hidden = !visible;
  button.querySelector(".icon-hide").hidden = visible;
});

panels.login.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();
  let ok = true;
  if (!NIT_RE.test(nitInput.value.trim())) {
    setError("nit", "Incluye el NIT y el dígito de verificación.");
    ok = false;
  }
  if (!USER_RE.test(usuarioInput.value.trim())) {
    setError("usuario", "Usa letras, puntos o guion bajo. Mínimo 3 caracteres.");
    ok = false;
  }
  if (passwordInput.value.length < 8) {
    setError("password", "La contraseña debe tener al menos 8 caracteres.");
    ok = false;
  }
  if (!ok) return;
  withBusy(event.submitter, "Ingresando…", async () => {
    await wait(450);
    if (rememberInput.checked) {
      localStorage.setItem(
        REMEMBER_KEY,
        JSON.stringify({ nit: nitInput.value.trim(), usuario: usuarioInput.value.trim() }),
      );
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
    openWorkspace();
  });
});

panels.register.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();
  const razon = document.getElementById("razon");
  const regNit = document.getElementById("reg-nit");
  const correo = document.getElementById("correo");
  const regUsuario = document.getElementById("reg-usuario");
  const regPass = document.getElementById("reg-pass");
  let ok = true;
  if (razon.value.trim().length < 3) {
    setError("razon", "Escribe la razón social de la empresa.");
    ok = false;
  }
  if (!NIT_RE.test(regNit.value.trim())) {
    setError("reg-nit", "Incluye el NIT y el dígito de verificación.");
    ok = false;
  }
  if (!MAIL_RE.test(correo.value.trim())) {
    setError("correo", "Escribe un correo válido de la empresa.");
    ok = false;
  }
  if (!USER_RE.test(regUsuario.value.trim())) {
    setError("reg-usuario", "Usa letras, puntos o guion bajo. Mínimo 3 caracteres.");
    ok = false;
  }
  if (regPass.value.length < 8) {
    setError("reg-pass", "La contraseña debe tener al menos 8 caracteres.");
    ok = false;
  }
  if (!ok) return;
  withBusy(event.submitter, "Creando…", async () => {
    await wait(450);
    nitInput.value = regNit.value.trim();
    usuarioInput.value = regUsuario.value.trim();
    passwordInput.value = "";
    showPanel("login");
    showNotice("Empresa registrada. Ingresa con el usuario que acabas de crear.");
  });
});

panels.forgot.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();
  const forgotId = document.getElementById("forgot-id");
  const forgotNit = document.getElementById("forgot-nit");
  let ok = true;
  if (forgotId.value.trim().length < 3) {
    setError("forgot-id", "Escribe el usuario o el correo de la empresa.");
    ok = false;
  }
  if (!NIT_RE.test(forgotNit.value.trim())) {
    setError("forgot-nit", "Incluye el NIT y el dígito de verificación.");
    ok = false;
  }
  if (!ok) return;
  withBusy(event.submitter, "Enviando…", async () => {
    await wait(450);
    showNotice("Si los datos coinciden, enviamos un enlace para restablecer la contraseña.");
  });
});

document.getElementById("logout").addEventListener("click", () => {
  workspace.hidden = true;
  auth.hidden = false;
  showPanel("login");
});

try {
  const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
  if (saved && saved.nit && saved.usuario) {
    nitInput.value = saved.nit;
    usuarioInput.value = saved.usuario;
    rememberInput.checked = true;
  }
} catch {
  localStorage.removeItem(REMEMBER_KEY);
}
