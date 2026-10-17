<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['complete', 'close'])

const FACE_SEQ = [
  { key: 'F', name: '前面', center: '绿色', hint: '前面（中心绿色）对准取景框，顶面白色朝上' },
  { key: 'R', name: '右面', center: '红色', hint: '右面（中心红色）对准取景框，顶面白色朝上' },
  { key: 'U', name: '顶面', center: '白色', hint: '顶面（中心白色）对准取景框，前面绿色朝向画面下方' },
  { key: 'B', name: '背面', center: '蓝色', hint: '背面（中心蓝色）对准取景框，顶面白色朝上' },
  { key: 'L', name: '左面', center: '橙色', hint: '左面（中心橙色）对准取景框，顶面白色朝上' },
  { key: 'D', name: '底面', center: '黄色', hint: '底面（中心黄色）对准取景框，前面绿色朝向画面上方' },
]
const FACELET_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']
const LETTERS = ['U', 'R', 'F', 'D', 'L', 'B']
const LETTER_COLORS = { U: '#f6f6f4', R: '#b71234', F: '#009b48', D: '#ffd500', L: '#ff5800', B: '#0046ad' }

const videoRef = ref(null)
const gridRef = ref(null)
const stream = ref(null)
const step = ref(0)
const phase = ref('camera')
const error = ref('')
const notice = ref('')
const cells = ref([])
const scanned = ref([])

watch(
  () => props.open,
  (v) => {
    if (v) {
      error.value = ''
      notice.value = ''
      nextTick(startCamera)
    } else {
      stopCamera()
    }
  }
)

onBeforeUnmount(stopCamera)

async function startCamera() {
  if (stream.value) return
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = '当前环境不支持相机调用（页面需通过 localhost 或 HTTPS 访问）'
    return
  }
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    videoRef.value.srcObject = stream.value
    await videoRef.value.play().catch(() => {})
  } catch (e) {
    stream.value = null
    if (e?.name === 'NotAllowedError') error.value = '相机权限被拒绝，请在浏览器地址栏允许相机后重试'
    else if (e?.name === 'NotFoundError') error.value = '未检测到可用摄像头'
    else error.value = '相机启动失败：' + (e?.message || e)
  }
}

function stopCamera() {
  stream.value?.getTracks().forEach((t) => t.stop())
  stream.value = null
}

function capture() {
  const video = videoRef.value
  if (!video || !video.videoWidth) return
  notice.value = ''
  const rgbs = sampleCells(video)
  const face = FACE_SEQ[step.value]
  const entry = { cells: rgbs.map((rgb, i) => ({ rgb, letter: i === 4 ? face.key : null, manual: i === 4 })) }
  scanned.value[step.value] = entry
  cells.value = entry.cells
  classifyAll()
  phase.value = 'review'
}

// 取景框九宫格中心区域平均颜色；video 用 object-fit: cover 显示，需做坐标换算
function sampleCells(video) {
  const vRect = video.getBoundingClientRect()
  const gRect = gridRef.value.getBoundingClientRect()
  const vw = video.videoWidth
  const vh = video.videoHeight
  const scale = Math.max(vRect.width / vw, vRect.height / vh)
  const ox = (vRect.width - vw * scale) / 2
  const oy = (vRect.height - vh * scale) / 2

  const canvas = document.createElement('canvas')
  canvas.width = vw
  canvas.height = vh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, vw, vh)

  const cellSide = gRect.width / 3
  const side = Math.max(4, Math.round((cellSide * 0.22) / scale))
  const out = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const gx = gRect.left + cellSide * (c + 0.5)
      const gy = gRect.top + cellSide * (r + 0.5)
      const px = Math.round((gx - vRect.left - ox) / scale)
      const py = Math.round((gy - vRect.top - oy) / scale)
      const x0 = Math.max(0, Math.min(vw - 1, px - (side >> 1)))
      const y0 = Math.max(0, Math.min(vh - 1, py - (side >> 1)))
      const w = Math.min(side, vw - x0)
      const h = Math.min(side, vh - y0)
      const data = ctx.getImageData(x0, y0, w, h).data
      let rr = 0
      let gg = 0
      let bb = 0
      let n = 0
      for (let i = 0; i < data.length; i += 4) {
        rr += data[i]
        gg += data[i + 1]
        bb += data[i + 2]
        n++
      }
      out.push([Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)])
    }
  }
  return out
}

// 各面中心色作为参考色，按归一化色度最近邻分类
function classifyAll() {
  const refs = new Map()
  scanned.value.forEach((s, i) => {
    if (s) refs.set(FACE_SEQ[i].key, s.cells[4].rgb)
  })
  if (refs.size < 2) return
  for (const s of scanned.value) {
    if (!s) continue
    for (const c of s.cells) {
      if (!c.manual) c.letter = classifyColor(c.rgb, refs)
    }
  }
}

function classifyColor(rgb, refs) {
  let best = null
  let bestD = Infinity
  for (const [letter, ref] of refs) {
    const d = chromaDist(rgb, ref)
    if (d < bestD) {
      bestD = d
      best = letter
    }
  }
  return best
}

function chromaDist(a, b) {
  const sa = a[0] + a[1] + a[2] || 1
  const sb = b[0] + b[1] + b[2] || 1
  let d = 0
  for (let i = 0; i < 3; i++) d += (a[i] / sa - b[i] / sb) ** 2
  return d
}

function cycleCell(i) {
  const c = cells.value[i]
  if (!c || c.manual) return
  const cur = LETTERS.indexOf(c.letter)
  c.letter = LETTERS[(cur + 1) % LETTERS.length]
  c.manual = true
}

function retake() {
  phase.value = 'camera'
}

function confirmFace() {
  notice.value = ''
  if (step.value < FACE_SEQ.length - 1) {
    step.value += 1
    phase.value = 'camera'
    cells.value = []
  } else {
    finalize()
  }
}

function gotoFace(i) {
  if (i === step.value && phase.value === 'camera') return
  if (!scanned.value[i] && i !== step.value) return
  step.value = i
  phase.value = 'camera'
  cells.value = []
}

function finalize() {
  classifyAll()
  let str = ''
  for (const face of FACELET_ORDER) {
    const idx = FACE_SEQ.findIndex((f) => f.key === face)
    const entry = scanned.value[idx]
    if (!entry) {
      notice.value = '还有面未扫描，请点击上方圆点补扫'
      return
    }
    str += entry.cells.map((c) => c.letter || '?').join('')
  }
  if (str.includes('?')) {
    notice.value = '仍有未识别的方块颜色，请返回对应面点击修正'
    return
  }
  for (const L of LETTERS) {
    if (str.split(L).length - 1 !== 9) {
      notice.value = '六种颜色数量不等于 9，请检查识别结果'
      return
    }
  }
  emit('complete', str)
}

function resetState() {
  step.value = 0
  phase.value = 'camera'
  cells.value = []
  scanned.value = []
  notice.value = ''
}

function notify(msg) {
  notice.value = msg
}

function rgbCss(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

function textColor(letter) {
  return letter === 'U' || letter === 'D' || letter === 'L' ? '#111' : '#fff'
}

defineExpose({ resetState, notify })
</script>

<template>
  <div class="scanner">
    <header class="scan-head">
      <button class="scan-close" aria-label="关闭" @click="emit('close')">×</button>
      <div class="scan-title">
        <template v-if="phase === 'camera'">扫描 {{ FACE_SEQ[step].name }}（中心{{ FACE_SEQ[step].center }}）</template>
        <template v-else>确认 {{ FACE_SEQ[step].name }} 颜色</template>
      </div>
      <div class="scan-dots">
        <button
          v-for="(f, i) in FACE_SEQ"
          :key="f.key"
          class="dot"
          :class="{ done: !!scanned[i], active: i === step }"
          :aria-label="f.name"
          @click="gotoFace(i)"
        ></button>
      </div>
    </header>

    <p v-if="notice" class="scan-notice">{{ notice }}</p>

    <div v-if="error" class="scan-error">
      <p>{{ error }}</p>
      <button @click="emit('close')">关闭</button>
    </div>

    <div v-else class="scan-body">
      <div v-show="phase === 'camera'" class="video-wrap">
        <video ref="videoRef" playsinline muted autoplay></video>
        <div ref="gridRef" class="grid">
          <div v-for="i in 9" :key="i" class="gcell"></div>
        </div>
      </div>

      <div v-if="phase === 'review'" class="review">
        <div class="review-grid">
          <button
            v-for="(c, i) in cells"
            :key="i"
            class="rcell"
            :style="{ background: rgbCss(c.rgb) }"
            @click="cycleCell(i)"
          >
            <span class="rletter" :style="{ color: textColor(c.letter) }">{{ c.letter || '?' }}</span>
          </button>
        </div>
        <p class="review-tip">识别不准？点击方块可切换颜色（中心块固定）</p>
      </div>
    </div>

    <footer class="scan-foot">
      <p class="scan-hint">{{ phase === 'camera' ? FACE_SEQ[step].hint : '确认九个颜色与实际一致后继续' }}</p>
      <div class="scan-actions">
        <template v-if="phase === 'camera'">
          <button class="shutter" :disabled="!stream" @click="capture">拍摄</button>
        </template>
        <template v-else>
          <button class="ghost" @click="retake">重拍</button>
          <button class="primary" @click="confirmFace">{{ step === FACE_SEQ.length - 1 ? '完成扫描' : '下一面' }}</button>
        </template>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.scanner {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  background: rgba(7, 9, 15, 0.96);
  padding: max(14px, env(safe-area-inset-top)) 18px max(16px, env(safe-area-inset-bottom));
}

.scan-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scan-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #eef2fa;
  font-size: 17px;
  cursor: pointer;
}

.scan-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}

.scan-dots {
  margin-left: auto;
  display: flex;
  gap: 7px;
}

.dot {
  width: 11px;
  height: 11px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: transparent;
  cursor: pointer;
}

.dot.done {
  background: rgba(76, 194, 255, 0.9);
  border-color: transparent;
}

.dot.active {
  border-color: #4cc2ff;
  box-shadow: 0 0 0 2px rgba(76, 194, 255, 0.35);
}

.scan-notice {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  color: #ffb08a;
  background: rgba(255, 120, 60, 0.12);
  border: 1px solid rgba(255, 120, 60, 0.4);
}

.scan-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  font-size: 14px;
  opacity: 0.85;
}

.scan-error button {
  padding: 10px 30px;
  border-radius: 999px;
  color: #eef2fa;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
}

.scan-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  margin-top: 12px;
  min-height: 0;
}

.video-wrap {
  position: absolute;
  inset: 0;
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.grid {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(64vw, 64vh, 400px);
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 6px;
}

.gcell {
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.08);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.25);
}

.review {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.review-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 8px;
  width: min(70vw, 320px);
  aspect-ratio: 1;
}

.rcell {
  border: 2px solid rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.rletter {
  font-size: 18px;
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.review-tip {
  font-size: 12px;
  opacity: 0.6;
}

.scan-foot {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.scan-hint {
  font-size: 13px;
  opacity: 0.75;
  text-align: center;
}

.scan-actions {
  display: flex;
  gap: 14px;
}

.shutter {
  width: 74px;
  height: 74px;
  border-radius: 50%;
  font-size: 15px;
  letter-spacing: 2px;
  color: #0b0e14;
  background: #eef2fa;
  border: 4px solid rgba(255, 255, 255, 0.35);
  cursor: pointer;
}

.shutter:disabled {
  opacity: 0.4;
}

.scan-actions .ghost,
.scan-actions .primary {
  min-width: 120px;
  padding: 13px 24px;
  border-radius: 999px;
  font-size: 14px;
  letter-spacing: 2px;
  cursor: pointer;
  touch-action: manipulation;
}

.ghost {
  color: #eef2fa;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.primary {
  color: #06222f;
  background: #4cc2ff;
  border: 1px solid rgba(76, 194, 255, 0.8);
}
</style>
