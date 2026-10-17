// Kociemba 两阶段求解服务：优先 Web Worker，失败时回退主线程动态加载
let worker = null
let workerBroken = false
let seq = 0
const pending = new Map()

function getWorker() {
  if (workerBroken) return null
  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/solver.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        const cb = pending.get(e.data.id)
        if (cb) {
          pending.delete(e.data.id)
          cb(e.data)
        }
      }
      worker.onerror = () => {
        for (const cb of pending.values()) cb({ ok: false, error: 'worker error' })
        pending.clear()
        try {
          worker.terminate()
        } catch {}
        worker = null
        workerBroken = true
      }
    } catch {
      workerBroken = true
      return null
    }
  }
  return worker
}

// timeoutMs 超时后终止并重建 Worker，防止深度搜索卡死阻塞后续请求
function workerCall(type, payload = {}, timeoutMs) {
  const w = getWorker()
  if (!w) return Promise.reject(new Error('no-worker'))
  return new Promise((resolve) => {
    const id = ++seq
    let timer = null
    if (timeoutMs) {
      timer = setTimeout(() => {
        pending.delete(id)
        try {
          w.terminate()
        } catch {}
        if (worker === w) worker = null
        resolve({ ok: false, error: 'solver timeout' })
      }, timeoutMs)
    }
    pending.set(id, (data) => {
      if (timer) clearTimeout(timer)
      resolve(data)
    })
    w.postMessage({ id, type, ...payload })
  })
}

async function mainThreadCube() {
  return (await import('cubejs')).default
}

export async function solveFacelet(facelet, maxDepth) {
  const w = getWorker()
  if (w) {
    const res = await workerCall('solve', { facelet, maxDepth }, 30000)
    if (res.ok) return res.solution
    throw new Error(res.error)
  }
  const Cube = await mainThreadCube()
  Cube.initSolver()
  const solution = Cube.fromString(facelet).solve(maxDepth ?? 22)
  if (solution == null) throw new Error('no solution found')
  return solution
}

const DESCENT_TIMEOUT = 3500

// 先求默认解（<=22 步），再限时尝试压短深度，得到两阶段算法可找到的最短路径
export async function solveShortest(facelet) {
  const s = String(facelet || '')
  const counts = {}
  for (const ch of s) counts[ch] = (counts[ch] || 0) + 1
  if (s.length !== 54 || Object.values(counts).some((v) => v !== 9)) {
    throw new Error('invalid facelet')
  }
  let solution = await solveFacelet(s, 22)
  let tokens = String(solution || '').split(/\s+/).filter(Boolean)
  for (let i = 0; i < 2 && tokens.length > 18; i++) {
    try {
      const res = await workerCall('solve', { facelet, maxDepth: tokens.length - 1 }, DESCENT_TIMEOUT)
      if (!res.ok) break
      const t = String(res.solution || '').split(/\s+/).filter(Boolean)
      if (t.length && t.length < tokens.length) {
        tokens = t
      } else {
        break
      }
    } catch {
      break
    }
  }
  return tokens
}

export async function warmupSolver() {
  const w = getWorker()
  if (!w) return
  try {
    await workerCall('init')
  } catch {}
}

if (import.meta.env?.DEV) {
  window.__solver = { solveShortest, solveFacelet, warmupSolver, loadCube: () => import('cubejs') }
}
