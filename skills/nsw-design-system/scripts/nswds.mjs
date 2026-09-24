#!/usr/bin/env node
// Reads the NSW Design System from its published release so pages are built from
// the design system itself, never from memory. The HTML starter kit committed at
// each release tag of digitalnsw/nsw-design-system is the built documentation site
// for that release: rendered component examples, page templates and the release CSS.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
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

// Opening tags, read so that a ">" inside a quoted attribute value does not end the tag.
// Attribute names are case-insensitive and values may be double-quoted, single-quoted or
// unquoted; the first occurrence of a repeated attribute wins, as in a browser.
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTRIBUTE = /([^\s"'=<>/\x60]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+)))?/g
export function openTags(html) {
  return [...html.matchAll(OPEN_TAG)].map((m) => {
    const attrs = new Map()
    for (const a of m[2].matchAll(ATTRIBUTE)) {
      const name = a[1].toLowerCase()
      if (!attrs.has(name)) attrs.set(name, a[2] ?? a[3] ?? a[4] ?? '')
    }
    return { name: m[1].toLowerCase(), attrs, index: m.index, end: m.index + m[0].length }
  })
}
const classesOf = (tag) => (tag.attrs.get('class') ?? '').split(/\s+/).filter(Boolean)
// The text of a raw-text element (script, style) that starts after an opening tag.
const contentAfter = (html, tag) => {
  const rest = html.slice(tag.end)
  const close = rest.search(new RegExp(`</${tag.name}\\s*>`, 'i'))
  return close < 0 ? rest : rest.slice(0, close)
}
// Blank out comments, keeping line breaks so reported line numbers stay right.
const withoutComments = (html) => html.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => c.replace(/[^\n]/g, ' '))
export const styleKey = (value) => value.replace(/url\([^)]*\)/g, 'url()').replace(/\s+/g, ' ')
  .replace(/\s*([:;,])\s*/g, '$1').replace(/;+$/, '').trim()

// Theming is done by overriding the design system's --nsw-* CSS variables, nothing else.
export function themeOnly(css) {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = [...body.matchAll(/\{([^{}]*)\}/g)]
  if (!blocks.length || /@/.test(body) || body.replace(/\{[^{}]*\}/g, '').includes('}')) return false
  return blocks.every((b) => b[1].split(';').map((d) => d.trim()).filter(Boolean).every((d) => /^--nsw-[a-z0-9-]+\s*:/.test(d)))
}

const unescapeAmp = (url) => url.replace(/&amp;/g, '&')

// An approval names an exact https:// file, everything under an https:// path ending in
// "/", or a path on the page's own site starting with "/" or "./". Matching is on the
// parsed origin and path, never a substring, so a lookalike host is not approved.
export function parseApproval(pattern) {
  const value = String(pattern).trim()
  if (/^https:\/\//i.test(value)) {
    const url = new URL(value)
    // Prefix matching needs a "/" the user wrote; URL() adds one to a bare origin.
    const written = value.replace(/^https:\/\/[^/?#]*/i, '').split(/[?#]/)[0]
    if (!written) {
      throw new Error(`approval "${value}" names a whole site; add a trailing / to approve everything on it, or give a file's address`)
    }
    return { origin: url.origin, path: url.pathname, prefix: written.endsWith('/') }
  }
  if (/^\.{0,2}\//.test(value) && !value.startsWith('//')) {
    const written = value.split(/[?#]/)[0]
    return { origin: null, path: relativePath(written), prefix: written.endsWith('/') }
  }
  throw new Error(`approval "${value}" must be an https:// address or a path starting with / or ./`)
}

// Resolves "." and ".." segments (including percent-encoded ones) the way a browser
// does, so "/build/../evil.js" is compared as "/evil.js".
const RELATIVE_BASE = 'https://relative.invalid/page/'
const relativePath = (path) => new URL(path, RELATIVE_BASE).pathname

export function approved(url, approvals) {
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
  let origin = null
  let path
  if (!absolute) {
    try {
      path = relativePath(url.split(/[?#]/)[0])
    } catch {
      return false
    }
  } else {
    try {
      const parsed = new URL(url.startsWith('//') ? `https:${url}` : url)
      if (parsed.protocol !== 'https:') return false
      origin = parsed.origin
      path = parsed.pathname
    } catch {
      return false
    }
  }
  return approvals.some((a) => a.origin === origin && (a.prefix ? path.startsWith(a.path) : path === a.path))
}

// Class names, inline style values and Google Fonts links the release itself uses.
export function loadRules(kit) {
  const classes = cssClasses(readFileSync(join(kit, 'css', 'main.css'), 'utf8'))
  const styles = new Set()
  const fonts = new Set()
  const walk = (dir, collectStyles) => {
    if (!existsSync(dir)) return
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, d.name)
      if (d.isDirectory()) walk(path, collectStyles)
      else if (d.name.endsWith('.html')) {
        for (const tag of openTags(withoutComments(readFileSync(path, 'utf8')))) {
          const href = tag.attrs.get('href')
          if (tag.name === 'link' && href?.startsWith('https://fonts.googleapis.com/')) fonts.add(unescapeAmp(href))
          for (const name of classesOf(tag)) if (!name.startsWith('nsw-docs') && !name.startsWith('hljs')) classes.add(name)
          if (collectStyles && tag.attrs.has('style')) styles.add(styleKey(tag.attrs.get('style')))
        }
      }
    }
  }
  for (const group of ['components', 'core', join('docs', 'content')]) walk(join(kit, group), true)
  walk(join(kit, 'templates'), false)
  return { classes, styles, fonts }
}

// Flags anything on a page that does not come from the design system release.
// designSystemCss/designSystemJs name a compiled design system bundle (an npm and Sass
// build); allowStylesheets/allowScripts name approved third-party assets, which are
// accepted but never count as the design system itself. Inline scripts other than the
// initSite call fail unless their content contains an allowInlineScripts entry.
export function checkPage(source, {
  version, classes, styles = new Set(), fonts = new Set(),
  designSystemCss = [], designSystemJs = [], allowStylesheets = [], allowScripts = [], allowInlineScripts = [],
}) {
  const html = withoutComments(source)
  const issues = []
  const lineOf = (index) => html.slice(0, index).split('\n').length
  const add = (level, index, message) => issues.push({ level, line: lineOf(index), message })
  // Blank patterns would approve everything, so they are ignored.
  const nonBlank = (patterns) => patterns.filter((p) => typeof p === 'string' && p.trim() !== '')
  const approvals = (patterns) => nonBlank(patterns).map(parseApproval)
  const [dsCss, dsJs, otherCss, otherJs] = [designSystemCss, designSystemJs, allowStylesheets, allowScripts].map(approvals)
  const inlineApproved = (content) => nonBlank(allowInlineScripts).some((p) => content.includes(p))
  const dsAsset = (url, kind) => {
    const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/nsw-design-system@([^/]+)\/dist\/(css|js)\/([a-z.]+)$/)
    if (!m || m[2] !== kind) return null
    return { version: m[1], file: m[3] }
  }
  const pinned = (index, asset) => {
    if (asset.version !== version) add('error', index, `design system asset pinned to @${asset.version}; use the exact release @${version}`)
  }
  const tags = openTags(html)
  for (const tag of tags.filter((t) => t.name === 'style')) {
    if (!themeOnly(contentAfter(html, tag))) add('error', tag.index, '<style> element: custom CSS is not allowed; only --nsw-* theming variables may be set')
  }
  for (const tag of tags.filter((t) => t.attrs.has('style'))) {
    const value = tag.attrs.get('style')
    if (!styles.has(styleKey(value)) && !themeOnly(`x{${value}}`)) add('error', tag.index, `style attribute "${value}" is not used by the design system; use design system classes`)
  }
  let stylesheet = false
  for (const tag of tags.filter((t) => t.name === 'link')) {
    if (!(tag.attrs.get('rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) continue
    const href = unescapeAmp(tag.attrs.get('href') ?? '')
    const asset = dsAsset(href, 'css')
    if (asset && ['main.css', 'core.css'].includes(asset.file)) { stylesheet = true; pinned(tag.index, asset) }
    else if (href && approved(href, dsCss)) stylesheet = true
    else if (fonts.has(href)) continue
    else if (href && approved(href, otherCss)) continue
    else add('error', tag.index, `stylesheet not from the design system release: ${href || '(no href)'}`)
  }
  if (!stylesheet) add('error', 0, `no design system stylesheet; link ${cdn(version, 'css/main.css')} or pass --design-system-css for your compiled design system bundle`)
  let script = false
  let init = false
  for (const tag of tags.filter((t) => t.name === 'script')) {
    const src = tag.attrs.get('src')
    const content = contentAfter(html, tag)
    if (src !== undefined) {
      const asset = dsAsset(src, 'js')
      if (asset && ['main.js', 'main.min.js'].includes(asset.file)) { script = true; pinned(tag.index, asset) }
      else if (src && approved(src, dsJs)) script = true
      else if (src && approved(src, otherJs)) continue
      else add('error', tag.index, `script not from the design system release: ${src || '(empty src)'}`)
    } else if (/^\s*window\.NSW\.initSite\(\);?\s*$/.test(content)) {
      init = true
    } else if (content.trim() && !inlineApproved(content)) {
      add('error', tag.index, 'inline script not from the design system release; use a design system component, or pass --allow-inline-script if the user approved it')
    }
  }
  const hooks = tags.some((t) => classesOf(t).some((name) => name.startsWith('js-')))
  if (script && !init) add('error', 0, 'design system JavaScript is loaded but window.NSW.initSite() is never called')
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
  const options = { positional: [], designSystemCss: [], designSystemJs: [], allowStylesheets: [], allowScripts: [], allowInlineScripts: [] }
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
  --design-system-js <url>       your bundled design system JavaScript
  --allow-stylesheet <url>       an approved third-party stylesheet
  --allow-script <url>           an approved third-party script
                                 <url> is an exact https:// address, an https:// path ending in / for
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
