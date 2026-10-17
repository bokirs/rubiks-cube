<script setup>
defineProps({
  tokens: { type: Array, default: () => [] },
  index: { type: Number, default: 0 },
  playing: { type: Boolean, default: false },
})

defineEmits(['close', 'prev', 'next', 'toggle-play', 'jump'])
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <span class="panel-title">还原路径 · {{ tokens.length }} 步</span>
      <span class="panel-progress">{{ index }} / {{ tokens.length }}</span>
      <button class="panel-close" aria-label="关闭" @click="$emit('close')">×</button>
    </div>
    <div class="chips">
      <button
        v-for="(t, i) in tokens"
        :key="i"
        class="chip"
        :class="{ done: i < index, current: i === index }"
        :disabled="playing"
        @click="$emit('jump', i)"
      >
        {{ t }}
      </button>
    </div>
    <div class="panel-ctrl">
      <button :disabled="index === 0 || playing" @click="$emit('prev')">上一步</button>
      <button class="primary" :disabled="index >= tokens.length" @click="$emit('toggle-play')">
        {{ playing ? '暂停' : index === 0 ? '播放' : '继续' }}
      </button>
      <button :disabled="index >= tokens.length || playing" @click="$emit('next')">下一步</button>
    </div>
    <p class="legend">U上 · D下 · F前 · B后 · L左 · R右（顺时针90°），' 逆时针，2 转180°</p>
  </div>
</template>

<style scoped>
.panel {
  position: absolute;
  left: 50%;
  bottom: 128px;
  transform: translateX(-50%);
  z-index: 4;
  width: min(92vw, 540px);
  max-height: 42vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 12px;
  border-radius: 16px;
  background: rgba(16, 20, 31, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-title {
  font-size: 13px;
  letter-spacing: 1px;
  font-weight: 600;
}

.panel-progress {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
}

.panel-close {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #eef2fa;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.panel-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  overflow-y: auto;
  padding: 2px;
}

.chip {
  min-width: 44px;
  padding: 7px 6px;
  border-radius: 8px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: #eef2fa;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  cursor: pointer;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.chip.done {
  opacity: 0.35;
}

.chip.current {
  background: rgba(76, 194, 255, 0.22);
  border-color: rgba(76, 194, 255, 0.75);
  box-shadow: 0 0 10px rgba(76, 194, 255, 0.35);
}

.chip:disabled {
  cursor: default;
}

.panel-ctrl {
  display: flex;
  gap: 10px;
}

.panel-ctrl button {
  flex: 1;
  padding: 9px 0;
  font-size: 13px;
  letter-spacing: 2px;
  color: #eef2fa;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  cursor: pointer;
  touch-action: manipulation;
}

.panel-ctrl button.primary {
  background: rgba(76, 194, 255, 0.22);
  border-color: rgba(76, 194, 255, 0.6);
}

.panel-ctrl button:disabled {
  opacity: 0.4;
  cursor: default;
}

.legend {
  font-size: 10.5px;
  opacity: 0.5;
  text-align: center;
  letter-spacing: 0.5px;
}
</style>
