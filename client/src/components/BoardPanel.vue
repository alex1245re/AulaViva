<template>
  <div class="board-panel">
    <div class="board-toolbar">
      <label class="tool-group">
        <span>Color</span>
        <input type="color" v-model="color" />
      </label>
      <label class="tool-group">
        <span>Grosor</span>
        <input type="range" min="1" max="30" v-model="lineWidth" />
        <span>{{ lineWidth }}px</span>
      </label>
      <label class="tool-group">
        <span>Herramienta</span>
        <select v-model="tool">
          <option value="pen">✏️ Pintar</option>
          <option value="eraser">🧹 Borrar</option>
        </select>
      </label>
      <button class="btn-icon" title="Deshacer" @click="undo">↩ Deshacer</button>
      <button class="btn-icon btn-danger" title="Borrar todo" @click="clearBoard">🗑 Limpiar</button>
    </div>
    <canvas
      ref="canvasEl"
      @mousedown="startDraw"
      @mousemove="draw"
      @mouseup="stopDraw"
      @mouseleave="stopDraw"
      @touchstart.prevent="startDrawTouch"
      @touchmove.prevent="drawTouch"
      @touchend.prevent="stopDraw"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import socket from '../socket.js'

const props = defineProps({ isActive: Boolean })

const canvasEl = ref(null)
let ctx = null
let drawing = false
let currentStrokeId = null

const color = ref('#1a73e8')
const lineWidth = ref(4)
const tool = ref('pen')

// Historial local de trazos (cada trazo es un array de puntos)
const strokes = ref([])

const initCanvas = () => {
  const canvas = canvasEl.value
  if (!canvas) return
  const parent = canvas.parentElement
  // Si el panel está oculto (v-show → display:none) las dimensiones son 0, no inicializar
  if (parent.clientWidth === 0 || parent.clientHeight === 0) return
  canvas.width = parent.clientWidth
  canvas.height = parent.clientHeight - 52 // restar toolbar
  ctx = canvas.getContext('2d')
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  redraw()
}

// Reinicializar cuando el panel se hace visible (cambio de pestaña)
watch(() => props.isActive, async (active) => {
  if (active) {
    await nextTick()
    initCanvas()
  }
})

const redraw = () => {
  if (!ctx) return
  ctx.clearRect(0, 0, canvasEl.value.width, canvasEl.value.height)
  for (const stroke of strokes.value) {
    drawStroke(stroke)
  }
}

const drawStroke = (stroke) => {
  if (!stroke.points || stroke.points.length < 2) return
  ctx.beginPath()
  ctx.strokeStyle = stroke.eraser ? '#ffffff' : stroke.color
  ctx.lineWidth = stroke.lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  ctx.stroke()
}

const getPos = (e) => {
  const rect = canvasEl.value.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (canvasEl.value.width / rect.width),
    y: (e.clientY - rect.top) * (canvasEl.value.height / rect.height)
  }
}

const getTouchPos = (e) => {
  const touch = e.touches[0]
  return getPos(touch)
}

let currentStroke = null

const startDraw = (e) => {
  drawing = true
  currentStrokeId = Date.now().toString() + Math.random()
  const pos = getPos(e)
  currentStroke = {
    strokeId: currentStrokeId,
    color: color.value,
    lineWidth: parseInt(lineWidth.value),
    eraser: tool.value === 'eraser',
    points: [pos]
  }
}

const draw = (e) => {
  if (!drawing || !currentStroke) return
  const pos = getPos(e)
  currentStroke.points.push(pos)

  // Dibujar solo el último segmento para suavidad
  ctx.beginPath()
  ctx.strokeStyle = currentStroke.eraser ? '#ffffff' : currentStroke.color
  ctx.lineWidth = currentStroke.lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const pts = currentStroke.points
  if (pts.length >= 2) {
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y)
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    ctx.stroke()
  }

  // Emitir trazo parcial al servidor (segmento)
  socket.emit('board:draw', {
    strokeId: currentStrokeId,
    color: currentStroke.color,
    lineWidth: currentStroke.lineWidth,
    eraser: currentStroke.eraser,
    points: [pts[pts.length - 2], pts[pts.length - 1]]
  })
}

const stopDraw = () => {
  if (!drawing) return
  drawing = false
  if (currentStroke && currentStroke.points.length > 0) {
    strokes.value.push({ ...currentStroke })
  }
  currentStroke = null
}

const startDrawTouch = (e) => {
  const touch = e.touches[0]
  startDraw({ clientX: touch.clientX, clientY: touch.clientY })
}
const drawTouch = (e) => {
  if (!drawing || !currentStroke) return
  const touch = e.touches[0]
  draw({ clientX: touch.clientX, clientY: touch.clientY })
}

const undo = () => {
  socket.emit('board:undo')
}

const clearBoard = () => {
  socket.emit('board:clear')
}

// Recibir trazos de otros usuarios
socket.on('board:draw', (stroke) => {
  if (!ctx) return
  // Acumular puntos en el historial agrupando por strokeId
  let existing = strokes.value.find(s => s.strokeId === stroke.strokeId)
  if (!existing) {
    existing = { ...stroke, points: [] }
    strokes.value.push(existing)
  }
  existing.points.push(...stroke.points)

  // Dibujar segmento inmediatamente
  ctx.beginPath()
  ctx.strokeStyle = stroke.eraser ? '#ffffff' : stroke.color
  ctx.lineWidth = stroke.lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (stroke.points.length >= 2) {
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    ctx.lineTo(stroke.points[1].x, stroke.points[1].y)
    ctx.stroke()
  }
})

socket.on('board:clear', () => {
  strokes.value = []
  redraw()
})

socket.on('board:sync', (serverStrokes) => {
  strokes.value = serverStrokes
  redraw()
})

// Sincronizar al recibir estado inicial de la sala
socket.on('room:state', (state) => {
  if (state.boardStrokes) {
    strokes.value = state.boardStrokes
    redraw()
  }
})

onMounted(() => {
  // Solo inicializar si el panel ya está visible (pestaña activa desde el inicio)
  nextTick(() => initCanvas())
  window.addEventListener('resize', initCanvas)
})

onUnmounted(() => {
  window.removeEventListener('resize', initCanvas)
  socket.off('board:draw')
  socket.off('board:clear')
  socket.off('board:sync')
})
</script>
