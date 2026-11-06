// Tiles the EMODnet vessel density rasters (see readme.md). No dependency:
//   node --max-old-space-size=8192 build.mjs <folder of the .tif> <output folder>
// It writes <year>/<resolution>m/ for each year, with a column per ship type, and change/<resolution>m/, with a column
// per year for all types and the 4 main ones, from 2 km.
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { join } from 'node:path'

const [inDir, outDir] = process.argv.slice(2)

// the column of each ship type, and its number in the file names of the source
const TYPES = {
    o: '00', // other
    f: '01', // fishing
    s: '02', // service
    d: '03', // dredging or underwater operations
    a: '04', // sailing
    l: '05', // pleasure craft
    h: '06', // high speed craft
    u: '07', // tug and towing
    p: '08', // passenger
    c: '09', // cargo
    t: '10', // tanker
    m: '11', // military and law enforcement
    n: '12', // unknown (not x: the columns x and y are the position of the cell)
}
const COLUMNS = Object.keys(TYPES)
const YEARS = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024']
const CHANGE_TYPES = ['c', 't', 'f', 'p']

const THRESHOLD = 0.1
const TILE_SIZE = 128
// lower left of the tiling: a multiple of all resolutions, left of the data, so that no tile has a negative number
const ORIGIN_KM = { x: -1000, y: 0 }
// each resolution, and the finer one it is computed from
const PARENTS = { 1: null, 2: 1, 5: 1, 10: 5, 20: 10, 50: 10, 100: 50 }
const RESOLUTIONS_KM = Object.keys(PARENTS).map(Number)
const CHANGE_RESOLUTIONS_KM = RESOLUTIONS_KM.filter((a) => a >= 2)

/** Reads a float32 GeoTIFF in strips, with deflate or no compression, without no-data values. */
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
    const bytes = new Uint8Array(w * h * 4)
    let at = 0
    tags[273].forEach((offset, i) => {
        const raw = b.subarray(offset, offset + tags[279][i])
        const r = tags[259][0] === 8 ? inflateSync(raw) : raw
        bytes.set(r, at)
        at += r.length
    })
    check(at === w * h * 4, 'wrong number of values')
    if (!le) for (let i = 0; i < at; i += 4) {
        let t = bytes[i]; bytes[i] = bytes[i + 3]; bytes[i + 3] = t
        t = bytes[i + 1]; bytes[i + 1] = bytes[i + 2]; bytes[i + 2] = t
    }
    const values = new Float32Array(bytes.buffer)
    for (let i = 0; i < values.length; i++) if (!(values[i] > 0)) values[i] = 0
    return { w, h, xMin: tags[33922][3], yMax: tags[33922][4], values }
}

/** One decimal under 10, then 3 digits, as short as can be: an empty value is under 0.05. */
function number(v) {
    if (v < 0.05) return ''
    const x = v < 9.95 ? +v.toFixed(1) : v < 999.5 ? Math.round(v) : Math.round(v / 10) * 10
    return ('' + x).replace(/^0\./, '.')
}

// the frame of the grid of each resolution, in cells, from the first raster
let frame
const gridFrame = (a) => ({
    cx0: Math.floor(frame.x0 / a),
    cy0: Math.floor((frame.yTop - frame.h) / a),
    cw: Math.ceil((frame.x0 + frame.w) / a) - Math.floor(frame.x0 / a),
    ch: Math.ceil(frame.yTop / a) - Math.floor((frame.yTop - frame.h) / a),
})

/** The 1 km grid of a raster, from the bottom row. */
function toGrid(t) {
    const x0 = t.xMin / 1000
    const yTop = t.yMax / 1000
    if (!frame) {
        frame = { x0, yTop, w: t.w, h: t.h }
        console.log(`raster ${t.w} x ${t.h}, xMin ${t.xMin}, yMax ${t.yMax}`)
    } else if (t.w !== frame.w || t.h !== frame.h || x0 !== frame.x0 || yTop !== frame.yTop)
        throw new Error('not on the same grid')
    const f = gridFrame(1)
    const out = new Float32Array(f.cw * f.ch)
    for (let r = 0; r < t.h; r++) out.set(t.values.subarray(r * t.w, (r + 1) * t.w), (t.h - 1 - r) * f.cw)
    return out
}

/** A coarser grid: the total of the cells of the finer one over the area, land included. */
function aggregate(fine, aFine, a) {
    const ff = gridFrame(aFine)
    const f = gridFrame(a)
    const out = new Float32Array(f.cw * f.ch)
    const ratio = (aFine * aFine) / (a * a)
    for (let cy = 0; cy < ff.ch; cy++) {
        const y = Math.floor(((ff.cy0 + cy) * aFine) / a) - f.cy0
        for (let cx = 0; cx < ff.cw; cx++) {
            const v = fine[cy * ff.cw + cx]
            if (v > 0) out[y * f.cw + Math.floor(((ff.cx0 + cx) * aFine) / a) - f.cx0] += v * ratio
        }
    }
    return out
}

/** Writes a resolution of a tiled grid. */
function writeGrid(dir, a, columns, layers, isKept) {
    if (existsSync(dir)) rmSync(dir, { recursive: true })
    mkdirSync(dir, { recursive: true })
    const f = gridFrame(a)
    const originCellX = ORIGIN_KM.x / a
    const originCellY = ORIGIN_KM.y / a
    const tiles = new Map()
    let cells = 0
    for (let cy = 0; cy < f.ch; cy++)
        for (let cx = 0; cx < f.cw; cx++) {
            const i = cy * f.cw + cx
            if (!isKept(i)) continue
            const ax = f.cx0 + cx - originCellX
            const ay = f.cy0 + cy - originCellY
            const key = Math.floor(ax / TILE_SIZE) + '/' + Math.floor(ay / TILE_SIZE)
            let rows = tiles.get(key)
            if (!rows) tiles.set(key, (rows = []))
            let row = (ax % TILE_SIZE) + ',' + (ay % TILE_SIZE)
            for (const l of layers) row += ',' + number(l[i])
            rows.push(row)
            cells++
        }
    const b = { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity }
    const header = 'x,y,' + columns.join(',') + '\n'
    let bytes = 0
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
    }
    const info = {
        dims: columns,
        crs: '3035',
        tileSizeCell: TILE_SIZE,
        originPoint: { x: ORIGIN_KM.x * 1000, y: ORIGIN_KM.y * 1000 },
        resolutionGeo: a * 1000,
        tilingBounds: b,
    }
    writeFileSync(join(dir, 'info.json'), JSON.stringify(info, null, 3))
    return { cells, tiles: tiles.size, bytes }
}

// the columns of the change table, kept by resolution
const changeColumns = []
const changeLayers = {}
for (const a of CHANGE_RESOLUTIONS_KM) changeLayers[a] = []
const changeMax = {} // the highest total of the years, by resolution

let grandTotal = 0
for (const year of YEARS) {
    const yy = year.slice(2)
    const perResolution = {}
    for (const a of RESOLUTIONS_KM) perResolution[a] = []
    for (const col of COLUMNS) {
        const grids = { 1: toGrid(readTiff(join(inDir, `vesseldensity_${TYPES[col]}_${year}.tif`))) }
        for (const a of RESOLUTIONS_KM) if (PARENTS[a]) grids[a] = aggregate(grids[PARENTS[a]], PARENTS[a], a)
        for (const a of RESOLUTIONS_KM) perResolution[a].push(grids[a])
    }
    const line = []
    let yearBytes = 0
    const totalsByResolution = {}
    for (const a of RESOLUTIONS_KM) {
        const layers = perResolution[a]
        const total = new Float32Array(layers[0].length)
        for (const l of layers) for (let i = 0; i < l.length; i++) total[i] += l[i]
        totalsByResolution[a] = total
        const r = writeGrid(join(outDir, year, a * 1000 + 'm'), a, COLUMNS, layers, (i) => total[i] >= THRESHOLD)
        yearBytes += r.bytes
        line.push(`${a}km:${(r.cells / 1e3).toFixed(0)}k`)
    }
    grandTotal += yearBytes
    let hours = 0
    for (const v of totalsByResolution[1]) hours += v
    console.log(`${year}: ${(yearBytes / 1e6).toFixed(0)} MB, ${Math.round(hours)} hours per month | ${line.join(' ')}`)

    // what the change table needs of this year
    for (const a of CHANGE_RESOLUTIONS_KM) {
        const total = totalsByResolution[a]
        if (!changeMax[a]) changeMax[a] = new Float32Array(total.length)
        for (let i = 0; i < total.length; i++) if (total[i] > changeMax[a][i]) changeMax[a][i] = total[i]
        changeLayers[a].push(total)
        for (const t of CHANGE_TYPES) changeLayers[a].push(perResolution[a][COLUMNS.indexOf(t)])
    }
    changeColumns.push('a' + yy, ...CHANGE_TYPES.map((t) => t + yy))
}

for (const a of CHANGE_RESOLUTIONS_KM) {
    const max = changeMax[a]
    const r = writeGrid(join(outDir, 'change', a * 1000 + 'm'), a, changeColumns, changeLayers[a], (i) => max[i] >= THRESHOLD)
    grandTotal += r.bytes
    console.log(`change ${a} km: ${r.cells} cells, ${r.tiles} tiles, ${(r.bytes / 1e6).toFixed(1)} MB`)
}
console.log(`in all: ${(grandTotal / 1e6).toFixed(0)} MB`)
