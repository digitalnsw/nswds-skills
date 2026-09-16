# Technical test procedures

Use these procedures to plan evidence, not as a substitute for the exact criterion and its exceptions. The complete criterion inventory is in [criteria.json](criteria.json). Follow its `anchor` as `https://www.w3.org/TR/WCAG22/#<anchor>` and the matching Understanding page. This checklist groups methods; it does not waive unlisted criteria.

## Automated checks and runtime inspection

Record the browser, operating system, viewport, zoom, theme, role, URL, state and build. Wait for the actual application state to settle, then scan it; also exercise asynchronously loaded and error states. Inspect frames and shadow DOM support and record excluded content. Preserve raw results in the report artefacts and triage incomplete checks. Use the existing test runner when available. Read the installed engine's documentation before choosing WCAG tags; a ruleset label is not full criterion coverage.

Check duplicate IDs, invalid relationships, hidden focusable controls and unsupported ARIA against their actual effects on active criteria. A parser warning alone is not a WCAG 2.2 failure under removed 4.1.1. Conversely, removal of that criterion does not excuse broken names or relationships.

[W3C evaluation-tool guidance](https://www.w3.org/WAI/test-evaluate/tools/selecting/) explains the role and limits of tools. Use manual testing to close the remaining coverage, not an arbitrary automated score threshold.

## Semantics and assistive technology

Inspect page language and language changes, meaningful page titles, headings, landmarks, reading order, lists and data-table associations. Check informative, functional, decorative and complex images according to purpose; an `alt` attribute's presence alone proves little. Check whether an accessible name includes the visible label and whether descriptions or errors are programmatically associated.

For custom controls, inspect names, roles, values, required/invalid/expanded/selected states and relationships in the rendered accessibility tree. Verify that updating state updates the exposed information. Prefer native semantics; adding ARIA does not implement keyboard interaction.

Use a real screen reader where available. Record product/version, browser/version and OS, with the expected and observed announcements. Navigate by headings, landmarks and controls; enter and leave forms; open and close dialogs; trigger errors and status messages; navigate SPA routes; recover from failed submissions. Check both browse/reading and interaction modes as relevant. Verify that dynamic announcements are useful, timely and not repeatedly or unnecessarily disruptive.

Use audience-supported combinations, such as an appropriate Windows/browser/screen-reader pairing and mobile VoiceOver or TalkBack when mobile is in scope. Choose combinations from project support requirements; do not assert that one combination establishes support everywhere. If interaction is unavailable, leave the corresponding evidence gap explicit and hand over the test steps.

Sources: [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/), [keyboard-interface practices](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).

## Keyboard, focus and navigation

Navigate without a pointer using Tab, Shift+Tab and the keys appropriate to each widget (Enter, Space, arrows, Escape and other documented controls). Exercise every function, including drag alternatives, tooltips, menus, tabs, grids, dialogs, uploads and custom editors. Check traps, logical focus order, skip mechanisms, focus visibility and unexpected context changes.

For dialogs and dynamic changes, test focus on entry, containment where appropriate, dismissal and return to a logical place. Test route changes and deleted elements for lost focus. Preserve access to content in sticky headers/footers, cookie notices and floating panels. Do not mechanically require one widget pattern where a different implementation satisfies the criterion.

At AA, 2.4.11 concerns a focused component being entirely obscured by author-created content; it is not the stronger AAA no-obscuration requirement. Test sticky overlays, scrolling, zoom and validation messages. Check indicator visibility and contrast separately. Consult [focus not obscured (minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) before applying exceptions. AAA focus appearance is an additional test when that level is in scope.

## Visual presentation and responsive behaviour

- **Text contrast:** measure actual foreground and composited background colours, including transparency, gradients and relevant states. AA normally requires 4.5:1 for ordinary text and 3:1 for large text. The large-text definition uses 18 pt regular or 14 pt bold (24 CSS px or about 18.67 CSS px bold). Do not round a failing ratio up. Apply exceptions only with evidence. Check placeholder and hover text too. [Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- **Non-text contrast:** assess the visual information needed to identify controls, states and meaningful graphics against adjacent colours, normally at 3:1. Do not demand borders around every control or treat inactive controls as automatically subject to the same rule. [Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- **Resize:** test text at 200% without loss of content or functionality, checking the criterion's exceptions. Browser zoom and text-only resizing can expose different failures. [Resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).
- **Reflow:** test the equivalent of 320 CSS px width for vertically scrolling content and 256 CSS px height for horizontally scrolling content. For example, 400% zoom on a 1280 CSS px-wide viewport tests the width condition. Check clipping, overlap, loss and unnecessary two-dimensional scrolling. Apply the essential two-dimensional-layout exception narrowly, not to the whole page containing a table. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- **Spacing:** apply all four overrides together: line height 1.5 times font size, paragraph spacing 2 times, letter spacing 0.12 times and word spacing 0.16 times. Check loss and clipping in labels, menus and messages, considering applicable language/writing-system exceptions. These are override-tolerance tests, not mandatory default design values. [Text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).
- **Other presentation:** check colour-independent meaning, sensory instructions, orientation, images of text and content shown on hover/focus. Test dismissibility, hoverability and persistence under 1.4.13 where applicable. Inspect all supported themes. Forced-colours and reduced-motion testing help expose barriers, but map any failure to an actual requirement instead of treating the preference setting itself as an AA criterion.

## Pointer, touch and input

Test single-pointer alternatives to multi-point/path gestures and dragging, cancellation or undo, speech-input label matching, device-motion alternatives and accidental activation. Keyboard support alone does not establish the single-pointer alternative for dragging.

For 2.5.8 AA, measure target size in CSS pixels against 24 by 24 and evaluate the specified spacing or other exceptions. Small targets are not automatically failures; inspect the exception conditions and neighbouring targets. Do not substitute the 44 by 44 AAA target-size rule. [Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

## Forms, errors and authentication

Exercise blank, malformed, boundary and server-rejected submissions using safe data. Check labels, instructions, required fields, input purposes, error identification, suggestions, focus handling and status announcements. Do not rely on colour or placeholder text alone. Check prevention/review/correction for applicable legal, financial and data-changing actions, not only successful submission.

Test multi-step flows for redundant re-entry and consistent help. Include password managers, paste, autofill, MFA, one-time codes, account recovery and session expiry. Under 3.3.8, assess cognitive-function tests and the permitted alternatives, assistance and exceptions. A password field is not inherently a failure; blocking password managers or paste can remove necessary assistance. Do not describe all CAPTCHAs as categorically prohibited or permitted. Test the actual authentication process and alternatives. [Accessible authentication minimum](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html).

## Media, time and motion

Inventory live and prerecorded audio/video and establish which alternatives are required at the target level. Inspect caption accuracy, synchronisation, speaker identification and relevant sounds; assess transcripts and audio description for equivalent information. Check player names, keyboard controls and accessible status. An available caption track is not evidence that it is accurate.

Test time-limit adjustment/extension and exceptions, pauses, moving/updating content and audio control. Evaluate flashing with appropriate analysis rather than deliberately exposing people to hazardous content. At AAA, include the additional time, interruption, animation and media requirements from the full inventory.

Sources: [time-based media](https://www.w3.org/WAI/WCAG22/Understanding/time-based-media.html), [timing adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html), [three flashes or below threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).

## Documents and embedded content

For scoped downloads, inspect tagging, logical reading order, headings, lists, table relationships, alternatives, language, title, link purpose and keyboard-operable fields with appropriate document and assistive-technology tools. Text extraction or a browser preview does not establish document accessibility. Use [WCAG2ICT](https://www.w3.org/TR/wcag2ict-22/) for relevant non-web-document/software interpretation; it is informative guidance, not a substitute standard or PDF/UA certification.

Include third-party frames, consent tools, payment steps and authentication providers in process coverage. Record inaccessible access boundaries and their impact; do not remove them from the conformance denominator because they are externally owned.

## Conformance requirements

Review [Understanding conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance) separately from individual checks. Confirm full pages and complete processes, accessibility-supported uses of technology, and non-interference even for technologies not relied on for accessibility. Check the normative alternate-version and partial-conformance provisions if relevant. Record the technologies relied on and the browser/assistive-technology support evidence.
