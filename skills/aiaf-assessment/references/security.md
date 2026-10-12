# AIAF helper security

## Runtime and XML parsing

The workbook commands (`questions` and `fill`) require Python 3.11 or later linked
to Expat 2.7.2 or later. They check both versions before running and again at the
XML parser boundary, including when imported as a module. The `platform` command
reads only JSON and the bundled question set, so it has no XML runtime
requirement. Unsupported runtimes fail with an upgrade instruction. `--help`
remains available.

Python's version alone does not establish the linked XML parser's security.
The minimum Expat version follows the [Python XML security guidance](https://docs.python.org/3/library/xml.html#xml-security).
Keep the Python distribution and its linked libraries patched beyond these
minimums as new security releases become available.

Workbook XML is screened before parsing: only UTF-8 is accepted, DTD and entity
declarations are rejected, and every XML, relationship and VML part is screened,
including parts that are copied without being parsed. ZIP part count, central
directory size, unpacked sizes and compression ratios are bounded. The runtime
check complements these controls; it does not replace them.

## Reviewed Snyk Code findings

A Snyk Code scan of `skills/aiaf-assessment` reports eight findings, listed here by
function because line numbers move as the script changes.

| Rule | Location | Review and treatment |
| --- | --- | --- |
| `python/InsecureXmlParser` / CWE-611, medium | `aiaf.py`, `parse_xml` | The Python and Expat runtime checks above reject unsupported runtimes, and DTD, entity and encoding screening runs before parsing. Static detection of `ElementTree.fromstring` cannot verify the interpreter used at runtime. |
| `python/PT` / CWE-23, low | `aiaf.py`, `check_archive` | Reads the operator's `--workbook` path to inspect the ZIP end record. Choosing an input file outside the current directory is intended CLI behaviour. |
| `python/PT` / CWE-23, low | `aiaf.py`, `Workbook.__init__` | Opens that same operator-selected workbook as a ZIP. Parts are read in memory, never extracted to filesystem paths. |
| `python/PT` / CWE-23, low | `aiaf.py`, `fill` (answers) | Reads the operator's `--answers` file; workbook contents do not choose this path. |
| `python/PT` / CWE-23, low | `aiaf.py`, `fill` (output) | Replaces the operator-selected `--out` with a completed temporary workbook. Template aliases are rejected; the temporary file is created with `mkstemp`. |
| `python/PT` / CWE-23, low | `aiaf.py`, `platform_sheet` | Reads the operator's `--answers` file for the Platform entry sheet. It is parsed as JSON; nothing in it chooses a path. |
| `python/PT` / CWE-23, low | `aiaf.py`, `write_text` | Writes the operator's optional `platform --out` file. The sheet is written to a `mkstemp` file in the same directory and moved into place only when complete. |
| `python/PT/test` / CWE-23, low | `test_aiaf.py`, `OfficialWorkbookTest` | Opens the workbook named by the `AIAF_WORKBOOK` environment variable, which the person running the tests sets. |

The path findings are contextual false positives for a locally invoked CLI
whose operator already chooses files with their own filesystem permissions.
Absolute paths and parent-directory paths remain supported. The XML runtime
requirement is enforced and tested, but the scanner warning remains open.

The repository's `.snyk` excludes `scripts/aiaf.py` from Snyk Code by exact
path, because finding-level ignores are not honoured for Snyk Code in this
organisation. The pull request `code/snyk` check therefore does not scan this
file: run `snyk code test` (or the Snyk connector) on `skills/aiaf-assessment`
directly after changing it, and compare the findings with the table above.

The script makes no network requests. Workbooks are supplied by the user.

This assessment assumes operator-controlled arguments and working directories.
It is not a sandbox or a filesystem authorisation boundary. If the helper is
wrapped in a service, given elevated privileges, or used with directories that
an attacker can concurrently modify, reassess the path handling and enforce
that application's access boundary before using it.

## Dependency findings

The scan including development dependencies passed with the repository's existing
policy. Without the policy, Snyk reported six vulnerabilities in release tooling:
one in `braces`, two in `http-cache-semantics`, and three in npm's bundled `undici`.
There was also an npm Artistic-2.0 licence finding. These existing acceptances are
separate from this code change; a policy pass does not mean the dependency tree
contains no known vulnerabilities. No acceptance is extended or added here.
