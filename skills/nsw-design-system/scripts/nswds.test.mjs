import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import {
  cachedVersions, checkPage, cssClasses, examplesOf, extractKit, guidanceOf, kitVersion,
  approved, KIT_LIMITS, listKit, loadRules, parseApproval, readCapped, readZip, resolveVersion, standaloneTemplate,
  styleKey, themeOnly,
} from './nswds.mjs'

const script = fileURLToPath(new URL('./nswds.mjs', import.meta.url))

// zlib.crc32 needs Node 20.15 or later; the skill supports Node 18.
function crc32(data) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content, deflate = true] of files) {
    const data = Buffer.from(content)
    const body = deflate ? deflateRawSync(data) : data
    const nameBuffer = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(crc32(data), 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuffer, body)
    centrals.push(central, nameBuffer)
    offset += local.length + nameBuffer.length + body.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

const docsPage = (title, body) => `<!doctype html><html lang="en"><head><title>${title} | NSW Design System</title></head>
<body><div class="nsw-header__title">NSW Design System <span class="nsw-docs__version">v9.1.0</span></div>
<div class="nsw-docs__main"><h1>${title}</h1>${body}</div><footer></footer></body></html>`
const code = (language, markup) => `<pre><code class="${language}"><script>document.write((\`${markup}\`).replace(/</g, "&lt;"));</script></code></pre>`

const cardPage = docsPage('Cards', `
<ul class="nsw-tabs__list"><li>Guidance</li></ul>
<section id="section-guidance" class="nsw-tabs__content">
<h2>Usage</h2><p>Use cards to summarise a single topic &amp; link to it.</p>
<h3>Do not</h3><ul><li>mix card styles</li></ul>
<h2>Accessibility</h2><p>Cards are links.</p>
</section>
<section id="section-interactive-demo" class="nsw-tabs__content">
<h3>Headline only</h3><h4>White</h4>
<div class="nsw-docs__example"><div class="nsw-card nsw-card--white">Live</div></div>
${code('html', '<div class="nsw-card nsw-card--white"><a href="#">Title</a></div>')}
<h4>Image</h4>
${code('html', '<div class="nsw-card" style="background-image: url(https://example.org/a.jpg);">\\`x\\`</div>')}
</section>`)

const themingPage = docsPage('Theming', `<h2>CSS Variables</h2>${code('css', ':root {\n  --nsw-brand-dark: #002664;\n}')}`)

const templatePage = `<!doctype html>
<html lang="en" class="no-js">
<head>
  <title>Content page - Article | NSW Design System</title>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/docs/css/docs.css">
  <script data-category="analytics">track()</script>
</head>
<body>
<div class="nsw-masthead"><div class="nsw-container">A NSW Government website</div></div>
<main class="nsw-container"><h1>Article</h1><div class="js-tabs nsw-tabs"></div></main>
  <script src="/js/main.js"></script>
  <script>
    window.NSW.initSite()
  </script>
</body>
</html>`

const css = `/* .ignored-comment */ .nsw-card{color:red} .nsw-card--white{background:url(img.png)}
.nsw-container,.nsw-masthead{margin:0} .nsw-tabs:hover{x:1} @media (min-width:1px){.nsw-m-top-sm{margin-top:.5rem}}`

function kitFiles(version = '9.1.0') {
  return [
    ['index.html', docsPage('Home', '').replace('9.1.0', version), false],
    ['css/main.css', css],
    ['components/card/index.html', cardPage],
    ['core/grid/index.html', docsPage('Grid', '<p>Twelve columns.</p>')],
    ['docs/content/develop/theming.html', themingPage],
    ['templates/content/article.html', templatePage],
    ['templates/index.html', docsPage('Templates', '')],
    ['assets/images/photo.jpg', 'binary'],
    ['../escape.html', 'nope'],
  ]
}

function withKit(fn) {
  const root = mkdtempSync(join(tmpdir(), 'nswds-'))
  try {
    return fn(extractKit(zip(kitFiles()), '9.1.0', root), root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('reads stored and deflated ZIP entries', () => {
  const entries = readZip(zip([['a.txt', 'stored', false], ['b.txt', 'deflated']]))
  assert.deepEqual(entries.map((e) => [e.name, e.method]), [['a.txt', 0], ['b.txt', 8]])
  assert.throws(() => readZip(Buffer.from('not a zip file at all, just text padding here')), /Not a ZIP archive/)
})

test('extracts only the pages the skill reads and confirms the release version', () => withKit((kit, root) => {
  assert.ok(existsSync(join(kit, 'components', 'card', 'index.html')))
  assert.ok(existsSync(join(kit, 'docs', 'content', 'develop', 'theming.html')))
  assert.ok(!existsSync(join(kit, 'assets')), 'images are not extracted')
  assert.ok(!existsSync(join(root, 'escape.html')), 'path traversal entries are ignored')
  assert.deepEqual(cachedVersions(root), ['9.1.0'])
  assert.equal(kitVersion(readFileSync(join(kit, 'index.html'), 'utf8')), '9.1.0')
}))

test('rejects a kit that does not match the requested release', () => {
  const root = mkdtempSync(join(tmpdir(), 'nswds-'))
  try {
    assert.throws(() => extractKit(zip(kitFiles('9.0.0')), '9.1.0', root), /reports version 9\.0\.0/)
    assert.deepEqual(cachedVersions(root), [], 'a failed extraction leaves nothing cached')
    assert.throws(() => extractKit(zip(kitFiles()), 'latest', root), /Not a release version/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses oversized kit entries before decompressing them', () => {
  const root = mkdtempSync(join(tmpdir(), 'nswds-'))
  try {
    const files = kitFiles()
    const big = ['components/card/index.html', 'x'.repeat(5000)]
    assert.throws(() => extractKit(zip([...files.filter(([n]) => n !== big[0]), big]), '9.1.0', root, { entry: 4000, total: 1e6 }),
      /Kit entry components\/card\/index\.html declares 5000 bytes; refusing entries over 4000/)
    assert.throws(() => extractKit(zip(files), '9.1.0', root, { entry: 1e6, total: 1000 }), /Kit files total more than 1000 bytes/)
    assert.deepEqual(cachedVersions(root), [], 'nothing is cached after a refusal')

    // A tiny deflated entry that claims a huge size is refused on its claim, not after inflating.
    const bomb = zip([...files, ['templates/content/bomb.html', Buffer.alloc(2 * 1024 * 1024)]])
    assert.throws(() => extractKit(bomb, '9.1.0', root, { entry: 1024 * 1024, total: 1e9 }), /bomb\.html declares 2097152 bytes/)
    assert.ok(extractKit(zip(files), '9.1.0', root), 'the default limits accept a normal kit')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('caps the starter kit download', async () => {
  const response = (...chunks) => ({ body: (async function* () { yield* chunks.map((c) => new Uint8Array(Buffer.from(c))) })() })
  assert.equal((await readCapped(response('abc', 'def'), 6, 'kit')).toString(), 'abcdef')
  await assert.rejects(readCapped(response('abc', 'defg'), 6, 'The kit'), /The kit is larger than 6 bytes; refusing it/)
  assert.ok(KIT_LIMITS.download >= 52122291 * 2 && KIT_LIMITS.entry >= 288223 * 10 && KIT_LIMITS.total >= 10510163 * 5,
    'limits leave ample room above the v3.27.0 kit')
})

test('lists components, core styles, guides and templates', () => withKit((kit) => {
  const list = listKit(kit)
  assert.deepEqual(list.components, [{ name: 'card', title: 'Cards' }])
  assert.deepEqual(list.core, [{ name: 'grid', title: 'Grid' }])
  assert.deepEqual(list.guides, [{ name: 'develop/theming', title: 'Theming' }])
  assert.deepEqual(list.templates, [{ name: 'content/article', title: 'Content page - Article' }])
}))

test('extracts guidance text from the guidance tab only', () => {
  const text = guidanceOf(cardPage)
  assert.match(text, /^## Usage/m)
  assert.match(text, /summarise a single topic & link to it/)
  assert.match(text, /^- mix card styles$/m)
  assert.doesNotMatch(text, /Headline only|Live/)
})

test('labels each example with the headings in its own tab', () => {
  const examples = examplesOf(cardPage)
  assert.deepEqual(examples.map((e) => e.heading), ['Headline only › White', 'Headline only › Image'])
  assert.equal(examples[0].markup, '<div class="nsw-card nsw-card--white"><a href="#">Title</a></div>')
  assert.match(examples[1].markup, /`x`/, 'template literal escapes are removed')
  assert.deepEqual(examplesOf(themingPage).map((e) => [e.heading, e.language]), [['CSS Variables', 'css']])
})

test('replaces docs-site chrome with the pinned release assets', () => {
  const { html, warnings } = standaloneTemplate(templatePage, '9.1.0')
  assert.match(html, /<html lang="en" class="no-js">/)
  assert.match(html, /<title>Content page - Article<\/title>/)
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Public\+Sans/)
  assert.match(html, /nsw-design-system@9\.1\.0\/dist\/css\/main\.css/)
  assert.match(html, /nsw-design-system@9\.1\.0\/dist\/js\/main\.js/)
  assert.equal(html.match(/initSite/g).length, 1)
  assert.doesNotMatch(html, /docs\.css|track\(\)|src="\/js\/main\.js"/)
  assert.deepEqual(warnings, [])
})

test('collects class names from CSS without comments, URLs or numbers', () => {
  const classes = cssClasses(css)
  for (const name of ['nsw-card', 'nsw-card--white', 'nsw-container', 'nsw-masthead', 'nsw-tabs', 'nsw-m-top-sm']) assert.ok(classes.has(name), name)
  for (const name of ['ignored-comment', 'png', '5rem']) assert.ok(!classes.has(name), name)
})

test('accepts only --nsw-* variables as theming', () => {
  assert.ok(themeOnly(':root { --nsw-brand-dark: #002664; --nsw-brand-accent: #d7153a }'))
  assert.ok(themeOnly('.my-section{--nsw-brand-light:#fff;}'))
  assert.ok(!themeOnly(':root { --nsw-brand-dark: #002664; color: red }'))
  assert.ok(!themeOnly('.x { --my-var: 1 }'))
  assert.ok(!themeOnly('@media (min-width: 1px) { :root { --nsw-brand-dark: #000 } }'))
  assert.ok(!themeOnly(''))
  assert.equal(styleKey(' background-image : url(https://a/b.jpg) ; '), 'background-image:url()')
})

test('passes a page built only from the release', () => withKit((kit) => {
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  assert.deepEqual(checkPage(html, { version: '9.1.0', ...loadRules(kit) }), [])
}))

test('flags everything that is not from the design system release', () => withKit((kit) => {
  const rules = loadRules(kit)
  assert.ok(rules.styles.has('background-image:url()'), 'style values used in component examples are allowed')
  const page = `<html><head>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/nsw-design-system@3/dist/css/main.css">
<link rel="stylesheet" href="https://cdn.example.org/bootstrap.css">
<style>.hero { color: red }</style>
<style>:root { --nsw-brand-dark: #0b3f47; }</style>
</head><body>
<div class="nsw-card my-card nsw-docs__example" style="padding: 4px">x</div>
<div class="nsw-card" style="background-image: url(https://example.org/other.jpg)">ok</div>
<section class="nsw-container" style="--nsw-brand-light: #fff">ok</section>
<script src="https://cdn.example.org/app.js"></script>
<script>doSomething()</script>
<script src="https://cdn.jsdelivr.net/npm/nsw-design-system@9.1.0/dist/js/main.js"></script>
</body></html>`
  const issues = checkPage(page, { version: '9.1.0', ...rules })
  const messages = issues.map((i) => `${i.level}:${i.line}:${i.message}`)
  const expect = [
    /^error:2:.*pinned to @3/,
    /^error:3:stylesheet not from the design system release: https:\/\/cdn\.example\.org\/bootstrap\.css/,
    /^error:4:<style> element/,
    /^error:7:style attribute "padding: 4px"/,
    /^error:7:nsw-docs__example is a docs-site class/,
    /^error:7:class "my-card" is not defined/,
    /^error:10:script not from the design system release/,
    /^error:11:inline script not from the design system release/,
    /^error:1:design system JavaScript is loaded but window\.NSW\.initSite\(\) is never called/,
  ]
  for (const pattern of expect) assert.ok(messages.some((m) => pattern.test(m)), `missing ${pattern}\n${messages.join('\n')}`)
  assert.equal(issues.length, expect.length, messages.join('\n'))
}))

test('requires a design system stylesheet and JavaScript for js- hooks', () => withKit((kit) => {
  const messages = checkPage('<div class="nsw-tabs js-tabs"></div>', { version: '9.1.0', ...loadRules(kit) }).map((i) => i.message)
  assert.ok(messages.some((m) => /no design system stylesheet/.test(m)))
  assert.ok(messages.some((m) => /js- hooks/.test(m)))
  const bundle = checkPage('<link rel="stylesheet" href="/build/site.css"><p class="nsw-card">x</p>', {
    version: '9.1.0', ...loadRules(kit), designSystemCss: ['/build/site.css'],
  })
  assert.deepEqual(bundle, [])
}))

test('approved third-party assets never stand in for the design system', () => withKit((kit) => {
  const page = `<link rel="stylesheet" href="https://maps.example.org/map.css">
<script src="https://analytics.example.org/a.js"></script>
<script>window.NSW.initSite()</script>
<div class="nsw-tabs js-tabs"></div>`
  const messages = checkPage(page, {
    version: '9.1.0', ...loadRules(kit),
    allowStylesheets: ['https://maps.example.org/map.css'], allowScripts: ['https://analytics.example.org/'],
  }).map((i) => i.message)
  assert.ok(messages.some((m) => /no design system stylesheet/.test(m)), messages.join('\n'))
  assert.ok(messages.some((m) => /initSite\(\) is called but the design system JavaScript is not loaded/.test(m)), messages.join('\n'))
  assert.ok(messages.some((m) => /js- hooks/.test(m)), messages.join('\n'))
  assert.ok(!messages.some((m) => /not from the design system release/.test(m)), 'approved assets are accepted')
}))

test('inline scripts fail unless the user approved them', () => withKit((kit) => {
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const page = html.replace('</body>', '<script>gtag("config", "G-TEST")</script>\n</body>')
  const rules = { version: '9.1.0', ...loadRules(kit) }
  assert.match(checkPage(page, rules).map((i) => `${i.level}:${i.message}`).join('\n'), /^error:inline script not from the design system release/m)
  assert.deepEqual(checkPage(page, { ...rules, allowInlineScripts: ['gtag('] }), [])
}))

test('approvals match the exact address, never a lookalike', () => {
  const approvals = ['https://analytics.example.com/', 'https://cdn.example.com/lib/app.js', '/build/site.css', './js/'].map(parseApproval)
  for (const url of ['https://analytics.example.com/a.js', 'https://cdn.example.com/lib/app.js', '//analytics.example.com/b.js',
    '/build/site.css', '/build/site.css?v=2', './js/app.js']) assert.ok(approved(url, approvals), url)
  for (const url of ['https://evil-analytics.example.com/a.js', 'https://analytics.example.com.evil.org/a.js',
    'http://analytics.example.com/a.js', 'https://cdn.example.com/lib/app.js.evil', 'https://cdn.example.com/lib/other.js',
    '/build/site.css.map', '/other/build/site.css', 'https://x.example.org/build/site.css', 'javascript:alert(1)']) {
    assert.ok(!approved(url, approvals), url)
  }
  for (const bad of ['analytics.example.com', 'http://analytics.example.com/', '//analytics.example.com/', 'js/app.js']) {
    assert.throws(() => parseApproval(bad), /must be an https:\/\/ address or a path starting with \/ or \.\//, bad)
  }
  for (const bare of ['https://analytics.example.com', 'https://analytics.example.com?v=1', 'https://analytics.example.com#x']) {
    assert.throws(() => parseApproval(bare), /names a whole site; add a trailing \//, bare)
  }
  const site = [parseApproval('https://analytics.example.com/')]
  assert.ok(approved('https://analytics.example.com/any/file.js', site), 'an explicit trailing / approves the whole site')
  assert.ok(!approved('https://cdn.example.com/lib/app.js/extra', approvals), 'a file approval is not a prefix')
})

test('only the Google Fonts links the release uses are accepted', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  assert.ok(rules.fonts.has('https://fonts.googleapis.com/css2?family=Public+Sans&display=swap'))
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  assert.deepEqual(checkPage(html.replace('&display=swap', '&amp;display=swap'), rules), [], 'an escaped & matches')
  const other = html.replace('</head>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Comic+Neue">\n</head>')
  assert.match(checkPage(other, rules).map((i) => i.message).join('\n'), /stylesheet not from the design system release: https:\/\/fonts\.googleapis\.com\/css2\?family=Comic\+Neue/)
}))

test('blank approval patterns approve nothing', () => withKit((kit, root) => {
  const page = `<link rel="stylesheet" href="https://x.example.org/a.css">
<script src="https://x.example.org/a.js"></script><script>doSomething()</script><p class="nsw-card">x</p>`
  const blank = ['', ' ']
  const messages = checkPage(page, {
    version: '9.1.0', ...loadRules(kit),
    designSystemCss: blank, designSystemJs: blank, allowStylesheets: blank, allowScripts: blank, allowInlineScripts: blank,
  }).map((i) => i.message)
  for (const pattern of [/no design system stylesheet/, /stylesheet not from the design system release/,
    /script not from the design system release/, /inline script not from the design system release/]) {
    assert.ok(messages.some((m) => pattern.test(m)), `${pattern}\n${messages.join('\n')}`)
  }
  const out = join(root, 'page.html')
  writeFileSync(out, page)
  const run = (...args) => spawnSync(process.execPath, [script, 'check', out, '--version', '9.1.0', ...args], {
    encoding: 'utf8', env: { ...process.env, NSWDS_CACHE_DIR: root },
  })
  for (const flag of ['--design-system-css', '--design-system-js', '--allow-stylesheet', '--allow-script', '--allow-inline-script']) {
    const result = run(flag, '')
    assert.equal(result.status, 1, flag)
    assert.match(result.stderr, new RegExp(`${flag} needs a non-empty value`))
  }
  const bare = run('--allow-script', 'x.example.org')
  assert.equal(bare.status, 1)
  assert.match(bare.stderr, /approval "x\.example\.org" must be an https:\/\/ address/)
}))

test('checks unquoted and upper-case attributes', () => withKit((kit) => {
  const base = `<link rel=stylesheet href=https://cdn.jsdelivr.net/npm/nsw-design-system@9.1.0/dist/css/main.css>`
  const messages = checkPage(`${base}
<div CLASS=custom STYLE=color:red>x</div>
<script src=https://evil.example.org/x.js></script>`, { version: '9.1.0', ...loadRules(kit) }).map((i) => i.message)
  assert.ok(messages.some((m) => /class "custom" is not defined/.test(m)), messages.join('\n'))
  assert.ok(messages.some((m) => /style attribute "color:red"/.test(m)), messages.join('\n'))
  assert.ok(messages.some((m) => /script not from the design system release: https:\/\/evil/.test(m)), messages.join('\n'))
  assert.ok(!messages.some((m) => /no design system stylesheet/.test(m)), 'an unquoted design system link counts')
}))

test('ignores HTML comments', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const commentedAssets = `<!-- <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/nsw-design-system@9.1.0/dist/css/main.css"> -->
<p class="nsw-card">x</p>`
  assert.ok(checkPage(commentedAssets, rules).some((i) => /no design system stylesheet/.test(i.message)), 'commented assets do not count')
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const commentedJunk = html.replace('<main', '<!-- <div class="custom" style="color:red"></div>\n<script src="https://x.example.org/a.js"></script> -->\n<main')
  assert.deepEqual(checkPage(commentedJunk, rules), [], 'commented markup is not checked')
  const lines = checkPage(html.replace('<main', '<!--\n\n-->\n<main class="custom"'), rules)
  assert.equal(lines[0].line, html.slice(0, html.indexOf('<main')).split('\n').length + 3, 'line numbers survive comment removal')
}))

test('escapes the template title', () => {
  const hostile = templatePage.replace('<title>Content page - Article', '<title>A &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
  const { html } = standaloneTemplate(hostile, '9.1.0')
  assert.match(html, /<title>A &lt;\/title&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/)
  assert.doesNotMatch(html, /<script>alert/)
})

test('the default version must be published on both GitHub and npm', async () => {
  const realFetch = globalThis.fetch
  const serve = (release, npm) => {
    globalThis.fetch = async (url) => {
      const body = String(url).includes('api.github.com') ? { tag_name: `v${release}` } : { version: npm }
      return { ok: true, status: 200, json: async () => body }
    }
  }
  try {
    serve('9.1.0', '9.1.0')
    assert.equal(await resolveVersion(), '9.1.0')
    serve('9.2.0', '9.1.0')
    await assert.rejects(resolveVersion(), /GitHub release \(v9\.2\.0\) and npm \(v9\.1\.0\) differ; confirm which to use and pass it with --version/)
    assert.equal(await resolveVersion('v9.1.0'), '9.1.0', 'an explicit version is used as given')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('command line works offline from the cache and fails on violations', () => withKit((kit, root) => {
  const env = { ...process.env, NSWDS_CACHE_DIR: root }
  const run = (...args) => spawnSync(process.execPath, [script, ...args, '--version', '9.1.0'], { encoding: 'utf8', env })
  assert.match(run('list').stdout, /card\s+Cards[\s\S]*develop\/theming\s+Theming[\s\S]*content\/article/)
  assert.match(run('examples', 'card').stdout, /## Headline only › White\n\n```html\n<div class="nsw-card/)
  assert.match(run('guidance', 'develop/theming').stdout, /## CSS Variables/)
  assert.match(run('guidance', '../x').stderr, /Not a page name/)
  const out = join(root, 'page.html')
  assert.equal(run('template', 'content/article', '--out', out).status, 0)
  assert.equal(run('template', 'content/article', '--out', out).status, 1, 'refuses to overwrite without --force')
  const clean = run('check', out)
  assert.equal(clean.status, 0, clean.stdout + clean.stderr)
  assert.match(clean.stdout, /uses only NSW Design System v9\.1\.0/)
  writeFileSync(out, readFileSync(out, 'utf8').replace('<main class="nsw-container">', '<main class="nsw-container custom">'))
  const dirty = run('check', out)
  assert.equal(dirty.status, 1)
  assert.match(dirty.stdout, /class "custom" is not defined by NSW Design System v9\.1\.0/)
}))
