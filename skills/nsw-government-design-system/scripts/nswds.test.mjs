import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'
import {
  cachedVersions, checkPage, cssClasses, examplesOf, extractKit, guidanceOf, kitVersion,
  listKit, loadRules, readZip, standaloneTemplate, styleKey, themeOnly,
} from './nswds.mjs'

const script = fileURLToPath(new URL('./nswds.mjs', import.meta.url))

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
    /^warning:11:inline script/,
    /^error:1:design system JavaScript is loaded but window\.NSW\.initSite\(\) is never called/,
  ]
  for (const pattern of expect) assert.ok(messages.some((m) => pattern.test(m)), `missing ${pattern}\n${messages.join('\n')}`)
  assert.equal(issues.length, expect.length, messages.join('\n'))
}))

test('requires a design system stylesheet and JavaScript for js- hooks', () => withKit((kit) => {
  const messages = checkPage('<div class="nsw-tabs js-tabs"></div>', { version: '9.1.0', ...loadRules(kit) }).map((i) => i.message)
  assert.ok(messages.some((m) => /no design system stylesheet/.test(m)))
  assert.ok(messages.some((m) => /js- hooks/.test(m)))
  const allowed = checkPage('<link rel="stylesheet" href="/build/site.css"><p class="nsw-card">x</p>', {
    version: '9.1.0', ...loadRules(kit), allowStylesheets: ['/build/site.css'],
  })
  assert.deepEqual(allowed, [])
}))

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
