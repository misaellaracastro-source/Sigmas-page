    // ── Toggle password visibility ──────────────────────────────
const togglePw   = document.getElementById('togglePw');
const pwInput    = document.getElementById('contrasena');
const eyeOpen    = document.getElementById('eyeOpen');
const eyeClosed  = document.getElementById('eyeClosed');

togglePw.addEventListener('click', () => {
    const isHidden = pwInput.type === 'password';
    pwInput.type   = isHidden ? 'text' : 'password';
    eyeOpen.style.display   = isHidden ? 'none'  : 'block';
    eyeClosed.style.display = isHidden ? 'block' : 'none';
});

// ── Login button ────────────────────────────────────────────
const btnLogin   = document.getElementById('btnLogin');
const errorAlert = document.getElementById('errorAlert');

btnLogin.addEventListener('click', () => {
    const nit  = document.getElementById('nit').value.trim();
    const user = document.getElementById('usuario').value.trim();
    const pass = pwInput.value.trim();

    errorAlert.style.display = 'none';

    if (!nit || !user || !pass) {
        errorAlert.textContent = 'Por favor completa todos los campos.';
        errorAlert.style.display = 'block';
        return;
    }

      // Demo validation — replace with real auth logic
    if (user === 'admin' && pass === '1234') {
        btnLogin.textContent = '✓ Acceso concedido';
        btnLogin.style.background = '#16a34a';
    } else {
        errorAlert.textContent = 'Usuario o contraseña incorrectos. Por favor intenta de nuevo.';
        errorAlert.style.display = 'block';
    }
});

    // ── Register button ─────────────────────────────────────────
document.getElementById('btnRegister').addEventListener('click', () => {
    window.location.href = '/frontend/registro/sigmas_register.html';
});

    // ── Forgot password ─────────────────────────────────────────
document.getElementById('forgotLink').addEventListener('click', e => {
    e.preventDefault();
    alert('Se enviará un enlace de recuperación a tu correo registrado.');
});

// ── Enter key submit ────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnLogin.click();
});