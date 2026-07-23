/* ── Toggle password visibility ──────────────────────────────── */
function togglePw(inputId, openId, closeId) {
  const input = document.getElementById(inputId);
  const open  = document.getElementById(openId);
  const close = document.getElementById(closeId);
  const show  = input.type === 'password';
  input.type          = show ? 'text'     : 'password';
  open.style.display  = show ? 'none'     : 'block';
  close.style.display = show ? 'block'    : 'none';
}

/* ── Alert helpers ───────────────────────────────────────────── */
function showError(msg) {
  const el = document.getElementById('errorAlert');
  el.textContent   = msg;
  el.style.display = 'block';
  document.getElementById('successAlert').style.display = 'none';
}

function showSuccess(msg) {
  const el = document.getElementById('successAlert');
  el.textContent   = msg;
  el.style.display = 'block';
  document.getElementById('errorAlert').style.display = 'none';
}

function clearAlerts() {
  document.getElementById('errorAlert').style.display   = 'none';
  document.getElementById('successAlert').style.display = 'none';
}

/* ── Create account ──────────────────────────────────────────── */
document.getElementById('btnCrear').addEventListener('click', () => {
  clearAlerts();

  const nit    = document.getElementById('nit').value.trim();
  const nombre = document.getElementById('nombre').value.trim();
  const correo = document.getElementById('correo').value.trim();
  const tel    = document.getElementById('telefono').value.trim();
  const pw1    = document.getElementById('password').value;
  const pw2    = document.getElementById('password2').value;

  if (!nit || !nombre || !correo || !tel || !pw1 || !pw2) {
    showError('Por favor completa todos los campos.');
    return;
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(correo)) {
    showError('Ingresa un correo electrónico válido.');
    return;
  }

  if (pw1.length < 6) {
    showError('La contraseña debe tener al menos 6 caracteres.');
    return;
  }

  if (pw1 !== pw2) {
    showError('Las contraseñas no coinciden.');
    return;
  }

  const btn = document.getElementById('btnCrear');
  btn.style.background = '#16a34a';
  btn.innerHTML = '✓ &nbsp;Cuenta creada exitosamente';
  showSuccess('¡Cuenta creada! Serás redirigido al inicio de sesión.');
});

/* ── Google button ───────────────────────────────────────────── */
document.getElementById('btnGoogle').addEventListener('click', () => {
  alert('Registro con Google — integra tu OAuth aquí.');
});

/* ── Enter key ───────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnCrear').click();
});
