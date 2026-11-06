// Tiles the EMODnet vessel density rasters (see readme.md). No dependency:
//   node build.mjs <folder of the .tif> <output folder> [threshold]
// Without a threshold, it only reports how many cells and bytes each threshold would give.
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { join } from 'node:path'

const [inDir, outDir, thresholdArg] = process.argv.slice(2)

// the column prefix of each ship type, and its number in the file names of the source
const TYPES = { c: '09', t: '10', f: '01', p: '08' }
const YEARS = ['19', '23']
const COLUMNS = Object.keys(TYPES).flatMap((t) => YEARS.map((y) => t + y))
const FILE_NAME = (t, y) => `vesseldensity_${TYPES[t]}_20${y}.tif`

const RESOLUTIONS_KM = [1, 2, 5, 10, 20, 50, 100]
const TILE_SIZE = 128
// lower left of the tiling: a multiple of all resolutions, left of the data, so that no tile has a negative number
const ORIGIN_KM = { x: -1000, y: 0 }

/** Reads a float32 GeoTIFF in strips, with deflate or no compression. */
function readTiff(path) {
    const b = readFileSync(path)
    const le = b.toString('latin1', 0, 2) === 'II'
    const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o))
    const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o))
    const f64 = (o) => (le ? b.readDoubleLE(o) : b.readDoubleBE(o))
    if (u16(2) !== 42) throw new Error(path + ': not a classic TIFF')
    const ifd = u32(4)
    const tags = {}
    for (let i = 0; i < u16(ifd); i++) {
        const e = ifd + 2 + i * 12
        const [tag, type, n] = [u16(e), u16(e + 2), u32(e + 4)]
        const size = { 2: 1, 3: 2, 4: 4, 12: 8 }[type] || 1
        const at = n * size <= 4 ? e + 8 : u32(e + 8)
        const read = { 3: u16, 4: u32, 12: f64 }[type]
        tags[tag] = read ? Array.from({ length: n }, (_, k) => read(at + k * size)) : null
    }
    const [w, h] = [tags[256][0], tags[257][0]]
    const check = (cond, what) => {
        if (!cond) throw new Error(path + ': ' + what)
    }
    check(tags[339][0] === 3 && tags[258][0] === 32, 'not float32')
    check(!tags[317] || tags[317][0] === 1, 'with a predictor')
    check(tags[273], 'not in strips')
    check(tags[33550][0] === 1000 && tags[33550][1] === 1000, 'not 1 km')
    const out = new Float32Array(w * h)
    let at = 0
    tags[273].forEach((offset, i) => {
        const raw = b.subarray(offset, offset + tags[279][i])
        const r = tags[259][0] === 8 ? inflateSync(raw) : raw
        for (let k = 0; k + 4 <= r.length; k += 4) out[at++] = le ? r.readFloatLE(k) : r.readFloatBE(k)
    })
    check(at === w * h, 'wrong number of values')
    return { w, h, xMin: tags[33922][3], yMax: tags[33922][4], values: out }
}

// 2 decimals, as short as can be: an empty value is a zero
const number = (v) => {
    const s = v.toFixed(2).replace(/\.?0+$/, '').replace(/^0\./, '.')
    return s === '0' ? '' : s
}

// the rasters, as a grid per resolution: a coarser cell is the total of its 1 km cells over its area, land included
let frame
const grids = {}
COLUMNS.forEach((col, ci) => {
    const t = readTiff(join(inDir, FILE_NAME(col[0], col.slice(1))))
    if (!frame) {
        frame = t
        console.log(`raster ${t.w} x ${t.h}, xMin ${t.xMin}, yMax ${t.yMax}`)
    } else if (t.w !== frame.w || t.h !== frame.h || t.xMin !== frame.xMin || t.yMax !== frame.yMax)
        throw new Error(col + ': not on the same grid')
    const x0 = t.xMin / 1000
    const yTop = t.yMax / 1000
    for (const a of RESOLUTIONS_KM) {
        const cx0 = Math.floor(x0 / a)
        const cy0 = Math.floor((yTop - t.h) / a)
        const cw = Math.ceil((x0 + t.w) / a) - cx0
        const ch = Math.ceil(yTop / a) - cy0
        if (!grids[a]) grids[a] = { cx0, cy0, cw, ch, layers: [] }
        const sum = new Float32Array(cw * ch)
        for (let r = 0; r < t.h; r++) {
            const cy = Math.floor((yTop - r - 1) / a) - cy0
            for (let c = 0; c < t.w; c++) {
                const v = t.values[r * t.w + c]
                if (!(v > 0)) continue // no data, or none
                sum[cy * cw + Math.floor((x0 + c) / a) - cx0] += v
            }
        }
        if (a > 1) for (let i = 0; i < sum.length; i++) sum[i] /= a * a
        grids[a].layers[ci] = sum
    }
    console.log('read', col)
})

// a cell is kept if the 4 types together reach the threshold in one of the years
const yearIndexes = YEARS.map((_, y) => COLUMNS.map((_, i) => i).filter((i) => i % YEARS.length === y))
const kept = (g, i, threshold) => yearIndexes.some((idx) => idx.reduce((s, c) => s + g.layers[c][i], 0) >= threshold)

if (thresholdArg === undefined) {
    for (const threshold of [0.01, 0.05, 0.1, 0.25, 0.5, 1]) {
        let totalCells = 0
        let totalBytes = 0
        const line = []
        for (const a of RESOLUTIONS_KM) {
            const g = grids[a]
            let cells = 0
            let bytes = 0
            const n = g.cw * g.ch
            const step = n > 2e7 ? 7 : 1 // the bytes are estimated on a sample of the largest grids
            for (let i = 0; i < n; i++) {
                if (!kept(g, i, threshold)) continue
                cells++
                if (i % step === 0) {
                    bytes += 8
                    for (const l of g.layers) bytes += number(l[i]).length + 1
                }
            }
            totalCells += cells
            totalBytes += bytes * step
            line.push(`${a}km:${(cells / 1e3).toFixed(0)}k`)
        }
        console.log(`threshold ${threshold}: ${(totalCells / 1e6).toFixed(2)}M cells, ${(totalBytes / 1e6).toFixed(0)} MB | ${line.join(' ')}`)
    }
    process.exit(0)
}

const threshold = +thresholdArg
for (const a of RESOLUTIONS_KM) {
    const g = grids[a]
    const dir = join(outDir, a * 1000 + 'm')
    if (existsSync(dir)) rmSync(dir, { recursive: true })
    mkdirSync(dir, { recursive: true })
    const originCellX = ORIGIN_KM.x / a
    const originCellY = ORIGIN_KM.y / a
    const tiles = new Map()
    for (let cy = 0; cy < g.ch; cy++)
        for (let cx = 0; cx < g.cw; cx++) {
            const i = cy * g.cw + cx
            if (!kept(g, i, threshold)) continue
            const ax = g.cx0 + cx - originCellX
            const ay = g.cy0 + cy - originCellY
            const key = Math.floor(ax / TILE_SIZE) + '/' + Math.floor(ay / TILE_SIZE)
            let rows = tiles.get(key)
            if (!rows) tiles.set(key, (rows = []))
            rows.push(ax % TILE_SIZE + ',' + ay % TILE_SIZE + ',' + g.layers.map((l) => number(l[i])).join(','))
        }
    const b = { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity }
    let bytes = 0
    let cells = 0
    const header = 'x,y,' + COLUMNS.join(',') + '\n'
    for (const [key, rows] of tiles) {
        const [xT, yT] = key.split('/').map(Number)
        b.xMin = Math.min(b.xMin, xT)
        b.xMax = Math.max(b.xMax, xT)
        b.yMin = Math.min(b.yMin, yT)
        b.yMax = Math.max(b.yMax, yT)
        mkdirSync(join(dir, '' + xT), { recursive: true })
        const text = header + rows.join('\n') + '\n'
        writeFileSync(join(dir, '' + xT, yT + '.csv'), text)
        bytes += text.length
        cells += rows.length
    }
    const info = {
        dims: COLUMNS,
        crs: '3035',
        tileSizeCell: TILE_SIZE,
        originPoint: { x: ORIGIN_KM.x * 1000, y: ORIGIN_KM.y * 1000 },
        resolutionGeo: a * 1000,
        tilingBounds: b,
    }
    writeFileSync(join(dir, 'info.json'), JSON.stringify(info, null, 3))
    console.log(`${a} km: ${cells} cells, ${tiles.size} tiles, ${(bytes / 1e6).toFixed(1)} MB`)
}
