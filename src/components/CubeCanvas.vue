<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RubiksCube } from '../three/RubiksCube.js'

const emit = defineEmits(['moves', 'solved'])
const container = ref(null)
let engine = null

onMounted(() => {
  engine = new RubiksCube(container.value, {
    onMoves: (n) => emit('moves', n),
    onSolved: () => emit('solved'),
  })
})

onBeforeUnmount(() => {
  engine?.dispose()
  engine = null
})

defineExpose({
  scramble: () => engine?.scramble(),
  reset: () => engine?.reset(),
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
