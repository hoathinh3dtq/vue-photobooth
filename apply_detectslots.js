const fs = require('fs');
const p = 'C:\\Users\\Admin\\Documents\\Default Project\\clickfun\\vue-photobooth\\src\\renderer\\src\\pages\\SelectThemePage.vue';
let s = fs.readFileSync(p, 'utf8');

const startMarker = 'function detectSlots(src: string): Promise<{ ratio: string; slots: Slot[]; processedSrc: string }> {';
const endMarker = 'function redetectSlots(): void {';

const i = s.indexOf(startMarker);
const j = s.indexOf(endMarker);
if (i < 0 || j < 0) { console.error('markers not found'); process.exit(1); }

const newFn = `function detectSlots(src: string): Promise<{ ratio: string; slots: Slot[]; processedSrc: string }> {
  // HihiBooth-style: alpha union-find with padding, plus dark-slot fallback.
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => {
      slotCache[src] = { ratio: '1 / 1', slots: [], processedSrc: src }
      resolve(slotCache[src])
    }
    img.onload = () => {
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      const MAX_ANALYSIS = 2600000
      const r = Math.min(1, 800 / Math.max(iw, ih))
      const aw = Math.max(1, Math.round(iw * r))
      const ah = Math.max(1, Math.round(ih * r))
      const canvas = document.createElement('canvas')
      canvas.width = aw
      canvas.height = ah
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        slotCache[src] = { ratio: \`\${iw} / \${ih}\`, slots: [], processedSrc: src }
        resolve(slotCache[src])
        return
      }
      ctx.clearRect(0, 0, aw, ah)
      ctx.drawImage(img, 0, 0, aw, ah)
      let imageData: ImageData
      try { imageData = ctx.getImageData(0, 0, aw, ah) }
      catch {
        slotCache[src] = { ratio: \`\${iw} / \${ih}\`, slots: [], processedSrc: img.src }
        resolve(slotCache[src])
        return
      }
      const pixels = imageData.data
      const total = aw * ah
      const alpha = new Uint8Array(total)
      for (let t = 0; t < total; t++) alpha[t] = pixels[t * 4 + 3] < 30 ? 1 : 0

      // union-find
      const parent = new Int32Array(total).fill(-1)
      const roots: number[] = []
      function find(t: number): number { for (; parent[t] !== t && parent[t] !== -1;) { parent[t] = parent[parent[t]] >= 0 ? parent[parent[t]] : parent[t]; t = parent[t] } ; return t < 0 ? -1 : t }
      // simpler find:
      function find2(t: number): number {
        while (parent[t] >= 0 && parent[parent[t]] >= 0) { parent[t] = parent[parent[t]]; t = parent[t] }
        return parent[t] < 0 ? t : parent[t]
      }
      // We'll use a flat union-find with negative size
      const uf = new Int32Array(total).fill(-1)
      function ufFind(t: number): number {
        let root = t
        while (uf[root] >= 0) root = uf[root]
        while (uf[t] >= 0) { const nt = uf[t]; uf[t] = root; t = nt }
        return root
      }
      function ufUnion(a: number, b: number) {
        a = ufFind(a); b = ufFind(b)
        if (a === b) return
        if (uf[a] > uf[b]) { const tmp = a; a = b; b = tmp }
        uf[a] += uf[b]
        uf[b] = a
      }

      let compCount = 0
      const compId = new Int32Array(total).fill(-1)
      for (let y = 0; y < ah; y++) {
        for (let x = 0; x < aw; x++) {
          const idx = y * aw + x
          if (!alpha[idx]) continue
          const up = y > 0 ? compId[(y - 1) * aw + x] : -1
          const left = x > 0 ? compId[y * aw + (x - 1)] : -1
          if (up === -1 && left === -1) { compId[idx] = compCount++; }
          else if (up !== -1 && left === -1) compId[idx] = up
          else if (up === -1 && left !== -1) compId[idx] = left
          else { compId[idx] = Math.min(up, left); ufUnion(up, left) }
        }
      }

      // remap component ids via uf
      const compMap = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }>()
      for (let y = 0; y < ah; y++) {
        for (let x = 0; x < aw; x++) {
          const idx = y * aw + x
          if (!alpha[idx]) continue
          const root = ufFind(compId[idx])
          if (!compMap.has(root)) compMap.set(root, { minX: x, minY: y, maxX: x, maxY: y, count: 1 })
          else {
            const c = compMap.get(root)!
            c.minX = Math.min(c.minX, x); c.minY = Math.min(c.minY, y)
            c.maxX = Math.max(c.maxX, x); c.maxY = Math.max(c.maxY, y)
            c.count++
          }
        }
      }

      const minPixels = total * 0.005
      const M = 1 / r
      const pad = Math.ceil(M)
      const holes: Slot[] = []
      for (const [, c] of compMap) {
        if (c.count < minPixels) continue
        if (c.minX === 0 || c.minY === 0 || c.maxX === aw - 1 || c.maxY === ah - 1) continue
        const x = Math.max(0, Math.round(c.minX * M) - pad)
        const y = Math.max(0, Math.round(c.minY * M) - pad)
        const w = Math.round((c.maxX + 1) * M) + pad - x
        const h = Math.round((c.maxY + 1) * M) + pad - y
        holes.push({ x: (x / iw) * 100, y: (y / ih) * 100, w: (w / iw) * 100, h: (h / ih) * 100 })
      }
      holes.sort((a, b) => a.y - b.y || a.x - b.x)

      // dark-slot fallback if no transparent holes
      let finalSlots = holes
      let processedSrc = src
      if (finalSlots.length === 0) {
        // fallback: detect dark regions
        const darkRegions: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = []
        const visited = new Uint8Array(total)
        for (let y = 0; y < ah; y++) {
          for (let x = 0; x < aw; x++) {
            const idx = y * aw + x
            if (visited[idx]) continue
            const pi = idx * 4
            const a = pixels[pi + 3], rr = pixels[pi], g = pixels[pi + 1], b = pixels[pi + 2]
            if (!(a > 240 && rr < 34 && g < 34 && b < 34)) continue
            // flood fill
            const stack = [x, y]
            let minX = x, maxX = x, minY = y, maxY = y, cnt = 0
            while (stack.length) {
              const cy = stack.pop() as number
              const cx = stack.pop() as number
              const ci = cy * aw + cx
              if (visited[ci]) continue
              visited[ci] = 1
              const cpi = ci * 4
              const ca = pixels[cpi + 3], cr = pixels[cpi], cg = pixels[cpi + 1], cb = pixels[cpi + 2]
              if (!(ca > 240 && cr < 34 && cg < 34 && cb < 34)) continue
              cnt++
              if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
              if (cy < minY) minY = cy; if (cy > maxY) maxY = cy
              if (cx > 0) stack.push(cx - 1, cy)
              if (cx < aw - 1) stack.push(cx + 1, cy)
              if (cy > 0) stack.push(cx, cy - 1)
              if (cy < ah - 1) stack.push(cx, cy + 1)
            }
            if (cnt > 100) darkRegions.push({ minX, maxX, minY, maxY })
          }
        }
        finalSlots = darkRegions
          .filter(r => r.maxX - r.minX > 20 && r.maxY - r.minY > 20)
          .sort((a, b) => a.minY - b.minY || a.minX - b.minX)
          .map(r => ({
            x: (r.minX / aw) * 100 * (aw / iw) * (iw / aw), // keep percent of original
            y: (r.minY / ah) * 100,
            w: ((r.maxX - r.minX + 1) / aw) * 100,
            h: ((r.maxY - r.minY + 1) / ah) * 100,
          }))
        // fix x percent to use aw/iw scaling consistently (aw = iw*r, so percent of aw == percent of iw)
        finalSlots = darkRegions
          .filter(r => r.maxX - r.minX > 20 && r.maxY - r.minY > 20)
          .sort((a, b) => a.minY - b.minY || a.minX - b.minX)
          .map(r => ({
            x: (r.minX / aw) * 100,
            y: (r.minY / ah) * 100,
            w: ((r.maxX - r.minX + 1) / aw) * 100,
            h: ((r.maxY - r.minY + 1) / ah) * 100,
          }))
      }

      slotCache[src] = { ratio: \`\${iw} / \${ih}\`, slots: finalSlots, processedSrc }
      resolve({ ratio: \`\${iw} / \${ih}\`, slots: finalSlots, processedSrc })
    }
    img.src = src
  })
}

`;

s = s.slice(0, i) + newFn + '\n' + s.slice(j);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
`;

// write to file
const fs2 = require('fs');
fs2.writeFileSync('C:\\Users\\Admin\\Documents\\Default Project\\clickfun\\vue-photobooth\\apply_detectslots.js', newFn_wrapper, 'utf8');
console.log('written');
