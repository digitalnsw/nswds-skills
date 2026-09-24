---
name: nsw-design-system
description: Build websites, pages, prototypes and components for NSW Government using only the NSW Design System (digitalnsw/nsw-design-system), with its latest release as the single source of truth. Use whenever the user wants to build, mock up, prototype, scaffold, restyle or review a NSW Government website, web page, service, form or component, or mentions the NSW Design System, designsystem.nsw.gov.au or nsw-design-system classes. Takes markup, templates, guidance and CSS from the pinned release, never from memory, and checks every page contains nothing the design system does not provide. Not for print, presentations, social tiles or other masterbrand work that is not a website.
argument-hint: "[what to build, optional]"
---

# NSW Design System websites

Build with the [NSW Design System](https://designsystem.nsw.gov.au/) and nothing else. The source of truth is the latest release of [digitalnsw/nsw-design-system](https://github.com/digitalnsw/nsw-design-system). Every component, class, template and token you use must come from that release. Do not rely on what you remember of the design system: it changes, and remembered markup is often out of date or invented.

`scripts/nswds.mjs` (Node.js 18 or later, no dependencies) reads the release for you. It downloads the release's HTML starter kit from the release tag once per version (about 50 MB, cached in `~/.cache/nswds-skills/`). The kit is the design system's own built documentation: rendered example markup for every component, full-page templates, guidance and the release CSS. Run it from this skill's directory or by full path:

```bash
node scripts/nswds.mjs version            # latest release, npm latest, the project's installed version
node scripts/nswds.mjs list               # components, core styles, guides, utilities, templates
node scripts/nswds.mjs guidance card      # how and when to use it, including accessibility
node scripts/nswds.mjs examples card      # the release's exact markup for every variant
node scripts/nswds.mjs template content/article --out index.html
node scripts/nswds.mjs check index.html   # fails on anything not from the release
```

Add `--version x.y.z` to any command to use a specific release.

## 1. Pin the version

Run `version`.

- If the project already depends on `nsw-design-system`, build against the installed version and pass it as `--version`. Ask before upgrading it.
- Otherwise use the latest release. If npm and the GitHub release disagree, tell the user and ask which to use.
- State the version you are building against, and pin it exactly everywhere (`nsw-design-system@3.27.0`, never `@3` or `@latest`) so the page cannot drift from what you checked.

## 2. Choose how the design system is loaded

Match what the project already does. Read `guidance develop/getting-started` for the options.

- **Static pages, prototypes, projects without a build:** link the release CSS and JavaScript from jsDelivr, as `template` does.
- **Projects with npm and Sass:** `npm install nsw-design-system@<version>` and import its Sass as the getting-started guide shows. Load its `dist/js/main.js` and call `window.NSW.initSite()` in script tags at the end of the body.
- **React, Vue and other frameworks:** use the same markup (with `className` in JSX), the same CSS and the same JavaScript initialisation. Do not install a third-party NSW component library; it is not the design system.

## 3. Start from a template

Run `list` and pick the page template closest to the need (content page, homepage, landing page, search, form). Create the page with `template <name> --out <file>`. It swaps the documentation site's styles, analytics and scripts for the pinned release assets.

Some templates are demonstrations: the map templates load a third-party map library, and the theming templates use the documentation site's colour switcher. `template` warns when a template has anything that is not design system. Prefer a template with no warnings, and remove or replace what it flags.

Keep the page shell the template provides: skip links, masthead, header, main navigation, breadcrumbs where relevant, main content and footer.

## 4. Build every part from the release

For each part of the page:

1. Find the component, core style or utility with `list`.
2. Read its `guidance` before using it. It says when to use it, when not to, the content rules and accessibility requirements. Follow it.
3. Copy the markup for the variant you need from `examples`, exactly.
4. Change only content: text, links, `id` and `for` pairs, `aria-*` values that reference them, image `src` and `alt`, and form field names. Use only the modifier classes shown in the examples.

Lay out pages with the design system's grid, layout, section and spacing classes (`guidance grid`, `guidance layout`, `guidance section`, `guidance utilities/spacing`). Use its icon approach (`guidance iconography`) and colour classes (`guidance colour`).

These rules make the page design-system-only:

- No custom CSS: no `<style>` rules, no `style` attributes and no other stylesheets or CSS frameworks. The only exceptions are the `style` values the design system's own examples use, such as a hero image's `background-image`.
- No invented classes, components or variants. If a class is not in the release, it does not exist.
- No other UI libraries or scripts for behaviour the design system provides (accordions, tabs, dialogs, navigation, date pickers and so on). Load the release JavaScript and call `window.NSW.initSite()`.
- Theming is allowed only through the design system's documented mechanism: overriding `--nsw-*` CSS variables, or Sass variables in an npm build. Read `guidance develop/theming` and the brand guidance it links to. Keep the masterbrand colours unless the user says their brand category allows a change.

If the page needs something the design system does not provide, stop and tell the user. Name the closest design system component and explain the gap. Do not build a custom version to fill it. Anything the user then approves outside the design system (analytics, a map library) is passed to `check` with `--allow-script`, `--allow-stylesheet` or, for an inline script, `--allow-inline-script`, and you name it in your report. Approved extras never count as the design system: the page must still load the release CSS and JavaScript.

## 5. Check and verify

1. Run `check` on every page you created or changed, with the pinned `--version`. In an npm and Sass project, name your compiled design system files with `--design-system-css` and `--design-system-js`. Fix every error until it reports `uses only NSW Design System`. For framework projects, check the rendered HTML (build output or the served page), not the source.
2. Open the page in a browser. Confirm the release CSS and JavaScript load without console errors, interactive components work, and the layout holds at mobile and desktop widths.
3. Tab through the page. Every interactive element must be reachable, visible when focused and usable with the keyboard.
4. For a full accessibility audit, use the `wcag-technical-audit` skill. For content, use the `australian-style-manual` skill.

## 6. Report

Tell the user:

- the design system version and how it is loaded
- the template and the components used on each page
- the `check` result for each page
- anything the design system did not cover, and what you did instead (with their approval)
- anything you could not verify.
