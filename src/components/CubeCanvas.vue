<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RubiksCube } from '../three/RubiksCube.js'

const emit = defineEmits(['moves', 'solved', 'busy'])
const container = ref(null)
let engine = null

onMounted(() => {
  engine = new RubiksCube(container.value, {
    onMoves: (n) => emit('moves', n),
    onSolved: () => emit('solved'),
    onBusy: (b) => emit('busy', b),
  })
})

onBeforeUnmount(() => {
  engine?.dispose()
  engine = null
})

defineExpose({
  scramble: () => engine?.scramble(),
  reset: () => engine?.reset(),
  checkSolved: () => engine?.checkSolved(),
  getFaceletString: () => engine?.getFaceletString(),
  performMove: (token, opts) => engine?.performMove(token, opts),
  performSequence: (tokens, opts) => engine?.performSequence(tokens, opts),
})
</script>

<template>
  <div ref="container" class="cube-wrap"></div>
</template>

<style scoped>
.cube-wrap {
  position: absolute;
  inset: 0;
}
</style>
