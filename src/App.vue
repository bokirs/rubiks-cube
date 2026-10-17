<script setup>
import { ref } from 'vue'
import CubeCanvas from './components/CubeCanvas.vue'

const cube = ref(null)
const moves = ref(0)
const solved = ref(false)
let solvedTimer = null

function onMoves(n) {
  moves.value = n
}

function onSolved() {
  solved.value = true
  clearTimeout(solvedTimer)
  solvedTimer = setTimeout(() => {
    solved.value = false
  }, 2600)
}

function onScramble(e) {
  e.currentTarget.blur()
  cube.value?.scramble()
}

function onReset(e) {
  e.currentTarget.blur()
  cube.value?.reset()
}
</script>

<template>
  <div class="app">
    <CubeCanvas ref="cube" class="stage" @moves="onMoves" @solved="onSolved" />

    <header class="hud top">
      <div class="title">
        <h1>三阶魔方</h1>
        <p>Vue 3 · Three.js</p>
      </div>
      <div class="counter">步数<b>{{ moves }}</b></div>
    </header>

    <div class="toast" :class="{ show: solved }">已复原！</div>

    <footer class="hud bottom">
      <p class="hint pc">左键拖动魔方 = 转动层 · 按住 <kbd>Space</kbd> + 左键拖动 = 旋转视角 · 滚轮 = 缩放</p>
      <p class="hint mobile">单指拖动魔方 = 转动层 · 双指拖动 = 旋转视角 · 双指捏合 = 缩放</p>
      <div class="actions">
        <button @click="onScramble">打乱</button>
        <button @click="onReset">复原</button>
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
  gap: 14px;
  pointer-events: auto;
}

.actions button {
  min-width: 108px;
  padding: 13px 24px 13px 29px;
  font-size: 15px;
  letter-spacing: 5px;
  color: #eef2fa;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: background 0.18s ease, transform 0.12s ease;
  touch-action: manipulation;
}

.actions button:hover {
  background: rgba(255, 255, 255, 0.17);
}

.actions button:active {
  transform: scale(0.95);
}

.toast {
  position: absolute;
  top: 18%;
  left: 50%;
  z-index: 3;
  transform: translate(-50%, -10px);
  padding: 10px 26px;
  border-radius: 14px;
  font-size: 15px;
  letter-spacing: 4px;
  color: #8ee7ab;
  background: rgba(38, 166, 91, 0.16);
  border: 1px solid rgba(56, 199, 108, 0.5);
  opacity: 0;
  transition: opacity 0.35s ease, transform 0.35s ease;
  pointer-events: none;
}

.toast.show {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
