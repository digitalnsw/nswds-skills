#!/usr/bin/env node
// Reads the NSW Design System from its published release so pages are built from
// the design system itself, never from memory. The HTML starter kit committed at
// each release tag of digitalnsw/nsw-design-system is the built documentation site
// for that release: rendered component examples, page templates and the release CSS.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const REPO = 'digitalnsw/nsw-design-system'
const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const NPM_URL = 'https://registry.npmjs.org/nsw-design-system/latest'
const kitUrl = (version) => `https://raw.githubusercontent.com/${REPO}/v${version}/HTMLstarterkit.zip`
const cdn = (version, file) => `https://cdn.jsdelivr.net/npm/nsw-design-system@${version}/dist/${file}`
const KEEP = /^(index\.html|css\/main\.css|(components|core|templates)\/[a-z0-9][a-z0-9/._-]*\.html|docs\/content\/[a-z0-9-]+\/[a-z0-9-]+\.html)$/
const VERSION = /^\d+\.\d+\.\d+$/
// Far above the v3.27.0 kit (a 52 MB download; the 232 files kept total 10.5 MB, the
// largest 288 KB) and low enough that a corrupt or tampered kit cannot exhaust memory.
export const KIT_LIMITS = { download: 200 * 1024 * 1024, entry: 10 * 1024 * 1024, total: 100 * 1024 * 1024 }

export const cacheRoot = () => process.env.NSWDS_CACHE_DIR
  || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'nswds-skills', 'nsw-design-system')

function normaliseVersion(value) {
  const version = String(value).trim().replace(/^v/, '')
  if (!VERSION.test(version)) throw new Error(`Not a release version: ${value}`)
  return version
}

async function get(url) {
  const headers = { 'User-Agent': 'nswds-skills', Accept: '*/*' }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token && url.startsWith('https://api.github.com/')) headers.Authorization = `Bearer ${token}`
  const response = await fetch(url, { headers })
  // fetch follows redirects to any address; refuse one that leaves HTTPS.
  if (response.url && new URL(response.url).protocol !== 'https:') {
    throw new Error(`${url} redirected to an insecure address: ${response.url}`)
  }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response
}

// Minimal ZIP reader (stored and deflated entries), enough for the release kit.
export function readZip(buffer) {
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('Not a ZIP archive')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  if (count === 0xffff || offset === 0xffffffff) throw new Error('ZIP64 archives are not supported')
  const entries = []
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt ZIP central directory')
    const nameLength = buffer.readUInt16LE(offset + 28)
    entries.push({
      name: buffer.toString('utf8', offset + 46, offset + 46 + nameLength),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      size: buffer.readUInt32LE(offset + 24),
      local: buffer.readUInt32LE(offset + 42),
    })
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
  return entries
}

export function entryData(buffer, entry) {
  if (buffer.readUInt32LE(entry.local) !== 0x04034b50) throw new Error(`Corrupt ZIP entry: ${entry.name}`)
  const start = entry.local + 30 + buffer.readUInt16LE(entry.local + 26) + buffer.readUInt16LE(entry.local + 28)
  const raw = buffer.subarray(start, start + entry.compressedSize)
  let data
  if (entry.method === 0) data = raw
  else if (entry.method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(entry.size, 1) })
  else throw new Error(`Unsupported compression method ${entry.method}: ${entry.name}`)
  if (data.length !== entry.size) throw new Error(`Size mismatch: ${entry.name}`)
  return data
}

export function kitVersion(indexHtml) {
  return indexHtml.match(/class="nsw-docs__version">\s*v?(\d+\.\d+\.\d+)\s*</)?.[1] ?? null
}

// Reads a response body in chunks, refusing it once it passes limit bytes.
export async function readCapped(response, limit, label) {
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) throw new Error(`${label} is larger than ${limit} bytes; refusing it`)
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks, size)
}

// Extracts only the files the skill reads, then confirms the kit is the release asked for.
// Declared sizes are checked before anything is decompressed.
export function extractKit(buffer, version, root = cacheRoot(), limits = KIT_LIMITS) {
  version = normaliseVersion(version)
  const target = join(root, version)
  const staging = `${target}.partial-${process.pid}`
  rmSync(staging, { recursive: true, force: true })
  try {
    let total = 0
    for (const entry of readZip(buffer)) {
      if (!KEEP.test(entry.name) || entry.name.split('/').includes('..')) continue
      const path = resolve(staging, entry.name)
      if (!path.startsWith(resolve(staging) + sep)) continue
      if (entry.size > limits.entry) throw new Error(`Kit entry ${entry.name} declares ${entry.size} bytes; refusing entries over ${limits.entry}`)
      total += entry.size
      if (total > limits.total) throw new Error(`Kit files total more than ${limits.total} bytes; refusing it`)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, entryData(buffer, entry))
    }
    const index = join(staging, 'index.html')
    if (!existsSync(index) || !existsSync(join(staging, 'css', 'main.css'))) throw new Error('Kit is missing index.html or css/main.css')
    const found = kitVersion(readFileSync(index, 'utf8'))
    if (found !== version) throw new Error(`Kit at v${version} reports version ${found ?? 'unknown'}`)
    writeFileSync(join(staging, '.complete'), `${version}\n`)
    rmSync(target, { recursive: true, force: true })
    mkdirSync(root, { recursive: true })
    renameSync(staging, target)
    return target
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

export function cachedVersions(root = cacheRoot()) {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => VERSION.test(name) && existsSync(join(root, name, '.complete')))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
}

// Either source can fail (GitHub rate-limits anonymous API calls); the kit download
// confirms whichever version is chosen against the release tag.
export async function latestVersions() {
  const [release, npm] = await Promise.allSettled([
    get(RELEASE_URL).then((r) => r.json()).then((j) => normaliseVersion(j.tag_name)),
    get(NPM_URL).then((r) => r.json()).then((j) => normaliseVersion(j.version)),
  ])
  return {
    release: release.status === 'fulfilled' ? release.value : null,
    npm: npm.status === 'fulfilled' ? npm.value : null,
    errors: [release, npm].filter((r) => r.status === 'rejected').map((r) => r.reason.message),
  }
}

export function installedVersion(cwd = process.cwd()) {
  const path = join(cwd, 'node_modules', 'nsw-design-system', 'package.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).version : null
}

// Pages load the release from jsDelivr, which serves npm, while the kit comes from the
// GitHub release tag, so the default must be a version both have published.
export async function resolveVersion(requested) {
  if (requested) return normaliseVersion(requested)
  const latest = await latestVersions()
  if (latest.release && latest.npm && latest.release !== latest.npm) {
    throw new Error(`the latest GitHub release (v${latest.release}) and npm (v${latest.npm}) differ; `
      + 'confirm which to use and pass it with --version')
  }
  if (latest.release) return latest.release
  if (latest.npm) {
    console.error(`warning: GitHub release lookup failed (${latest.errors.join('; ')}); using npm latest v${latest.npm}`)
    return latest.npm
  }
  const cached = cachedVersions()[0]
  if (!cached) throw new Error(`could not find the latest release: ${latest.errors.join('; ')}`)
  console.error(`warning: could not look up the latest release (${latest.errors.join('; ')}); using cached v${cached}`)
  return cached
}

export async function ensureKit(version, root = cacheRoot()) {
  const target = join(root, version)
  if (existsSync(join(target, '.complete'))) return target
  console.error(`Downloading the NSW Design System v${version} starter kit (about 50 MB, once per version)…`)
  const buffer = await readCapped(await get(kitUrl(version)), KIT_LIMITS.download, `The v${version} starter kit`)
  return extractKit(buffer, version, root)
}

const decode = (text) => text
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“')
  .replace(/&rdquo;/g, '”').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&amp;/g, '&')
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textOf = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

const titleOf = (html, fallback) => textOf(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? fallback)

// A component or core style by name (card, grid), or a docs page by section/name (utilities/spacing).
function page(kit, name) {
  const clean = String(name).replace(/^\/+|\/+$/g, '').replace(/(\/index)?\.html$/, '')
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(clean)) throw new Error(`Not a page name from the list command: ${name}`)
  const paths = clean.includes('/')
    ? [join(kit, 'docs', 'content', `${clean}.html`)]
    : ['components', 'core'].map((group) => join(kit, group, clean, 'index.html'))
  const path = paths.find((p) => existsSync(p))
  if (!path) throw new Error(`No page called "${clean}". Run the list command.`)
  return readFileSync(path, 'utf8')
}

export function listKit(kit) {
  const titled = (group) => readdirSync(join(kit, group), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(kit, group, d.name, 'index.html')))
    .map((d) => ({ name: d.name, title: titleOf(readFileSync(join(kit, group, d.name, 'index.html'), 'utf8'), d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const guides = []
  const docs = join(kit, 'docs', 'content')
  if (existsSync(docs)) {
    for (const section of readdirSync(docs, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const file of readdirSync(join(docs, section.name)).filter((f) => f.endsWith('.html'))) {
        const name = `${section.name}/${file.replace(/\.html$/, '')}`
        guides.push({ name, title: titleOf(readFileSync(join(docs, section.name, file), 'utf8'), name) })
      }
    }
  }
  const templates = []
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, d.name)
      if (d.isDirectory()) walk(path)
      else if (d.name.endsWith('.html')) {
        const name = relative(join(kit, 'templates'), path).split(sep).join('/').replace(/\.html$/, '')
        if (name === 'index') continue
        const title = textOf(readFileSync(path, 'utf8').match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? name).replace(/\s*\|\s*NSW Design System$/, '')
        templates.push({ name, title })
      }
    }
  }
  walk(join(kit, 'templates'))
  const byName = (a, b) => a.name.localeCompare(b.name)
  return { components: titled('components'), core: titled('core'), guides: guides.sort(byName), templates: templates.sort(byName) }
}

// Usage guidance as plain Markdown-like text.
export function guidanceOf(html) {
  const start = html.search(/<section id="section-guidance"/)
  let block
  if (start >= 0) {
    const next = html.slice(start + 1).search(/<section id="section-/)
    block = next >= 0 ? html.slice(start, start + 1 + next) : html.slice(start)
  } else {
    block = html.match(/<div class="nsw-docs__main[\s\S]*?(?=<footer)/)?.[0] ?? ''
  }
  block = block.replace(/<(script|style|pre|template)\b[\s\S]*?<\/\1>/g, '')
  const lines = []
  const pattern = /<(h[1-6]|p|li|dt|dd|td|th)\b[^>]*>([\s\S]*?)<\/\1>/g
  for (const [, tag, inner] of block.matchAll(pattern)) {
    const text = textOf(inner)
    if (!text) continue
    if (tag[0] === 'h') lines.push('', `${'#'.repeat(Number(tag[1]))} ${text}`, '')
    else if (tag === 'li') lines.push(`- ${text}`)
    else lines.push(text, '')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Every code example on a docs page, labelled by the headings above it within its tab.
export function examplesOf(html) {
  const headings = [...html.matchAll(/<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/g)]
    .map((m) => ({ level: Number(m[1]), text: textOf(m[2]), index: m.index }))
  const sections = [...html.matchAll(/<section id="section-/g)].map((m) => m.index)
  const examples = []
  const code = /<code class="(html|css|scss)"><script>document\.write\(\(`([\s\S]*?)`\)\.replace/g
  for (const match of html.matchAll(code)) {
    const sectionStart = sections.filter((s) => s < match.index).pop() ?? -1
    const trail = []
    for (const h of headings) {
      if (h.index > match.index) break
      if (h.index < sectionStart) continue
      trail.length = h.level - 2
      trail[h.level - 2] = h.text
    }
    const markup = match[2].replace(/\\([`$\\])/g, '$1').trim()
    examples.push({ heading: trail.filter(Boolean).join(' › ') || 'Example', language: match[1], markup })
  }
  return examples
}

// A template page with the docs-site chrome replaced by the published release assets.
export function standaloneTemplate(html, version) {
  const htmlTag = html.match(/<html\b[^>]*>/)?.[0] ?? '<html lang="en">'
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/)?.[1] ?? ''
  const title = textOf(head.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s*\|\s*NSW Design System$/, '')
  const fonts = [...head.matchAll(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/[^"]*"[^>]*>/g)].map((m) => m[0])
  let body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/)?.[1]
  if (body === undefined) throw new Error('Template has no <body>')
  body = body
    .replace(/<script\b[^>]*\bsrc=["']\/js\/main\.js["'][^>]*>\s*<\/script>/g, '')
    .replace(/<script>\s*window\.NSW\.initSite\(\);?\s*<\/script>/g, '')
  const warnings = []
  for (const m of body.matchAll(/<script\b[^>]*>/g)) warnings.push(`template keeps a demonstration script: ${m[0]}`)
  if (/\bnsw-docs/.test(body)) warnings.push('template contains docs-site-only nsw-docs classes; remove them')
  const out = `<!doctype html>
${htmlTag}
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts.map((f) => `  ${f}`).join('\n')}
  <link rel="stylesheet" href="${cdn(version, 'css/main.css')}">
</head>
<body>
${body.trim()}
<script src="${cdn(version, 'js/main.js')}"></script>
<script>window.NSW.initSite()</script>
</body>
</html>
`
  return { html: out, warnings }
}

export function cssClasses(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '').replace(/"[^"]*"|'[^']*'/g, '')
  return new Set([...stripped.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((m) => m[1]))
}

// A small tokenizer that follows the HTML tokenizer's states for what the checker reads:
// data, start and end tags, attribute names and values (a quote starts a value only after
// "="), comments (ended by "-->" or "--!>", with "<!-->" and "<!--->" empty), bogus
// comments and doctypes ("<!", "<?", "</" not followed by a letter, ended by ">"), and
// raw-text elements whose text is never read as markup. Attribute values have character
// references decoded, as a browser does before using them. Attribute names are lower-cased
// and the first occurrence of a repeated attribute wins. Raw-text elements carry their text
// as `content`.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes'])
const SPACE = /[\t\n\f\r ]/
// Named references that produce ASCII characters, which are the ones that can change how an
// address or a script is read, plus the common ones used in text.
const NAMED = {
  Tab: '\t', NewLine: '\n', excl: '!', quot: '"', QUOT: '"', num: '#', dollar: '$', percnt: '%', amp: '&', AMP: '&',
  apos: "'", lpar: '(', rpar: ')', ast: '*', midast: '*', plus: '+', comma: ',', period: '.', sol: '/', colon: ':',
  semi: ';', lt: '<', LT: '<', equals: '=', gt: '>', GT: '>', quest: '?', commat: '@', lsqb: '[', lbrack: '[',
  bsol: '\\', rsqb: ']', rbrack: ']', Hat: '^', lowbar: '_', UnderBar: '_', grave: '`', DiacriticalGrave: '`',
  lcub: '{', lbrace: '{', verbar: '|', vert: '|', VerticalLine: '|', rcub: '}', rbrace: '}', nbsp: ' ',
}
const LEGACY = new Set(['amp', 'AMP', 'lt', 'LT', 'gt', 'GT', 'quot', 'QUOT', 'nbsp'])
// Decodes references in an attribute value. As in a browser, a legacy name without ";" is
// left alone when "=" or a letter or digit follows it (so "?a=1&lt=2" keeps "&lt").
export const decodeReferences = (value) => value.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));?/g,
  (match, dec, hex, name, offset) => {
    if (dec !== undefined || hex !== undefined) {
      const code = parseInt(dec ?? hex, dec !== undefined ? 10 : 16)
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '�'
    }
    if (!Object.prototype.hasOwnProperty.call(NAMED, name)) return match
    if (match.endsWith(';')) return NAMED[name]
    return LEGACY.has(name) && !/[=A-Za-z0-9]/.test(value[offset + match.length] ?? '') ? NAMED[name] : match
  })

// Reads a start or end tag beginning at "<" (at) whose name starts at `from`. Returns null
// if the document ends inside the tag, as a browser then drops it.
function readTag(html, at, from) {
  let i = from
  while (i < html.length && !SPACE.test(html[i]) && html[i] !== '/' && html[i] !== '>') i++
  const name = html.slice(from, i).toLowerCase()
  const attrs = new Map()
  for (;;) {
    let slash = false
    while (i < html.length && (SPACE.test(html[i]) || html[i] === '/')) slash = html[i++] === '/'
    if (i >= html.length) return null
    if (html[i] === '>') return { name, attrs, index: at, end: i + 1, selfClosing: slash }
    const nameStart = i
    i++ // the first character belongs to the name, even "="
    while (i < html.length && !SPACE.test(html[i]) && !'/>='.includes(html[i])) i++
    const attr = html.slice(nameStart, i).toLowerCase()
    while (i < html.length && SPACE.test(html[i])) i++
    let value = ''
    if (html[i] === '=') {
      i++
      while (i < html.length && SPACE.test(html[i])) i++
      if (html[i] === '"' || html[i] === "'") {
        const close = html.indexOf(html[i], i + 1)
        if (close < 0) return null
        value = html.slice(i + 1, close)
        i = close + 1
      } else {
        const valueStart = i
        while (i < html.length && !SPACE.test(html[i]) && html[i] !== '>') i++
        value = html.slice(valueStart, i)
      }
    }
    if (!attrs.has(attr)) attrs.set(attr, decodeReferences(value))
  }
}

// Inside SVG and MathML (foreign content) a browser does not switch to raw text, so the
// contents of title, iframe, textarea and the like are markup there. Their text is still
// captured (a style's CSS is checked), but the contents are read as tags too.
const FOREIGN = new Set(['svg', 'math'])
export function openTags(html) {
  const tags = []
  let foreign = 0
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) break
    const next = html[lt + 1] ?? ''
    if (html.startsWith('<!--', lt)) {
      if (html.startsWith('<!-->', lt)) { i = lt + 5; continue }
      if (html.startsWith('<!--->', lt)) { i = lt + 6; continue }
      const close = /--!?>/g
      close.lastIndex = lt + 4
      const m = close.exec(html)
      i = m ? m.index + m[0].length : html.length
      continue
    }
    if (next === '!' || next === '?' || (next === '/' && !/[A-Za-z>]/.test(html[lt + 2] ?? ''))) {
      // Doctype or bogus comment: ends at the next ">".
      const close = html.indexOf('>', lt + 2)
      i = close < 0 ? html.length : close + 1
      continue
    }
    if (next === '/') {
      if (html[lt + 2] === '>') { i = lt + 3; continue }
      const tag = readTag(html, lt, lt + 2) // an end tag: its attributes are read, then ignored
      if (tag && FOREIGN.has(tag.name) && foreign > 0) foreign--
      i = tag ? tag.end : html.length
      continue
    }
    if (!/[A-Za-z]/.test(next)) { i = lt + 1; continue }
    const tag = readTag(html, lt, lt + 1)
    if (!tag) break
    tags.push(tag)
    i = tag.end
    if (FOREIGN.has(tag.name) && !tag.selfClosing) foreign++
    if (RAW_TEXT.has(tag.name)) {
      const close = html.slice(i).search(new RegExp(`</${tag.name}[\\t\\n\\f\\r />]`, 'i'))
      tag.content = close < 0 ? html.slice(i) : html.slice(i, i + close)
      if (!foreign) i += tag.content.length
    }
  }
  return tags
}
// Old presentational attributes restyle a page without CSS. Some apply to any element;
// others only to the elements named.
const PRESENTATIONAL = ['align', 'background', 'bgcolor', 'bordercolor', 'cellpadding', 'cellspacing', 'clear', 'compact',
  'frameborder', 'hspace', 'marginheight', 'marginwidth', 'noshade', 'nowrap', 'valign', 'vspace']
const PRESENTATIONAL_ON = {
  font: ['color', 'face', 'size'], basefont: ['color', 'face', 'size'], hr: ['color', 'size'],
  body: ['text', 'link', 'vlink', 'alink'], table: ['border', 'frame', 'rules'], img: ['border'], object: ['border'],
}
const isJavascript = (value) => /^javascript:/i.test(value.replace(/[\u0000-\u0020]/g, ''))
const isPresentational = (tag, attr) => PRESENTATIONAL.includes(attr) || (PRESENTATIONAL_ON[tag] ?? []).includes(attr)
// Script types a browser runs as classic scripts (type="module" is handled separately).
const RUNNABLE_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'application/ecmascript',
  'application/x-ecmascript', 'application/x-javascript', 'text/ecmascript', 'text/javascript1.0',
  'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5',
  'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript'])
const classesOf = (tag) => (tag.attrs.get('class') ?? '').split(/\s+/).filter(Boolean)
export const styleKey = (value) => value.replace(/url\([^)]*\)/g, 'url()').replace(/\s+/g, ' ')
  .replace(/\s*([:;,])\s*/g, '$1').replace(/;+$/, '').trim()

// Theming is done by overriding the design system's --nsw-* CSS variables, nothing else.
export function themeOnly(css) {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = [...body.matchAll(/\{([^{}]*)\}/g)]
  // Anything left after removing complete blocks must not open or close a rule: a browser
  // closes an unfinished rule at the end of the stylesheet, so a stray "{" would apply.
  if (!blocks.length || /@/.test(body) || /[{}]/.test(body.replace(/\{[^{}]*\}/g, ''))) return false
  return blocks.every((b) => b[1].split(';').map((d) => d.trim()).filter(Boolean).every((d) => /^--nsw-[a-z0-9-]+\s*:/.test(d)))
}

// An approval names an exact https:// file, everything under an https:// path ending in
// "/", or a path on the page's own site starting with "/" or "./". Matching is on the
// parsed origin and path, never a substring, so a lookalike host is not approved. An exact
// approval also compares the query string; fragments are ignored, as browsers never send them.
export function parseApproval(pattern) {
  const value = String(pattern).trim()
  if (/^https:\/\//i.test(value)) {
    // Prefix matching needs a "/" the user wrote; URL() adds one to a bare origin.
    const written = value.replace(/^https:\/\/[^/?#]*/i, '').split(/[?#]/)[0]
    if (!written) {
      throw new Error(`approval "${value}" names a whole site; add a trailing / to approve everything on it, or give a file's address`)
    }
    return { ...locate(value), prefix: written.endsWith('/') }
  }
  if (/^\.{0,2}\//.test(value) && !value.startsWith('//')) {
    const place = locate(value)
    if (!place || !['root', 'document'].includes(place.scope)) throw new Error(`approval "${value}" is not a path on your site`)
    return { ...place, prefix: value.split(/[?#]/)[0].endsWith('/') }
  }
  throw new Error(`approval "${value}" must be an https:// address or a path starting with / or ./`)
}

// Resolves an address the way a browser does: surrounding whitespace, backslashes, tabs
// and "." or ".." segments (including percent-encoded ones) are all handled by URL(). It
// is resolved against two different page locations. If the result leaves the placeholder
// host, the address names another site (for example "\\host/x" or " //host/x"); if both
// results agree, the address is root-relative; otherwise it is relative to the page.
const PLACEHOLDER = 'https://relative.invalid'
const PAGE_A = `${PLACEHOLDER}/a/a/a/a/a/a/a/a/`
const PAGE_B = `${PLACEHOLDER}/b/b/b/b/b/b/b/b/`
function locate(url) {
  const clean = String(url).split('#')[0]
  let a
  let b
  try {
    a = new URL(clean, PAGE_A)
    b = new URL(clean, PAGE_B)
  } catch {
    return null
  }
  if (a.origin !== PLACEHOLDER) return a.protocol === 'https:' ? { scope: a.origin, path: a.pathname, search: a.search } : null
  return { scope: a.pathname === b.pathname ? 'root' : 'document', path: a.pathname, search: a.search }
}

export function approved(url, approvals) {
  const place = locate(url)
  if (!place) return false
  return approvals.some((a) => a.scope === place.scope
    && (a.prefix ? place.path.startsWith(a.path) : place.path === a.path && place.search === a.search))
}

// Class names, inline style values and Google Fonts links the release's components, core
// styles and guides use. They depend only on the release, so they are cached beside it.
// The cache name includes a hash of this script, so a change to how rules are built (or to
// the tokenizer) never reuses rules built by older code.
const RULES_CACHE = `.rules-${createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16)}.json`
export function loadRules(kit) {
  const cache = join(kit, RULES_CACHE)
  try {
    const saved = JSON.parse(readFileSync(cache, 'utf8'))
    return {
      classes: new Set(saved.classes), styles: new Set(saved.styles), fonts: new Set(saved.fonts),
      presentational: new Set(saved.presentational),
    }
  } catch {
    // Not cached yet, or unreadable: build the rules.
  }
  const rules = buildRules(kit)
  try {
    for (const old of readdirSync(kit).filter((f) => /^\.rules-.*\.json$/.test(f) && f !== RULES_CACHE)) rmSync(join(kit, old), { force: true })
    writeFileSync(cache, JSON.stringify({
      classes: [...rules.classes], styles: [...rules.styles], fonts: [...rules.fonts], presentational: [...rules.presentational],
    }))
  } catch {
    // A read-only cache still works; the rules are rebuilt next time.
  }
  return rules
}

function buildRules(kit) {
  const classes = cssClasses(readFileSync(join(kit, 'css', 'main.css'), 'utf8'))
  const styles = new Set()
  const fonts = new Set()
  const presentational = new Set()
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, d.name)
      if (d.isDirectory()) walk(path)
      else if (d.name.endsWith('.html')) {
        const html = readFileSync(path, 'utf8')
        // The live examples on each page and the markup shown in its code samples.
        const markup = [html, ...examplesOf(html).filter((e) => e.language === 'html').map((e) => e.markup)]
        for (const tag of markup.flatMap(openTags)) {
          const href = tag.attrs.get('href')
          if (tag.name === 'link' && href?.startsWith('https://fonts.googleapis.com/')) fonts.add(href)
          for (const name of classesOf(tag)) if (!name.startsWith('nsw-docs') && !name.startsWith('hljs')) classes.add(name)
          if (tag.attrs.has('style')) styles.add(styleKey(tag.attrs.get('style')))
          for (const attr of tag.attrs.keys()) if (isPresentational(tag.name, attr)) presentational.add(`${tag.name} ${attr}`)
        }
      }
    }
  }
  // Page templates are not a source: some are demonstrations whose classes only work with
  // their own custom CSS.
  for (const group of ['components', 'core', join('docs', 'content')]) walk(join(kit, group))
  return { classes, styles, fonts, presentational }
}

// Flags anything on a page that does not come from the design system release.
// designSystemCss/designSystemJs name a compiled design system bundle (an npm and Sass
// build); allowStylesheets/allowScripts name approved third-party assets, which are
// accepted but never count as the design system itself. Inline scripts other than the
// initSite call fail unless their content contains an allowInlineScripts entry.
export function checkPage(html, {
  version, classes, styles = new Set(), fonts = new Set(), presentational = new Set(),
  designSystemCss = [], designSystemJs = [], designSystemBundle = [], allowStylesheets = [], allowScripts = [],
  allowInlineScripts = [],
}) {
  const issues = []
  const newlines = []
  for (let i = html.indexOf('\n'); i >= 0; i = html.indexOf('\n', i + 1)) newlines.push(i)
  const lineOf = (index) => {
    let low = 0
    let high = newlines.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (newlines[mid] < index) low = mid + 1
      else high = mid
    }
    return low + 1
  }
  const add = (level, index, message) => issues.push({ level, line: lineOf(index), message })
  // Blank patterns would approve everything, so they are ignored.
  const nonBlank = (patterns) => patterns.filter((p) => typeof p === 'string' && p.trim() !== '')
  const approvals = (patterns) => nonBlank(patterns).map(parseApproval)
  const [dsCss, dsJs, dsBundle, otherCss, otherJs] = [designSystemCss, designSystemJs, designSystemBundle, allowStylesheets,
    allowScripts].map(approvals)
  const inlineApproved = (content) => nonBlank(allowInlineScripts).some((p) => content.includes(p))
  const dsAsset = (url, kind) => {
    const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/nsw-design-system@([^/]+)\/dist\/(css|js)\/([a-z.]+)$/)
    if (!m || m[2] !== kind) return null
    return { version: m[1], file: m[3] }
  }
  const pinned = (index, asset) => {
    if (asset.version !== version) add('error', index, `design system asset pinned to @${asset.version}; use the exact release @${version}`)
  }
  // Returns true for the release's own file or a designated design system bundle, false for
  // an approved extra, and reports anything else.
  const stylesheetSource = (tag, href) => {
    const asset = dsAsset(href, 'css')
    if (asset && ['main.css', 'core.css'].includes(asset.file)) { pinned(tag.index, asset); return true }
    if (href && approved(href, dsCss)) return true
    if (fonts.has(href) || (href && approved(href, otherCss))) return false
    add('error', tag.index, `stylesheet not from the design system release: ${href || '(no href)'}`)
    return false
  }
  // Returns 'main' for the release's main.js or a copy of it, 'bundle' for a self-initialising
  // bundle, false for an approved extra, and reports anything else.
  const scriptSource = (tag, src) => {
    const asset = dsAsset(src, 'js')
    if (asset && ['main.js', 'main.min.js'].includes(asset.file)) { pinned(tag.index, asset); return 'main' }
    if (src && approved(src, dsJs)) return 'main'
    if (src && approved(src, dsBundle)) return 'bundle'
    if (src && approved(src, otherJs)) return false
    add('error', tag.index, `script not from the design system release: ${src || '(empty src)'}`)
    return false
  }
  const tags = openTags(html)
  for (const tag of tags) {
    for (const [name, value] of tag.attrs) {
      if (name.startsWith('on') && !inlineApproved(value)) {
        add('error', tag.index, `${name} attribute: inline script not from the design system release; use a design system component, or pass --allow-inline-script if the user approved it`)
      }
      if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name) && isJavascript(value) && !inlineApproved(value)) {
        add('error', tag.index, `javascript: address in ${name}: inline script not from the design system release`)
      }
    }
    // SVG animation can set a link's address: <animate attributeName="href" values="javascript:…">.
    if (['animate', 'set'].includes(tag.name) && ['href', 'xlink:href'].includes((tag.attrs.get('attributename') ?? '').trim().toLowerCase())) {
      for (const name of ['values', 'to', 'from', 'by']) {
        const value = tag.attrs.get(name) ?? ''
        if (value.split(';').some(isJavascript) && !inlineApproved(value)) {
          add('error', tag.index, `javascript: address in <${tag.name}> ${name}: inline script not from the design system release`)
        }
      }
    }
  }
  for (const tag of tags.filter((t) => t.name === 'base' && t.attrs.has('href'))) {
    add('error', tag.index, '<base href> element: it changes where every relative address loads from; remove it')
  }
  for (const tag of tags.filter((t) => t.name === 'iframe' && t.attrs.has('srcdoc'))) {
    if (!inlineApproved(tag.attrs.get('srcdoc'))) {
      add('error', tag.index, 'iframe srcdoc: it runs its own HTML and scripts in this page\'s origin; pass --allow-inline-script if the user approved it')
    }
  }
  for (const tag of tags.filter((t) => t.name === 'object' || t.name === 'embed')) {
    const url = tag.attrs.get(tag.name === 'object' ? 'data' : 'src') ?? ''
    if (!url || !approved(url, otherJs)) {
      add('error', tag.index, `<${tag.name}> loads content that is not from the design system release: ${url || '(no address)'}; pass --allow-script if the user approved it`)
    }
  }
  for (const tag of tags.filter((t) => t.name === 'style')) {
    if (!themeOnly(tag.content)) add('error', tag.index, '<style> element: custom CSS is not allowed; only --nsw-* theming variables may be set')
  }
  for (const tag of tags) {
    for (const attr of tag.attrs.keys()) {
      if (isPresentational(tag.name, attr) && !presentational.has(`${tag.name} ${attr}`)) {
        add('error', tag.index, `${attr} attribute on <${tag.name}>: presentational styling is not allowed; use design system classes`)
      }
    }
  }
  for (const tag of tags.filter((t) => t.attrs.has('style'))) {
    const value = tag.attrs.get('style')
    if (!styles.has(styleKey(value)) && !themeOnly(`x{${value}}`)) add('error', tag.index, `style attribute "${value}" is not used by the design system; use design system classes`)
  }
  let stylesheet = false
  for (const tag of tags.filter((t) => t.name === 'link')) {
    const rel = (tag.attrs.get('rel') ?? '').toLowerCase().split(/\s+/)
    const href = tag.attrs.get('href') ?? ''
    const as = (tag.attrs.get('as') ?? '').toLowerCase()
    if (rel.includes('stylesheet')) stylesheet = stylesheetSource(tag, href) || stylesheet
    else if (rel.some((r) => ['preload', 'prefetch'].includes(r)) && as === 'style') stylesheetSource(tag, href)
    else if (rel.includes('modulepreload') || (rel.some((r) => ['preload', 'prefetch'].includes(r)) && as === 'script')) scriptSource(tag, href)
  }
  if (!stylesheet) add('error', 0, `no design system stylesheet; link ${cdn(version, 'css/main.css')} or pass --design-system-css for your compiled design system bundle`)
  // The release's main.js, or a copy named with --design-system-js, needs an inline
  // window.NSW.initSite() after it. A bundle named with --design-system-bundle (a framework
  // build) calls initSite itself and may load as a module.
  let plain = false
  let bundle = false
  let ready = false
  let init = false
  let initTooEarly = null
  for (const tag of tags.filter((t) => t.name === 'script')) {
    // An SVG script names its file with href or xlink:href.
    const src = tag.attrs.get('src') ?? tag.attrs.get('href') ?? tag.attrs.get('xlink:href')
    const type = (tag.attrs.get('type') ?? '').trim().toLowerCase()
    const runs = RUNNABLE_TYPES.has(type) || type === 'module'
    if (src !== undefined) {
      const kind = scriptSource(tag, src)
      if (!kind) continue
      if (!runs) {
        add('error', tag.index, `design system JavaScript has type="${type}", so the browser never runs it`)
        continue
      }
      const deferred = tag.attrs.has('defer') || tag.attrs.has('async') || type === 'module'
      if (kind === 'bundle') {
        bundle = true
      } else {
        plain = true
        if (deferred) add('error', tag.index, 'design system JavaScript must load without defer, async or type="module", or window.NSW.initSite() runs before it')
      }
      if (!deferred) ready = true
    } else if (!runs) {
      continue // data blocks such as JSON-LD structured data never run
    } else if (/^\s*window\.NSW\.initSite\(\);?\s*$/.test(tag.content)) {
      init = true
      if (!ready && initTooEarly === null) initTooEarly = tag.index
    } else if (tag.content.trim() && !inlineApproved(tag.content)) {
      add('error', tag.index, 'inline script not from the design system release; use a design system component, or pass --allow-inline-script if the user approved it')
    }
  }
  const script = plain || bundle
  const hooks = tags.some((t) => classesOf(t).some((name) => name.startsWith('js-')))
  if (plain && !bundle && !init) add('error', 0, 'design system JavaScript is loaded but window.NSW.initSite() is never called')
  if (script && initTooEarly !== null) add('error', initTooEarly, 'window.NSW.initSite() runs before the design system JavaScript is loaded; call it after the script')
  if (!script && init) add('error', 0, 'window.NSW.initSite() is called but the design system JavaScript is not loaded')
  if (!script && hooks) add('error', 0, 'page uses js- hooks but does not load the design system JavaScript')
  const seen = new Map()
  for (const tag of tags) {
    for (const name of classesOf(tag)) {
      if (name.startsWith('nsw-docs')) add('error', tag.index, `${name} is a docs-site class, not part of the design system`)
      else if (!classes.has(name) && !seen.has(name)) seen.set(name, tag.index)
    }
  }
  for (const [name, index] of seen) add('error', index, `class "${name}" is not defined by NSW Design System v${version}`)
  return issues.sort((a, b) => a.line - b.line)
}

function parseArgs(argv) {
  const options = {
    positional: [], designSystemCss: [], designSystemJs: [], designSystemBundle: [], allowStylesheets: [], allowScripts: [],
    allowInlineScripts: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      if (i + 1 >= argv.length || !argv[i + 1].trim()) throw new Error(`${arg} needs a non-empty value`)
      return argv[++i]
    }
    const url = () => {
      const approval = value()
      parseApproval(approval)
      return approval
    }
    if (arg === '--version') options.version = value()
    else if (arg === '--out') options.out = value()
    else if (arg === '--force') options.force = true
    else if (arg === '--design-system-css') options.designSystemCss.push(url())
    else if (arg === '--design-system-js') options.designSystemJs.push(url())
    else if (arg === '--design-system-bundle') options.designSystemBundle.push(url())
    else if (arg === '--allow-stylesheet') options.allowStylesheets.push(url())
    else if (arg === '--allow-script') options.allowScripts.push(url())
    else if (arg === '--allow-inline-script') options.allowInlineScripts.push(value())
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`)
    else options.positional.push(arg)
  }
  return options
}

const USAGE = `Usage: node nswds.mjs <command> [options]

  version                        latest release, npm latest, this project's installed version and cached kits
  fetch                          download and cache the release kit; prints its directory
  list                           components, core styles, guides, utilities and page templates in the release
  guidance <name>                guidance text for a component (card), core style (grid) or guide (utilities/spacing)
  examples <name>                every code example on that page, as rendered HTML, CSS or SCSS
  template <name> [--out file]   a page template wired to the release CSS and JS (e.g. content/article)
  check <file.html>...           fail on anything not from the design system release

Options:
  --version <x.y.z>              use this release instead of the latest
  --design-system-css <url>      your compiled design system stylesheet (npm and Sass build)
  --design-system-js <url>       your copy of the release main.js (followed by window.NSW.initSite())
  --design-system-bundle <url>   a build that bundles the design system and calls initSite itself
  --allow-stylesheet <url>       an approved third-party stylesheet
  --allow-script <url>           an approved third-party script
                                 <url> is an exact https:// address (query included), an https:// path ending in / for
                                 everything under it, or a path on your site starting with / or ./
  --allow-inline-script <text>   accept an approved inline script whose content contains <text>
  --force                        let template overwrite --out`

async function main(argv) {
  const options = parseArgs(argv)
  const [command, ...args] = options.positional
  if (!command || command === 'help') return console.log(USAGE)
  if (command === 'version') {
    const cached = cachedVersions()
    const latest = await latestVersions()
    console.log(`Latest release (GitHub ${REPO}): ${latest.release ?? 'unavailable'}`)
    console.log(`npm latest (nsw-design-system): ${latest.npm ?? 'unavailable'}`)
    for (const error of latest.errors) console.log(`warning: ${error}${/api\.github\.com.*HTTP 403/.test(error) ? ' (rate limited; set GITHUB_TOKEN or GH_TOKEN)' : ''}`)
    if (latest.release && latest.npm && latest.npm !== latest.release) console.log('warning: npm and the GitHub release disagree; confirm which to use before building')
    console.log(`Installed in this project: ${installedVersion() ?? 'not installed'}`)
    console.log(`Cached kits: ${cached.length ? cached.join(', ') : 'none'} (${cacheRoot()})`)
    return
  }
  const version = await resolveVersion(options.version)
  const kit = await ensureKit(version)
  if (command === 'fetch') return console.log(kit)
  if (command === 'list') {
    const { components, core, guides, templates } = listKit(kit)
    console.log(`NSW Design System v${version}\n\nComponents (${components.length})`)
    for (const c of components) console.log(`  ${c.name.padEnd(22)} ${c.title}`)
    console.log(`\nCore styles (${core.length})`)
    for (const c of core) console.log(`  ${c.name.padEnd(22)} ${c.title}`)
    console.log(`\nGuides and utilities (${guides.length})`)
    for (const g of guides) console.log(`  ${g.name.padEnd(40)} ${g.title}`)
    console.log(`\nPage templates (${templates.length})`)
    for (const t of templates) console.log(`  ${t.name.padEnd(40)} ${t.title}`)
    return
  }
  if (command === 'guidance' || command === 'examples') {
    if (!args[0]) throw new Error(`${command} needs a name from the list command`)
    const html = page(kit, args[0])
    console.log(`<!-- NSW Design System v${version}: ${args[0]} -->\n`)
    if (command === 'guidance') return console.log(guidanceOf(html) || 'No guidance text on this page.')
    const examples = examplesOf(html)
    if (!examples.length) return console.log('No code examples on this page.')
    for (const e of examples) console.log(`## ${e.heading}\n\n\`\`\`${e.language}\n${e.markup}\n\`\`\`\n`)
    return
  }
  if (command === 'template') {
    const name = String(args[0] ?? '').replace(/^templates\//, '').replace(/\.html$/, '')
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(name)) throw new Error('template needs a name from the list command, e.g. content/article')
    const path = join(kit, 'templates', `${name}.html`)
    if (!existsSync(path)) throw new Error(`No template called "${name}". Run the list command.`)
    const { html, warnings } = standaloneTemplate(readFileSync(path, 'utf8'), version)
    for (const w of warnings) console.error(`warning: ${w}`)
    const issues = checkPage(html, { version, ...loadRules(kit) }).filter((i) => i.level === 'error')
    if (issues.length) {
      console.error(`warning: this template is a demonstration with ${issues.length} thing(s) that are not design system; remove or replace them, or pick another template:`)
      for (const i of issues) console.error(`  line ${i.line}: ${i.message}`)
    }
    if (!options.out) return process.stdout.write(html)
    if (existsSync(options.out) && !options.force) throw new Error(`${options.out} exists; pass --force to overwrite`)
    mkdirSync(dirname(resolve(options.out)), { recursive: true })
    writeFileSync(options.out, html)
    return console.log(`Wrote ${options.out} from template ${name} (v${version})`)
  }
  if (command === 'check') {
    if (!args.length) throw new Error('check needs at least one HTML file')
    const rules = loadRules(kit)
    let errors = 0
    for (const file of args) {
      const issues = checkPage(readFileSync(file, 'utf8'), {
        version, ...rules,
        designSystemCss: options.designSystemCss, designSystemJs: options.designSystemJs,
        designSystemBundle: options.designSystemBundle,
        allowStylesheets: options.allowStylesheets, allowScripts: options.allowScripts,
        allowInlineScripts: options.allowInlineScripts,
      })
      for (const issue of issues) console.log(`${file}:${issue.line}: ${issue.level}: ${issue.message}`)
      errors += issues.filter((i) => i.level === 'error').length
      if (!issues.length) console.log(`${file}: uses only NSW Design System v${version}`)
    }
    if (errors) {
      console.log(`\n${errors} error(s)`)
      process.exitCode = 1
    }
    return
  }
  throw new Error(`Unknown command "${command}"\n\n${USAGE}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`error: ${error.message}`)
    process.exitCode = 1
  })
}
