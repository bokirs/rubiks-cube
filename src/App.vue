<script setup>
import { computed, onMounted, ref } from 'vue'
import CubeCanvas from './components/CubeCanvas.vue'
import SolutionPanel from './components/SolutionPanel.vue'
import CubeScanner from './components/CubeScanner.vue'
import { invertMove, invertMoves } from './three/RubiksCube.js'
import { solveShortest, warmupSolver } from './three/solverService.js'

const cube = ref(null)
const scannerRef = ref(null)
const moves = ref(0)
const toastMsg = ref('')
const solution = ref([])
const playIndex = ref(0)
const playing = ref(false)
const solving = ref(false)
const syncing = ref(false)
const panelOpen = ref(false)
const scannerOpen = ref(false)
const engineBusy = ref(false)

let toastTimer = null
let playToken = 0

const busy = computed(() => solving.value || syncing.value || playing.value || engineBusy.value)

function showToast(text, ms = 2600) {
  toastMsg.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, ms)
}

function onMoves(n) {
  moves.value = n
  if (panelOpen.value && n > 0) {
    closePanel()
    showToast('魔方被手动转动，当前路径已失效，请重新求解')
  }
}

function onSolved() {
  showToast('已复原！', 3000)
}

function closePanel() {
  playing.value = false
  playToken++
  panelOpen.value = false
}

// ---------- 求解与步骤播放 ----------

async function onSolve() {
  if (busy.value || !cube.value) return
  if (cube.value.checkSolved()) {
    showToast('魔方已是复原状态')
    return
  }
  solving.value = true
  showToast('正在计算还原路径…', 8000)
  try {
    const facelet = cube.value.getFaceletString()
    const tokens = await solveShortest(facelet)
    toastMsg.value = ''
    if (!tokens.length) {
      showToast('魔方已是复原状态')
      return
    }
    solution.value = tokens
    playIndex.value = 0
    playing.value = false
    panelOpen.value = true
  } catch (e) {
    toastMsg.value = ''
    showToast('求解失败：' + (e?.message || e))
  } finally {
    solving.value = false
  }
}

async function stepNext() {
  if (playIndex.value >= solution.value.length) return
  await cube.value?.performMove(solution.value[playIndex.value], { duration: 240 })
  playIndex.value += 1
}

async function stepPrev() {
  if (playIndex.value <= 0) return
  await cube.value?.performMove(invertMove(solution.value[playIndex.value - 1]), { duration: 240 })
  playIndex.value -= 1
}

async function jumpTo(k) {
  const dur = { duration: 80 }
  while (playIndex.value > k) {
    await cube.value?.performMove(invertMove(solution.value[playIndex.value - 1]), dur)
    playIndex.value -= 1
  }
  while (playIndex.value < k) {
    await cube.value?.performMove(solution.value[playIndex.value], dur)
    playIndex.value += 1
  }
}

async function togglePlay() {
  if (playing.value) {
    playing.value = false
    return
  }
  playing.value = true
  const token = ++playToken
  while (playing.value && token === playToken && playIndex.value < solution.value.length) {
    await stepNext()
    if (playing.value && token === playToken && playIndex.value < solution.value.length) {
      await delay(280)
    }
  }
  if (token === playToken) playing.value = false
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------- 打乱 / 复原 ----------

function onScramble(e) {
  e.currentTarget.blur()
  if (busy.value) return
  closePanel()
  cube.value?.scramble()
}

function onReset(e) {
  e.currentTarget.blur()
  if (busy.value) return
  closePanel()
  cube.value?.reset()
}

// ---------- 相机扫描 ----------

function openScanner() {
  if (busy.value) return
  closePanel()
  scannerOpen.value = true
}

async function onScanComplete(facelet) {
  scannerOpen.value = false
  syncing.value = true
  showToast('正在识别并计算还原路径…', 10000)
  let stateApplied = false
  try {
    const tokens = await solveShortest(facelet)
    toastMsg.value = ''
    if (!tokens.length) {
      showToast('扫描的魔方已是复原状态')
      scannerRef.value?.resetState()
      return
    }
    cube.value?.reset()
    stateApplied = true
    await cube.value?.performSequence(invertMoves(tokens), { duration: 70 })
    // 3D 引擎只能产生物理合法状态：载入后与扫描串不一致说明颜色组合在魔方上不可能
    if (cube.value?.getFaceletString() !== facelet) {
      cube.value?.reset()
      stateApplied = false
      showToast('扫描结果不合法（颜色组合矛盾），请修正后重试', 3200)
      scannerOpen.value = true
      scannerRef.value?.notify('颜色组合在魔方上不可能出现，请点击圆点回到对应面修正后重新确认')
      return
    }
    solution.value = tokens
    playIndex.value = 0
    playing.value = false
    panelOpen.value = true
    scannerRef.value?.resetState()
    showToast('已载入现实魔方状态，按路径转动即可复原', 3400)
  } catch (e) {
    if (stateApplied) cube.value?.reset()
    toastMsg.value = ''
    showToast('扫描结果不合法（颜色组合矛盾），请修正后重试', 3200)
    scannerOpen.value = true
    scannerRef.value?.notify('颜色组合在魔方上不可能出现，请点击圆点回到对应面修正后重新确认')
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  setTimeout(warmupSolver, 2500)
})
</script>

<template>
  <div class="app">
    <CubeCanvas ref="cube" class="stage" @moves="onMoves" @solved="onSolved" @busy="engineBusy = $event" />

    <header class="hud top">
      <div class="title">
        <h1>三阶魔方</h1>
        <p>Vue 3 · Three.js</p>
      </div>
      <div class="counter">步数<b>{{ moves }}</b></div>
    </header>

    <div class="toast" :class="{ show: toastMsg }">{{ toastMsg }}</div>

    <SolutionPanel
      v-if="panelOpen"
      :tokens="solution"
      :index="playIndex"
      :playing="playing"
      @close="closePanel"
      @prev="stepPrev"
      @next="stepNext"
      @toggle-play="togglePlay"
      @jump="jumpTo"
    />

    <CubeScanner
      ref="scannerRef"
      v-show="scannerOpen"
      :open="scannerOpen"
      @complete="onScanComplete"
      @close="scannerOpen = false"
    />

    <footer class="hud bottom">
      <p class="hint pc">左键拖动魔方 = 转动层 · 按住 <kbd>Space</kbd> + 左键拖动 = 旋转视角 · 滚轮 = 缩放</p>
      <p class="hint mobile">单指拖动魔方 = 转动层 · 双指拖动 = 旋转视角 · 双指捏合 = 缩放</p>
      <div class="actions">
        <button :disabled="busy" @click="onScramble">打乱</button>
        <button :disabled="busy" @click="onReset">复原</button>
        <button :disabled="busy" @click="onSolve">{{ solving ? '计算中' : '求解' }}</button>
        <button :disabled="busy" @click="openScanner">扫描</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.stage {
  position: absolute;
  inset: 0;
}

.hud {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  pointer-events: none;
  padding: 18px 22px;
}

.hud.top {
  top: 0;
  justify-content: space-between;
  align-items: flex-start;
  padding-top: max(18px, env(safe-area-inset-top));
}

.hud.bottom {
  bottom: 0;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding-bottom: max(18px, env(safe-area-inset-bottom));
}

.title h1 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 6px;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
}

.title p {
  margin-top: 5px;
  font-size: 11px;
  letter-spacing: 2px;
  opacity: 0.55;
}

.counter {
  font-size: 12px;
  letter-spacing: 1px;
  opacity: 0.9;
  padding: 7px 15px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(8px);
}

.counter b {
  margin-left: 6px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.hint {
  font-size: 12px;
  line-height: 1.6;
  letter-spacing: 0.5px;
  opacity: 0.6;
  text-align: center;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
}

.hint kbd {
  font-family: inherit;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.hint.pc {
  display: none;
}

.hint.mobile {
  display: block;
}

@media (hover: hover) and (pointer: fine) {
  .hint.pc {
    display: block;
  }

  .hint.mobile {
    display: none;
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  pointer-events: auto;
}

.actions button {
  min-width: 78px;
  padding: 12px 18px 12px 21px;
  font-size: 14px;
  letter-spacing: 3px;
  color: #eef2fa;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: background 0.18s ease, transform 0.12s ease, opacity 0.18s ease;
  touch-action: manipulation;
}

.actions button:hover {
  background: rgba(255, 255, 255, 0.17);
}

.actions button:active {
  transform: scale(0.95);
}

.actions button:disabled {
  opacity: 0.45;
  cursor: default;
}

.toast {
  position: absolute;
  top: 18%;
  left: 50%;
  z-index: 5;
  transform: translate(-50%, -10px);
  padding: 10px 26px;
  border-radius: 14px;
  font-size: 15px;
  letter-spacing: 2px;
  color: #9fe0b4;
  background: rgba(38, 166, 91, 0.16);
  border: 1px solid rgba(56, 199, 108, 0.5);
  opacity: 0;
  transition: opacity 0.35s ease, transform 0.35s ease;
  pointer-events: none;
  max-width: 86vw;
  text-align: center;
}

.toast.show {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
