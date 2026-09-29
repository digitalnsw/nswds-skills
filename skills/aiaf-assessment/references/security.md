# AIAF workbook security

## Runtime and XML parsing

The workbook helper requires Python 3.11 or later linked to Expat 2.7.2 or later.
It checks both versions before dispatching a CLI command and again at the XML
parser boundary, including when imported as a module. Unsupported runtimes fail
with an upgrade instruction. `--help` remains available.

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

The 29 September 2026 CLI and dashboard scans of commit `578492c` agreed on eight
findings. Locations below refer to that commit, so they remain traceable when
the script changes.

| Rule | Original location in `scripts/aiaf.py` | Review and treatment |
| --- | --- | --- |
| `python/InsecureXmlParser` / CWE-611, medium | `parse_xml`, line 158 | The Python and Expat runtime checks above now reject unsupported runtimes. Existing DTD, entity and encoding screening remains. Static detection of `ElementTree.fromstring` alone cannot verify the interpreter used at runtime. |
| `python/PT` / CWE-23, low | `check_archive`, line 137 | Reads the operator's `--workbook` path to inspect the ZIP end record. Choosing an input file outside the current directory is intended CLI behaviour. |
| `python/PT` / CWE-23, low | `Workbook.__init__`, line 182 | Opens that same operator-selected workbook as a ZIP. Parts are read in memory, never extracted to filesystem paths. |
| `python/PT` / CWE-23, low | `fill`, line 469 | Reads the operator's `--answers` file; workbook contents do not choose this path. |
| `python/PT` / CWE-23, low | `fill`, line 504 | Replaces the operator-selected `--out` with a completed temporary workbook. Template aliases are rejected; the temporary file is created with `mkstemp`. |
| `python/PT` / CWE-23, low | `download`, line 623 | Reads an existing download in the operator's `--dir`. The remote filename is reduced to a basename and allowlisted; symlinks and non-regular destinations are rejected. |
| `python/PT` / CWE-23, low | `download`, line 634 | Moves the validated temporary download to the validated filename in the operator's directory. The tainted source reported for this finding is the `mkstemp` path. |
| `python/PT` / CWE-23, low | `download`, line 637 | Removes the `mkstemp` file after a failed download validation. It does not delete a path supplied by workbook content. |

The seven path findings are contextual false positives for a locally invoked CLI
whose operator already chooses files with their own filesystem permissions.
Absolute paths and parent-directory paths remain supported. No suppression or
file-wide exclusion is added for these findings.

The CLI rescan after adding the runtime checks still reports the same eight
findings, with no new findings. The XML runtime requirement is enforced and
tested, but the scanner warning remains open; this is not a clean Snyk Code run.

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
