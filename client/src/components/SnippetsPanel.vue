<template>
  <div class="snippets-panel">
    <div class="snippets-header">
      <h2>Fragmentos</h2>
    </div>

    <!-- Formulario para compartir -->
    <div class="snippet-form">
      <div class="snippet-form-row">
        <input v-model="form.title" placeholder="Título del fragmento" maxlength="60" autocomplete="off" />
        <select v-model="form.language">
          <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
        </select>
      </div>
      <textarea
        v-model="form.code"
        placeholder="Pega aquí tu código o texto..."
        rows="6"
        spellcheck="false"
      ></textarea>
      <button class="btn-primary" @click="share" :disabled="!form.code.trim()">
        📤 Compartir
      </button>
    </div>

    <!-- Lista de snippets -->
    <div class="snippets-list">
      <div v-if="snippets.length === 0" class="no-snippets">
        Aún no hay fragmentos compartidos
      </div>
      <div v-for="s in snippets" :key="s.id" class="snippet-card">
        <div class="snippet-card-header">
          <span class="snippet-title">{{ s.title || 'Sin título' }}</span>
          <span class="snippet-lang">{{ s.language }}</span>
          <span class="snippet-author">{{ s.user.avatar }} {{ s.user.name }}</span>
          <div class="snippet-actions">
            <button class="btn-icon" title="Copiar" @click="copySnippet(s)">📋</button>
            <button
              v-if="s.user.name === currentUser.name"
              class="btn-icon btn-danger-sm"
              title="Eliminar"
              @click="deleteSnippet(s.id)"
            >🗑</button>
          </div>
        </div>
        <pre class="snippet-code"><code>{{ s.code }}</code></pre>
        <div v-if="copiedId === s.id" class="copy-toast">¡Copiado!</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted } from 'vue'
import socket from '../socket.js'

const props = defineProps({ currentUser: Object })

const snippets = ref([])
const copiedId = ref(null)

const languages = [
  'Texto', 'JavaScript', 'TypeScript', 'Python', 'Java', 'C', 'C++', 'C#',
  'HTML', 'CSS', 'SQL', 'PHP', 'Ruby', 'Go', 'Rust', 'Kotlin', 'Swift', 'Bash'
]

const form = reactive({ title: '', code: '', language: 'JavaScript' })

const share = () => {
  if (!form.code.trim()) return
  socket.emit('snippet:share', { title: form.title.trim(), code: form.code, language: form.language })
  form.title = ''
  form.code = ''
}

const copySnippet = async (s) => {
  try {
    await navigator.clipboard.writeText(s.code)
    copiedId.value = s.id
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = s.code
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

const deleteSnippet = (id) => {
  socket.emit('snippet:delete', id)
}

socket.on('snippet:new', (snippet) => { snippets.value.unshift(snippet) })
socket.on('snippet:deleted', (id) => { snippets.value = snippets.value.filter(s => s.id !== id) })
socket.on('room:state', (state) => { if (state.codeSnippets) snippets.value = state.codeSnippets })

onUnmounted(() => {
  socket.off('snippet:new')
  socket.off('snippet:deleted')
})
</script>
