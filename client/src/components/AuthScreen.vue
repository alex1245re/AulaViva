<template>
  <div class="auth-bg">
    <div class="auth-card">
      <div class="auth-logo">📚</div>
      <h1>StudyRoom</h1>
      <p class="auth-subtitle">Estudia en equipo, a distancia</p>

      <!-- Tabs login / registro -->
      <div class="auth-tabs">
        <button :class="{ active: mode === 'login' }" @click="switchMode('login')">Iniciar sesión</button>
        <button :class="{ active: mode === 'register' }" @click="switchMode('register')">Registrarse</button>
      </div>

      <form @submit.prevent="submit">

        <!-- Solo en registro -->
        <div class="field" v-if="mode === 'register'">
          <label>Apodo</label>
          <input
            v-model="displayName"
            type="text"
            placeholder="Ej: María García"
            maxlength="30"
            autocomplete="name"
            required
          />
        </div>

        <div class="field">
          <label>Correo electrónico</label>
          <input
            v-model="email"
            type="email"
            placeholder="correo@ejemplo.com"
            autocomplete="email"
            required
          />
        </div>

        <div class="field">
          <label>Contraseña</label>
          <div class="password-wrap">
            <input
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              placeholder="Mínimo 6 caracteres"
              autocomplete="current-password"
              minlength="6"
              required
            />
            <button type="button" class="toggle-pass" @click="showPass = !showPass" tabindex="-1">
              {{ showPass ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="auth-error">❌ {{ errorMsg }}</div>

        <button type="submit" class="btn-auth" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          {{ mode === 'login' ? 'Entrar' : 'Crear cuenta' }}
        </button>
      </form>

      <!-- Separador -->        
      <div class="auth-divider"><span>o</span></div>

      <!-- Google -->        
      <button class="btn-google" @click="loginGoogle" :disabled="loading" type="button">
        <svg class="google-icon" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.48 2.69 13.44l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continuar con Google
      </button>

      <div v-if="mode === 'login'" class="auth-footer">
        <button class="btn-link" @click="resetPassword" :disabled="!email.trim()">
          ¿Olvidaste tu contraseña?
        </button>
      </div>
      <div v-if="resetSent" class="auth-success">✅ Correo de recuperación enviado</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth'
import { auth } from '../firebase.js'

const mode       = ref('login')
const email      = ref('')
const password   = ref('')
const displayName = ref('')
const showPass   = ref(false)
const loading    = ref(false)
const errorMsg   = ref('')
const resetSent  = ref(false)

const ERROR_MAP = {
  'auth/invalid-email':            'El correo no es válido.',
  'auth/user-not-found':           'No existe ninguna cuenta con ese correo.',
  'auth/wrong-password':           'Contraseña incorrecta.',
  'auth/invalid-credential':       'Correo o contraseña incorrectos.',
  'auth/email-already-in-use':     'Ya existe una cuenta con ese correo.',
  'auth/weak-password':            'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests':        'Demasiados intentos. Espera un momento.',
  'auth/network-request-failed':   'Error de red. Comprueba tu conexión.',
}

const friendlyError = (code) => ERROR_MAP[code] || 'Ocurrió un error. Inténtalo de nuevo.'

const switchMode = (m) => {
  mode.value = m
  errorMsg.value = ''
  resetSent.value = false
}

const submit = async () => {
  errorMsg.value = ''
  resetSent.value = false
  loading.value = true
  try {
    if (mode.value === 'register') {
      const { user } = await createUserWithEmailAndPassword(auth, email.value.trim(), password.value)
      await updateProfile(user, { displayName: displayName.value.trim() })
    } else {
      await signInWithEmailAndPassword(auth, email.value.trim(), password.value)
    }
    // onAuthStateChanged en App.vue se encarga del resto
  } catch (err) {
    errorMsg.value = friendlyError(err.code)
  } finally {
    loading.value = false
  }
}

const resetPassword = async () => {
  if (!email.value.trim()) return
  try {
    await sendPasswordResetEmail(auth, email.value.trim())
    resetSent.value = true
    errorMsg.value = ''
  } catch (err) {
    errorMsg.value = friendlyError(err.code)
  }
}

const loginGoogle = async () => {
  errorMsg.value = ''
  loading.value = true
  try {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
    // onAuthStateChanged en App.vue maneja la sesión
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      errorMsg.value = friendlyError(err.code)
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-bg {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 20% 0%, #1e1b4b 0%, #0f172a 60%, #0d1117 100%);
  padding: 1rem;
}

.auth-card {
  background: #131c2e;
  border: 1px solid #334155;
  border-radius: 18px;
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.auth-logo {
  font-size: 2.8rem;
  margin-bottom: 0.25rem;
}

.auth-card h1 {
  margin: 0 0 0.2rem;
  font-size: 1.9rem;
  font-weight: 700;
  color: #e2e8f0;
}

.auth-subtitle {
  margin: 0 0 1.5rem;
  color: #64748b;
  font-size: 0.9rem;
}

/* ── Tabs ── */
.auth-tabs {
  display: flex;
  width: 100%;
  background: #1e293b;
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 1.5rem;
}

.auth-tabs button {
  flex: 1;
  border: none;
  background: transparent;
  color: #64748b;
  border-radius: 8px;
  padding: 0.55rem;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.auth-tabs button.active {
  background: #6366f1;
  color: #fff;
}

/* ── Form ── */
form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field label {
  font-size: 0.82rem;
  color: #94a3b8;
  font-weight: 500;
}

.field input {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 9px;
  padding: 0.7rem 0.9rem;
  color: #e2e8f0;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
}

.field input:focus {
  border-color: #6366f1;
}

.password-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.password-wrap input {
  padding-right: 2.8rem;
}

.toggle-pass {
  position: absolute;
  right: 0.6rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.2rem;
  line-height: 1;
  color: #64748b;
}

/* ── Error / success ── */
.auth-error {
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.3);
  color: #f87171;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.85rem;
}

.auth-success {
  margin-top: 0.75rem;
  color: #34d399;
  font-size: 0.85rem;
  text-align: center;
}

/* ── Botón principal ── */
.btn-auth {
  width: 100%;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.8rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.btn-auth:hover:not(:disabled) {
  background: #4f46e5;
  transform: translateY(-1px);
}

.btn-auth:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Spinner ── */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Footer ── */
.auth-footer {
  margin-top: 1rem;
  text-align: center;
}

.btn-link {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

/* ── Separador ── */
.auth-divider {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.5rem 0;
  color: #475569;
  font-size: 0.8rem;
}
.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #334155;
}

/* ── Botón Google ── */
.btn-google {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  background: #fff;
  color: #1e293b;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.72rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
}
.btn-google:hover:not(:disabled) {
  background: #f1f5f9;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.btn-google:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.google-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.btn-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
