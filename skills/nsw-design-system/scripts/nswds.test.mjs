import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import {
  cachedVersions, checkPage, cssClasses, examplesOf, extractKit, guidanceOf, kitVersion,
  approved, decodeReferences, KIT_LIMITS, latestVersions, listKit, loadRules, openTags, parseApproval, readCapped, readZip, resolveVersion, standaloneTemplate,
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

const docsPage = (title, body) => `<!doctype html><html lang="en" class="no-js"><head><title>${title} | NSW Design System</title>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans&display=swap" rel="stylesheet"></head>
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
<div class="nsw-docs__example"><div class="nsw-card nsw-card--white">Live</div><div class="nsw-tabs js-tabs"></div></div>
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
    ['templates/index.html', docsPage('Templates', '<div class="nsw-map-bar"></div>')],
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
  assert.ok(!themeOnly(':root { --nsw-brand-dark: #002664; } .evil { color: red'), 'an unclosed rule is not theming')
  assert.ok(!themeOnly(':root { --nsw-brand-dark: #002664; } }'), 'a stray closing brace is not theming')
  assert.ok(!themeOnly(':root { --nsw-brand-dark: { color: red } }'), 'nested blocks are not theming')
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
    '/build/site.css', './js/app.js', 'https://cdn.example.com/lib/app.js#section']) assert.ok(approved(url, approvals), url)
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

test('exact approvals compare the query string; folder approvals do not', () => {
  const exact = ['https://cdn.example.com/lib/app.js', '/build/site.css', 'https://cdn.example.com/x.js?v=2', '/build/app.css?v=2']
    .map(parseApproval)
  for (const url of ['https://cdn.example.com/lib/app.js?untrusted=1', '/build/site.css?v=2', 'https://cdn.example.com/x.js',
    'https://cdn.example.com/x.js?v=3', '/build/app.css', '/build/app.css?v=2&x=1']) {
    assert.ok(!approved(url, exact), url)
  }
  for (const url of ['https://cdn.example.com/x.js?v=2', '/build/app.css?v=2', '/build/app.css?v=2#top']) assert.ok(approved(url, exact), url)
  const folder = [parseApproval('https://cdn.example.com/lib/'), parseApproval('/build/')]
  for (const url of ['https://cdn.example.com/lib/app.js?v=9', '/build/site.css?v=2']) assert.ok(approved(url, folder), url)
})

test('relative approvals resolve dot segments before comparing', () => {
  const approvals = ['/build/', './js/', '/build/site.css'].map(parseApproval)
  for (const url of ['/build/app.js', '/build/sub/../site.css', './js/app.js', 'js/app.js']) assert.ok(approved(url, approvals), url)
  for (const url of ['/build/../evil.js', './js/../evil.js', '/build/%2e%2e/evil.js', '/build/%2E%2E/evil.js',
    '/build/./../evil.js', '../js/app.js']) {
    assert.ok(!approved(url, approvals), url)
  }
  assert.ok(!approved('https://relative.invalid/page/js/app.js', approvals), 'the resolution base is not a real origin')
})

test('reads tags quote-aware so a ">" in a value cannot hide an attribute', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const hidden = html.replace('<main class="nsw-container">',
    `<div data-note=">" style="color:red">x</div>\n<div data-a='>' class="nsw-card hidden-custom">y</div>\n<main class="nsw-container">`)
  const messages = checkPage(hidden, rules).map((i) => i.message)
  assert.ok(messages.some((m) => /style attribute "color:red"/.test(m)), messages.join('\n'))
  assert.ok(messages.some((m) => /class "hidden-custom" is not defined/.test(m)), messages.join('\n'))
  const link = html.replace('</head>', `<link title=">" rel="stylesheet" href="https://x.example.org/a.css">\n</head>`)
  assert.ok(checkPage(link, rules).some((i) => /stylesheet not from the design system release: https:\/\/x\.example\.org/.test(i.message)))
  const text = html.replace('<h1>Article</h1>', '<h1>Use class=custom in a sentence</h1>')
  assert.deepEqual(checkPage(text, rules), [], 'attribute-like text outside a tag is not an attribute')
}))

test('addresses that resolve to another site never match a site-path approval', () => {
  const approvals = ['/build/', './js/'].map(parseApproval)
  for (const url of ['\\\\evil.example/build/x.js', '/\\evil.example/build/x.js', ' //evil.example/build/x.js',
    '/\t/evil.example/build/x.js', ' https://evil.example/build/x.js', '\\\\evil.example/js/x.js']) {
    assert.ok(!approved(url, approvals), JSON.stringify(url))
  }
  assert.ok(approved(' /build/x.js', approvals), 'surrounding whitespace is ignored, as in a browser')
})

test('page-relative and root-relative approvals do not overlap', () => {
  const page = [parseApproval('./js/')]
  const root = [parseApproval('/js/')]
  for (const url of ['/js/x.js', '/a/a/a/a/a/a/a/a/js/x.js', '/page/js/x.js']) assert.ok(!approved(url, page), url)
  assert.ok(approved('js/x.js', page) && approved('./js/x.js', page))
  assert.ok(!approved('js/x.js', root) && approved('/js/x.js', root))
})

test('templates are not a source of design system classes', () => withKit((kit) => {
  assert.ok(!loadRules(kit).classes.has('nsw-map-bar'), 'a class used only by a demonstration template is not allowed')
}))

test('comment markers inside attributes and script text do not hide markup', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const hidden = html.replace('<main', '<p title="<!--"></p><div style="color:red" class="evil"></div><p title="-->"></p>\n<main')
  const messages = checkPage(hidden, rules).map((i) => i.message)
  assert.ok(messages.some((m) => /style attribute "color:red"/.test(m)), messages.join('\n'))
  assert.ok(messages.some((m) => /class "evil" is not defined/.test(m)), messages.join('\n'))
  const empty = html.replace('<main', '<!--><div class="evil"></div><!-- -->\n<main')
  assert.ok(checkPage(empty, rules).some((i) => /class "evil"/.test(i.message)), '"<!-->" is an empty comment')
  const jsonLd = html.replace('</body>', '<script type="application/ld+json">{"x": "<script src=\\"a.js\\"><div class=\\"evil\\">"}</script>\n</body>')
  assert.deepEqual(checkPage(jsonLd, rules), [], 'markup inside script text is not parsed as tags, and JSON-LD never runs')
}))

test('event handlers, javascript: addresses, preloads and <base> are checked', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const page = html.replace('<main', `<div class="nsw-card" onclick="alert(1)"></div><a class="nsw-card" href=" java\tscript:alert(1)">x</a>
<link rel="preload" as="style" href="https://evil.example/x.css">
<link rel="modulepreload" href="https://evil.example/x.js">
<base href="https://evil.example/">
<main`)
  const messages = checkPage(page, rules).map((i) => i.message).join('\n')
  for (const pattern of [/onclick attribute: inline script/, /javascript: address in href/,
    /stylesheet not from the design system release: https:\/\/evil\.example\/x\.css/,
    /script not from the design system release: https:\/\/evil\.example\/x\.js/, /<base href> element/]) {
    assert.match(messages, pattern)
  }
  const approvedHandler = html.replace('<main', '<div class="nsw-card" onclick="track()"></div>\n<main')
  assert.deepEqual(checkPage(approvedHandler, { ...rules, allowInlineScripts: ['track('] }), [])
}))

test('initSite must run after the design system JavaScript has loaded', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const main = /<script src="[^"]+main\.js"><\/script>\n<script>window\.NSW\.initSite\(\)<\/script>/
  const tag = html.match(/<script src="[^"]+main\.js"><\/script>/)[0]
  const early = html.replace(main, `<script>window.NSW.initSite()</script>\n${tag}`)
  assert.match(checkPage(early, rules).map((i) => i.message).join('\n'), /initSite\(\) runs before the design system JavaScript is loaded/)
  for (const attr of [' defer', ' async', ' type="module"']) {
    const deferred = html.replace(tag, tag.replace('<script', `<script${attr}`))
    assert.match(checkPage(deferred, rules).map((i) => i.message).join('\n'), /must load without defer, async or type="module"/, attr)
  }
}))

test('tokenizes like a browser: end tags, comment endings, quotes and references', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const at = (markup) => html.replace('<main', `${markup}\n<main`)
  const messages = (page, extra = {}) => checkPage(page, { ...rules, ...extra }).map((i) => i.message).join('\n')
  assert.match(messages(at('</p title="<!--"><div style="color:red"></div></p title="-->">')), /style attribute "color:red"/,
    'a comment marker inside an end tag is not a comment')
  assert.match(messages(at('<!-- a --!><script src="https://evil.example/x.js"></script><!-- b -->')),
    /script not from the design system release: https:\/\/evil\.example\/x\.js/, '"--!>" ends a comment')
  assert.match(messages(at('<a class="nsw-card" href="&#106;avascript:alert(1)">x</a>')), /javascript: address in href/)
  assert.match(messages(at('<a class="nsw-card" href="javascript&colon;alert(1)">x</a>')), /javascript: address in href/)
  assert.match(messages(at('<script src="/build/&#46;&#46;/&#46;&#46;/evil.js"></script>'), { allowScripts: ['/build/'] }),
    /script not from the design system release: \/build\/\.\.\/\.\.\/evil\.js/, 'references are decoded before approval')
  assert.match(messages(at("<p class=nsw-card'x>don't</p>")), /class "nsw-card'x" is not defined/, 'a quote only starts a value after "="')
  assert.match(messages(at('<p class="&#101;vil">x</p>')), /class "evil" is not defined/)
  assert.match(messages(at('<?php <div style="color:red"> ?><div class="evil"></div>')), /class "evil"/, '"<?" is a bogus comment ending at ">"')
  assert.equal(decodeReferences('a&amp;b&#x2F;&sol;&period;&eacute;&amp'), 'a&b//.&eacute;&')
  const tags = openTags('<div a="x>y" b=c\'d>t</div><script>"</p><x>"</script><b>')
  assert.deepEqual(tags.map((t) => t.name), ['div', 'script', 'b'])
  assert.equal(tags[0].attrs.get('b'), "c'd")
  assert.equal(tags[1].content, '"</p><x>"')
}))

test('SVG scripts, srcdoc, object and embed are checked', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const page = html.replace('<main', `<svg><script href="https://evil.example/x.js"></script></svg>
<iframe srcdoc="<script>parent.document.body.style.background='red'</script>"></iframe>
<object data="https://evil.example/x.html"></object><embed src="https://evil.example/x.swf">
<main`)
  const messages = checkPage(page, rules).map((i) => i.message).join('\n')
  for (const pattern of [/script not from the design system release: https:\/\/evil\.example\/x\.js/, /iframe srcdoc/,
    /<object> loads content that is not from the design system release: https:\/\/evil\.example\/x\.html/,
    /<embed> loads content that is not from the design system release: https:\/\/evil\.example\/x\.swf/]) {
    assert.match(messages, pattern)
  }
  const allowed = html.replace('<main', '<object data="https://maps.example.org/m.html"></object>\n<main')
  assert.deepEqual(checkPage(allowed, { ...rules, allowScripts: ['https://maps.example.org/'] }), [])
}))

test('framework bundles and script types', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const pair = /<script src="[^"]+main\.js"><\/script>\n<script>window\.NSW\.initSite\(\)<\/script>/
  const bundled = html.replace(pair, '<script type="module" src="/assets/index-abc123.js"></script>')
  assert.deepEqual(checkPage(bundled, { ...rules, designSystemBundle: ['/assets/'] }), [], 'a bundle may be a module that calls initSite itself')
  const earlyForBundle = html.replace(pair, '<script type="module" src="/assets/index.js"></script>\n<script>window.NSW.initSite()</script>')
  assert.match(checkPage(earlyForBundle, { ...rules, designSystemBundle: ['/assets/'] }).map((i) => i.message).join('\n'),
    /initSite\(\) runs before the design system JavaScript is loaded/, 'an inline initSite cannot follow a deferred bundle')
  const plain = html.replace(/<script src="([^"]+main\.js)">/, '<script type="text/plain" src="$1">')
  assert.match(checkPage(plain, rules).map((i) => i.message).join('\n'), /type="text\/plain", so the browser never runs it/)
  const typed = html.replace(/<script src="([^"]+main\.js)">/, '<script type="text/javascript" src="$1">')
  assert.deepEqual(checkPage(typed, rules), [])
  const target = html.replace('<head>', '<head>\n<base target="_blank">')
  assert.deepEqual(checkPage(target, rules), [], '<base target> without href is fine')
}))

test('SVG and MathML contents are markup, even inside raw-text elements', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const messages = (markup) => checkPage(html.replace('<main', `${markup}\n<main`), rules).map((i) => i.message).join('\n')
  assert.match(messages('<svg><title><script src="https://evil.example/x.js"></script></title></svg>'), /script not from the design system release/)
  assert.match(messages('<svg><iframe><script href="https://evil.example/x.js"></script></iframe></svg>'), /script not from the design system release/)
  assert.match(messages('<math><textarea><div style="color:red"></div></textarea></math>'), /style attribute "color:red"/)
  assert.match(messages('<svg><style>.evil { color: red }</style></svg>'), /<style> element: custom CSS/, 'SVG style text is still checked')
  assert.match(messages('<svg/><title><div style="color:red"></div></title>'), /^$/, 'a self-closing <svg/> does not start foreign content')
  assert.match(messages('<svg></svg><textarea><div style="color:red"></div></textarea>'), /^$/, 'foreign content ends at </svg>')
}))

test('SVG animation cannot set a javascript: address', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  for (const anim of ['<animate attributeName="href" values="#a;javascript:alert(1)"/>', '<set attributeName="xlink:href" to=" javascript:alert(1)"/>']) {
    const page = html.replace('<main', `<svg><a class="nsw-card">${anim}<text>x</text></a></svg>\n<main`)
    assert.match(checkPage(page, rules).map((i) => i.message).join('\n'), /javascript: address in <(animate|set)>/, anim)
  }
}))

test('a copy of main.js still needs initSite; only a bundle may skip it', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const copy = html.replace(/<script src="[^"]+main\.js"><\/script>\n<script>window\.NSW\.initSite\(\)<\/script>/, '<script src="/js/main.js"></script>')
  assert.match(checkPage(copy, { ...rules, designSystemJs: ['/js/main.js'] }).map((i) => i.message).join('\n'), /initSite\(\) is never called/)
  const deferred = copy.replace('<script src="/js/main.js">', '<script defer src="/js/main.js">')
  assert.match(checkPage(deferred, { ...rules, designSystemJs: ['/js/main.js'] }).map((i) => i.message).join('\n'), /must load without defer/)
  assert.deepEqual(checkPage(copy.replace('</body>', '<script>window.NSW.initSite()</script>\n</body>'), { ...rules, designSystemJs: ['/js/main.js'] }), [])
}))

test('presentational attributes are flagged unless the release uses them', () => withKit((kit) => {
  const rules = { version: '9.1.0', ...loadRules(kit) }
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const page = html.replace('<main', '<div class="nsw-card" bgcolor="red" align="center"><font color="red" face="Comic Sans MS">x</font></div><input class="nsw-card" size="20">\n<main')
  const messages = checkPage(page, rules).map((i) => i.message).join('\n')
  for (const pattern of [/bgcolor attribute on <div>/, /align attribute on <div>/, /color attribute on <font>/, /face attribute on <font>/]) assert.match(messages, pattern)
  assert.doesNotMatch(messages, /size attribute on <input>/, 'size on an input is not presentational')
  assert.deepEqual(checkPage(page, { ...rules, presentational: new Set(['div bgcolor', 'div align', 'font color', 'font face']) }), [],
    'pairs the release itself uses are allowed')
}))

test('legacy references before "=" or a letter stay as written', () => {
  assert.equal(decodeReferences('?a=1&lt=2&b=&amp;&gtx&lt;'), '?a=1&lt=2&b=&&gtx<')
  assert.equal(decodeReferences('&amp &lt'), '& <')
})

test('rules are cached beside the kit', () => withKit((kit) => {
  writeFileSync(join(kit, '.rules-2.json'), '{}')
  const first = loadRules(kit)
  assert.ok(!existsSync(join(kit, '.rules-2.json')), 'caches built by older code are removed')
  const cached = readdirSync(kit).filter((f) => /^\.rules-[0-9a-f]{16}\.json$/.test(f))
  assert.equal(cached.length, 1, 'the cache name carries a hash of the script')
  writeFileSync(join(kit, 'css', 'main.css'), '.changed-after-cache{}')
  const second = loadRules(kit)
  assert.deepEqual([...second.classes].sort(), [...first.classes].sort(), 'the cached rules are used')
  writeFileSync(join(kit, cached[0]), 'not json')
  assert.ok(loadRules(kit).classes.has('changed-after-cache'), 'an unreadable cache is rebuilt')
}))

test('reports correct line numbers', () => withKit((kit) => {
  const { html } = standaloneTemplate(templatePage, '9.1.0')
  const page = html.replace('<main', '<div class="bad-one"></div>\n\n<div class="bad-two"></div>\n<main')
  const line = html.slice(0, html.indexOf('<main')).split('\n').length
  const found = checkPage(page, { version: '9.1.0', ...loadRules(kit) }).map((i) => [i.line, i.message.match(/"(bad-\w+)"/)?.[1]])
  assert.deepEqual(found, [[line, 'bad-one'], [line + 2, 'bad-two']])
}))

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

test('refuses a download redirected away from HTTPS', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => ({ ok: true, status: 200, url: 'http://mirror.example/nsw-design-system/latest', json: async () => ({}) })
  try {
    const latest = await latestVersions()
    assert.equal(latest.release, null)
    assert.ok(latest.errors.every((e) => /redirected to an insecure address: http:\/\/mirror\.example/.test(e)), latest.errors.join('\n'))
  } finally {
    globalThis.fetch = realFetch
  }
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
