import Cube from 'cubejs'

let inited = false

function ensureInit() {
  if (!inited) {
    Cube.initSolver()
    inited = true
  }
}

self.onmessage = (e) => {
  const { id, type, facelet, maxDepth } = e.data
  try {
    if (type === 'init') {
      ensureInit()
      self.postMessage({ id, ok: true })
    } else if (type === 'solve') {
      ensureInit()
      // cubejs 不会校验非法 facelet，先做基础数量检查，避免垃圾解法
      const counts = {}
      for (const ch of String(facelet)) counts[ch] = (counts[ch] || 0) + 1
      const valid = String(facelet).length === 54 && Object.values(counts).every((v) => v === 9)
      if (!valid) throw new Error('invalid facelet')
      const cube = Cube.fromString(facelet)
      const solution = cube.solve(maxDepth ?? 22)
      if (solution == null) throw new Error('no solution found')
      self.postMessage({ id, ok: true, solution })
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) })
  }
}
