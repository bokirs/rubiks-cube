import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const SP = 1.06                 // 相邻小块中心间距
const HALF_PI = Math.PI / 2
const MIN_RADIUS = 4.2
const MAX_RADIUS = 18
const DRAG_THRESHOLD = 8        // px，判定拖动方向前允许的位移
const FLICK_SPEED = 1.4         // rad/s，松手甩动阈值
const ANGLE_GAIN = 1.35         // 手指行程 -> 旋转角的增益

const FACE_DEFS = [
  { dir: [1, 0, 0], color: 0xb71234 },   // 右 红
  { dir: [-1, 0, 0], color: 0xff5800 },  // 左 橙
  { dir: [0, 1, 0], color: 0xf6f6f4 },  // 上 白
  { dir: [0, -1, 0], color: 0xffd500 }, // 下 黄
  { dir: [0, 0, 1], color: 0x009b48 },  // 前 绿
  { dir: [0, 0, -1], color: 0x0046ad }, // 后 蓝
]

const AXIS = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
const AXIS_KEY = ['x', 'y', 'z']

function createStickerGeometry(size, radius) {
  const s = size / 2
  const r = Math.min(radius, s)
  const shape = new THREE.Shape()
  shape.moveTo(-s + r, -s)
  shape.lineTo(s - r, -s)
  shape.quadraticCurveTo(s, -s, s, -s + r)
  shape.lineTo(s, s - r)
  shape.quadraticCurveTo(s, s, s - r, s)
  shape.lineTo(-s + r, s)
  shape.quadraticCurveTo(-s, s, -s, s - r)
  shape.lineTo(-s, -s + r)
  shape.quadraticCurveTo(-s, -s, -s + r, -s)
  return new THREE.ShapeGeometry(shape, 8)
}

export class RubiksCube {
  constructor(container, opts = {}) {
    this.opts = opts
    this.container = container

    this.cubies = []
    this.pointers = new Map()
    this.mode = 'idle'          // idle | pending | layer | orbit | multi
    this.spaceHeld = false
    this.scrambling = false
    this.anim = null
    this.rotating = null
    this.pendingLayer = null
    this.velSamples = []
    this.moves = 0
    this.wasSolved = true

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    this.theta = 0.72
    this.phi = 1.08
    this.radius = 8

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = this.envTexture
    pmrem.dispose()

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4)
    keyLight.position.set(6, 10, 8)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45)
    fillLight.position.set(-8, -5, -6)
    this.scene.add(keyLight, fillLight, new THREE.AmbientLight(0xffffff, 0.6))

    this.raycaster = new THREE.Raycaster()
    this.ndc = new THREE.Vector2()

    this.buildCube()
    this.bindEvents()
    this.onResize()

    this.camera.position.setFromSphericalCoords(this.radius, this.phi, this.theta)
    this.camera.lookAt(0, 0, 0)
    this.scene.updateMatrixWorld(true)

    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(container)
    this.renderer.setAnimationLoop(() => this.tick())

    if (import.meta.env?.DEV) window.__rubik = this
  }

  buildCube() {
    this.cubeGroup = new THREE.Group()
    this.scene.add(this.cubeGroup)

    const bodyGeo = new RoundedBoxGeometry(1, 1, 1, 4, 0.07)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.32, metalness: 0.15 })
    const stickerGeo = createStickerGeometry(0.84, 0.13)
    const stickerMats = new Map()
    for (const f of FACE_DEFS) {
      stickerMats.set(f.color, new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.25, metalness: 0 }))
    }

    const zAxis = new THREE.Vector3(0, 0, 1)
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cubie = new THREE.Group()
          cubie.position.set(x * SP, y * SP, z * SP)
          cubie.userData.home = cubie.position.clone()

          const body = new THREE.Mesh(bodyGeo, bodyMat)
          body.userData.cubie = cubie
          cubie.add(body)

          for (const f of FACE_DEFS) {
            const [dx, dy, dz] = f.dir
            if ((dx !== 0 && dx !== x) || (dy !== 0 && dy !== y) || (dz !== 0 && dz !== z)) continue
            const normal = new THREE.Vector3(dx, dy, dz)
            const sticker = new THREE.Mesh(stickerGeo, stickerMats.get(f.color))
            sticker.userData.cubie = cubie
            sticker.userData.stickerColor = f.color
            sticker.position.copy(normal).multiplyScalar(0.5 + 0.004)
            sticker.quaternion.setFromUnitVectors(zAxis, normal)
            cubie.add(sticker)
          }

          this.cubies.push(cubie)
          this.cubeGroup.add(cubie)
        }
      }
    }
  }

  bindEvents() {
    const c = this.renderer.domElement
    this._el = c
    c.style.touchAction = 'none'
    c.style.display = 'block'

    c.addEventListener('pointerdown', (this._onDown = (e) => this.onPointerDown(e)))
    c.addEventListener('pointermove', (this._onMove = (e) => this.onPointerMove(e)))
    c.addEventListener('pointerup', (this._onUp = (e) => this.onPointerUp(e)))
    c.addEventListener('pointercancel', this._onUp)
    c.addEventListener(
      'wheel',
      (this._onWheel = (e) => {
        e.preventDefault()
        this.radius = THREE.MathUtils.clamp(this.radius * Math.exp(e.deltaY * 0.001), MIN_RADIUS, MAX_RADIUS)
      }),
      { passive: false }
    )
    c.addEventListener('contextmenu', (this._onCtx = (e) => e.preventDefault()))

    window.addEventListener(
      'keydown',
      (this._onKeyDown = (e) => {
        if (e.code !== 'Space' || e.repeat) return
        this.spaceHeld = true
        c.style.cursor = 'grab'
        const tag = e.target?.tagName
        if (tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault()
      })
    )
    window.addEventListener(
      'keyup',
      (this._onKeyUp = (e) => {
        if (e.code !== 'Space') return
        this.spaceHeld = false
        c.style.cursor = ''
      })
    )
    window.addEventListener('blur', (this._onBlur = () => { this.spaceHeld = false }))
  }

  // ---------- 指针交互 ----------

  onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    try { this._el.setPointerCapture(e.pointerId) } catch {}
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (this.pointers.size >= 2) {
      this.abortLayerDrag()
      this.mode = 'multi'
      this.multiLast = this.twoPointerState()
      return
    }
    if (e.pointerType === 'mouse' && this.spaceHeld) {
      this.mode = 'orbit'
      this.orbitLast = { x: e.clientX, y: e.clientY }
      return
    }
    if (this.scrambling) {
      const hit = this.raycastAt(e.clientX, e.clientY)
      if (!hit) {
        this.mode = 'orbit'
        this.orbitLast = { x: e.clientX, y: e.clientY }
      } else {
        this.mode = 'idle'
      }
      return
    }

    let hit = this.raycastAt(e.clientX, e.clientY)
    if (hit && this.anim) {
      this.finishAnimNow()
      hit = this.raycastAt(e.clientX, e.clientY)
    }
    if (!hit) {
      this.mode = 'orbit'
      this.orbitLast = { x: e.clientX, y: e.clientY }
      return
    }
    if (this.rotating) {
      this.mode = 'idle'
      return
    }

    this.pendingLayer = { hit, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY }
    this.velSamples = []
    this.mode = 'pending'
  }

  onPointerMove(e) {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY

    if (this.mode === 'multi') {
      const st = this.twoPointerState()
      const last = this.multiLast
      if (st && last) {
        this.orbitBy(st.cx - last.cx, st.cy - last.cy)
        if (st.dist > 0 && last.dist > 0) {
          this.radius = THREE.MathUtils.clamp(this.radius * (last.dist / st.dist), MIN_RADIUS, MAX_RADIUS)
        }
      }
      this.multiLast = st
      return
    }
    if (this.mode === 'orbit') {
      this.orbitBy(dx, dy)
      return
    }
    if (this.mode === 'pending' && this.pendingLayer) {
      const tdx = e.clientX - this.pendingLayer.startX
      const tdy = e.clientY - this.pendingLayer.startY
      if (Math.hypot(tdx, tdy) >= DRAG_THRESHOLD) this.beginLayer(e, tdx, tdy)
      return
    }
    if (this.mode === 'layer' && this.rotating && this.rotating.mode === 'drag') {
      this.updateLayerAngle(e)
    }
  }

  onPointerUp(e) {
    this.pointers.delete(e.pointerId)

    if (this.mode === 'pending' && this.pendingLayer && this.pendingLayer.pointerId === e.pointerId) {
      this.pendingLayer = null
      this.mode = 'idle'
    } else if (this.mode === 'layer' && this.layerPointerId === e.pointerId) {
      this.releaseLayer()
      this.mode = 'idle'
    } else if (this.mode === 'multi') {
      if (this.pointers.size === 1) {
        const rest = [...this.pointers.values()][0]
        this.mode = 'orbit'
        this.orbitLast = { x: rest.x, y: rest.y }
      } else if (this.pointers.size === 0) {
        this.mode = 'idle'
      }
    } else if (this.mode === 'orbit' && this.pointers.size === 0) {
      this.mode = 'idle'
    }
  }

  twoPointerState() {
    const pts = [...this.pointers.values()]
    if (pts.length < 2) return null
    const [a, b] = pts
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) }
  }

  orbitBy(dx, dy) {
    const k = 0.005
    this.theta -= dx * k
    this.phi = THREE.MathUtils.clamp(this.phi - dy * k, 0.12, Math.PI - 0.12)
  }

  raycastAt(clientX, clientY) {
    const rect = this._el.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1))
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.cubies, true)
    for (const h of hits) {
      if (!h.face || !h.object.userData.cubie) continue
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld)
      n.set(Math.round(n.x), Math.round(n.y), Math.round(n.z))
      if (n.lengthSq() !== 1) continue // 命中圆角/棱边，法线非正交，跳过
      return { cubie: h.object.userData.cubie, point: h.point.clone(), normal: n }
    }
    return null
  }

  // 依据初始拖动方向，从两个候选旋转轴中选出屏幕投影最贴合的那个
  pickAxis(hit, tdx, tdy) {
    const len = Math.hypot(tdx, tdy)
    if (len < 1) return null
    const dragX = tdx / len
    const dragY = tdy / len
    this.camera.updateMatrixWorld()
    const rect = this._el.getBoundingClientRect()

    let best = null
    let bestScore = 0.1
    for (let i = 0; i < 3; i++) {
      const a = AXIS[i]
      if (Math.abs(a.dot(hit.normal)) > 0.5) continue
      const u = new THREE.Vector3().crossVectors(a, hit.point)
      if (u.lengthSq() < 1e-4) continue
      u.normalize()
      const p0 = hit.point.clone().project(this.camera)
      const p1 = hit.point.clone().addScaledVector(u, 0.5).project(this.camera)
      const sx = ((p1.x - p0.x) * rect.width) / 2
      const sy = (-(p1.y - p0.y) * rect.height) / 2
      const sl = Math.hypot(sx, sy)
      if (sl < 1e-6) continue
      const score = (sx * dragX + sy * dragY) / sl
      if (Math.abs(score) > Math.abs(bestScore)) {
        bestScore = score
        best = i
      }
    }
    return best
  }

  beginLayer(e, tdx, tdy) {
    const { hit } = this.pendingLayer
    const axisIndex = this.pickAxis(hit, tdx, tdy)
    if (axisIndex === null) {
      this.pendingLayer = null
      this.mode = 'idle'
      return
    }
    const comp = AXIS_KEY[axisIndex]
    const layerIndex = Math.round(hit.cubie.position[comp] / SP)
    const r = this.createRotation(axisIndex, layerIndex)
    this.layerPointerId = this.pendingLayer.pointerId
    this.pendingLayer = null

    this.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(hit.normal, hit.point)
    this.dragHit = hit
    const u = new THREE.Vector3().crossVectors(r.axis, hit.point)
    this.dragRadius = Math.max(u.length(), 0.75)
    this.dragTangent = u.normalize()
    this.mode = 'layer'
    this.updateLayerAngle(e)
  }

  updateLayerAngle(e) {
    const r = this.rotating
    if (!r) return
    const rect = this._el.getBoundingClientRect()
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1))
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const pt = this.raycaster.ray.intersectPlane(this.dragPlane, new THREE.Vector3())
    if (!pt) return
    // 弧长近似：位移在切向的投影 / 到转轴的距离
    const angle = (pt.sub(this.dragHit.point).dot(this.dragTangent) / this.dragRadius) * ANGLE_GAIN
    r.angle = angle
    r.group.quaternion.setFromAxisAngle(r.axis, angle)

    const now = performance.now()
    this.velSamples.push({ t: now, a: angle })
    while (this.velSamples.length > 2 && now - this.velSamples[0].t > 90) this.velSamples.shift()
  }

  flickVelocity() {
    const s = this.velSamples
    if (s.length < 2) return 0
    const dt = (s[s.length - 1].t - s[0].t) / 1000
    if (dt <= 0.02) return 0
    return (s[s.length - 1].a - s[0].a) / dt
  }

  releaseLayer() {
    const r = this.rotating
    if (!r || r.mode !== 'drag') return
    const vel = this.flickVelocity()
    let target = Math.round(r.angle / HALF_PI) * HALF_PI
    if (Math.abs(vel) > FLICK_SPEED) {
      const q = r.angle / HALF_PI
      target = (vel > 0 ? Math.ceil(q + 1e-4) : Math.floor(q - 1e-4)) * HALF_PI
      target = THREE.MathUtils.clamp(target, r.angle - HALF_PI, r.angle + HALF_PI)
    }
    this.animateTo(target)
  }

  abortLayerDrag() {
    this.pendingLayer = null
    if (this.rotating && this.rotating.mode === 'drag') {
      this.animateTo(Math.round(this.rotating.angle / HALF_PI) * HALF_PI)
    }
  }

  // ---------- 层旋转与状态固化 ----------

  createRotation(axisIndex, layerIndex) {
    const comp = AXIS_KEY[axisIndex]
    const group = new THREE.Group()
    this.scene.add(group)
    for (const c of this.cubies) {
      if (Math.round(c.position[comp] / SP) === layerIndex) group.attach(c)
    }
    this.rotating = { axis: AXIS[axisIndex].clone(), axisIndex, layerIndex, group, angle: 0, mode: 'drag' }
    return this.rotating
  }

  animateTo(target) {
    const r = this.rotating
    if (!r) return Promise.resolve()
    r.mode = 'anim'
    const dur = 90 + Math.min(140, Math.abs(target - r.angle) * 160)
    return new Promise((resolve) => {
      this.anim = { from: r.angle, to: target, start: performance.now(), dur, resolve }
    })
  }

  rotateLayer(axisIndex, layerIndex, quarters, duration = 95) {
    return new Promise((resolve) => {
      const r = this.createRotation(axisIndex, layerIndex)
      r.mode = 'anim'
      this.anim = { from: 0, to: quarters * HALF_PI, start: performance.now(), dur: duration, resolve }
    })
  }

  finishAnimNow() {
    const a = this.anim
    if (!a || !this.rotating) return
    this.anim = null
    this.rotating.group.quaternion.setFromAxisAngle(this.rotating.axis, a.to)
    this.rotating.angle = a.to
    this.bake(a.to)
    a.resolve?.()
  }

  bake(target) {
    const r = this.rotating
    if (!r) return
    for (const c of [...r.group.children]) {
      this.cubeGroup.attach(c)
      this.snapCubie(c)
    }
    this.scene.remove(r.group)
    this.rotating = null

    if (!this.scrambling) {
      const quarters = Math.round(target / HALF_PI)
      const net = ((quarters % 4) + 4) % 4
      if (net !== 0) {
        this.moves += 1
        this.opts.onMoves?.(this.moves)
      }
      const solved = this.checkSolved()
      if (solved && !this.wasSolved) this.opts.onSolved?.()
      this.wasSolved = solved
    }
  }

  snapCubie(c) {
    c.position.set(
      Math.round(c.position.x / SP) * SP,
      Math.round(c.position.y / SP) * SP,
      Math.round(c.position.z / SP) * SP
    )
    const m = new THREE.Matrix4().makeRotationFromQuaternion(c.quaternion)
    const el = m.elements
    for (let i = 0; i < 16; i++) el[i] = Math.round(el[i])
    c.quaternion.setFromRotationMatrix(m)
  }

  checkSolved() {
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const faceColor = new Map()
    for (const cubie of this.cubies) {
      for (const st of cubie.children) {
        const color = st.userData.stickerColor
        if (color === undefined) continue
        st.getWorldQuaternion(q)
        v.set(0, 0, 1).applyQuaternion(q)
        const key = `${Math.round(v.x)},${Math.round(v.y)},${Math.round(v.z)}`
        const prev = faceColor.get(key)
        if (prev === undefined) faceColor.set(key, color)
        else if (prev !== color) return false
      }
    }
    return faceColor.size === 6
  }

  // ---------- 打乱 / 复原 ----------

  async scramble(count = 22) {
    if (this.scrambling) return
    this.scrambling = true
    this.mode = 'idle'
    this.pendingLayer = null
    if (this.anim) this.finishAnimNow()
    if (this.rotating && this.rotating.mode === 'drag') {
      await this.animateTo(Math.round(this.rotating.angle / HALF_PI) * HALF_PI)
    }

    this.moves = 0
    this.opts.onMoves?.(0)

    let prev = null
    for (let i = 0; i < count; i++) {
      let axis = 0
      let layer = 0
      do {
        axis = (Math.random() * 3) | 0
        layer = ((Math.random() * 3) | 0) - 1
      } while (prev && prev.axis === axis && prev.layer === layer)
      prev = { axis, layer }
      const r = Math.random()
      const quarters = r < 0.42 ? 1 : r < 0.84 ? -1 : 2
      await this.rotateLayer(axis, layer, quarters, quarters === 2 ? 130 : 95)
    }

    this.scrambling = false
    this.wasSolved = this.checkSolved()
  }

  reset() {
    if (this.scrambling) return
    this.mode = 'idle'
    this.pendingLayer = null
    if (this.anim) this.finishAnimNow()
    if (this.rotating) {
      this.rotating.group.quaternion.setFromAxisAngle(this.rotating.axis, this.rotating.angle)
      this.bake(0)
    }
    for (const c of this.cubies) {
      c.position.copy(c.userData.home)
      c.quaternion.identity()
    }
    this.moves = 0
    this.opts.onMoves?.(0)
    this.wasSolved = true
  }

  // ---------- 帧循环与自适应 ----------

  tick() {
    const t = performance.now()
    const a = this.anim
    if (a && this.rotating) {
      const raw = a.dur <= 0 ? 1 : Math.min(1, (t - a.start) / a.dur)
      const k = 1 - Math.pow(1 - raw, 3)
      const angle = a.from + (a.to - a.from) * k
      this.rotating.angle = angle
      this.rotating.group.quaternion.setFromAxisAngle(this.rotating.axis, angle)
      if (raw >= 1) {
        this.anim = null
        this.bake(a.to)
        a.resolve?.()
      }
    }
    this.camera.position.setFromSphericalCoords(this.radius, this.phi, this.theta)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateMatrixWorld()
    this.renderer.render(this.scene, this.camera)
  }

  onResize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.minRadius = this.fitRadius(w, h)
    if (!this._radiusInit) {
      this.radius = this.minRadius
      this._radiusInit = true
    } else {
      this.radius = Math.max(this.radius, this.minRadius)
    }
  }

  fitRadius(w, h) {
    const half = 2.7
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov) / 2
    const hHalf = Math.atan(Math.tan(vHalf) * (w / h))
    return Math.max(half / Math.tan(vHalf), half / Math.tan(hHalf)) * 1.03
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.ro?.disconnect()
    const c = this._el
    c.removeEventListener('pointerdown', this._onDown)
    c.removeEventListener('pointermove', this._onMove)
    c.removeEventListener('pointerup', this._onUp)
    c.removeEventListener('pointercancel', this._onUp)
    c.removeEventListener('wheel', this._onWheel)
    c.removeEventListener('contextmenu', this._onCtx)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onBlur)
    this.scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
      for (const m of mats) m.dispose()
    })
    this.envTexture?.dispose()
    this.renderer.dispose()
    c.remove()
    if (window.__rubik === this) delete window.__rubik
  }
}
