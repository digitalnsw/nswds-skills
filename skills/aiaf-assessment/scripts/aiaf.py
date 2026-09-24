#!/usr/bin/env python3
"""Download, read and fill the NSW AI Assessment Framework (AIAF) Excel workbook.

The official workbook published by Digital NSW is the single source of truth:
questions, answer options, their technical and ethical descriptions, tags and the
position of every input cell are read from the workbook itself, so a new release of
the workbook is picked up without changing this script.

Filling edits only the answer and use-case input cells inside the .xlsx package,
as inline strings that keep each cell's existing style. Formulas, dropdowns,
formatting and every other sheet stay byte-for-byte the same, and Excel is told to
recalculate on open so it computes the risk scores, DeepDive, Risk Register and
Audit Record from the answers.

    python3 aiaf.py download [--dir DIR]
    python3 aiaf.py questions --workbook FILE [--json]
    python3 aiaf.py fill --workbook FILE --answers answers.json --out FILE

Standard library only; Python 3.8 or later.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib
from xml.etree import ElementTree
from xml.sax.saxutils import escape

PAGE_URL = ("https://www.digital.nsw.gov.au/policy/artificial-intelligence/"
            "ai-governance-assurance-and-frameworks/nsw-ai-assessment-framework")
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"
META_LABELS = {
    "project_title": r"^\s*project title",
    "project_description": r"^\s*project description",
    "over_5m_or_drf": r"valued at over",
    "completed_by": r"who is completing",
    "date_completed": r"^\s*date completed",
}
QUESTION_HEADERS = {
    "question": "question",
    "option": "response (with qualifying statement)",
    "technical": "technicaldescription",
    "ethical": "ethicaldescription",
    "tag": "tag",
    "version": "version",
}
INVALID_XML = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")
DATE = re.compile(r"\d{2}/\d{2}/\d{4}")
WORKBOOK_HOST = re.compile(r"(^|\.)nsw\.gov\.au$")
# The official workbook has about 70 parts and 8 MB unpacked; these limits sit far above
# that and stop a crafted file from exhausting memory.
MAX_PARTS = 2000
MAX_PART_SIZE = 50 * 1024 * 1024
MAX_TOTAL_SIZE = 200 * 1024 * 1024
MAX_RATIO = 200
# zipfile reads the whole central directory when a file is opened, one record of at least
# 46 bytes per part, so its size is checked first. The official workbook's is under 10 KB.
MAX_CENTRAL_DIRECTORY = 1024 * 1024
# Downloads are read in chunks and refused past these sizes (the workbook is about 2.4 MB).
MAX_PAGE_BYTES = 5 * 1024 * 1024
MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
MAX_REDIRECTS = 5


class WorkbookError(Exception):
    pass


def col_number(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def col_letters(n):
    out = ""
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def split_ref(ref):
    m = re.fullmatch(r"\$?([A-Z]{1,3})\$?(\d+)", ref.strip().upper())
    if not m:
        raise WorkbookError(f"not a cell reference: {ref}")
    return m.group(1), int(m.group(2))


def expand_sqref(sqref):
    """'E3 E18:E20' -> ['E3', 'E18', 'E19', 'E20']"""
    cells = []
    for part in sqref.split():
        start, _, end = part.partition(":")
        c0, r0 = split_ref(start)
        c1, r1 = split_ref(end or start)
        for col in range(col_number(c0), col_number(c1) + 1):
            for row in range(r0, r1 + 1):
                cells.append(f"{col_letters(col)}{row}")
    return cells


def check_limits(infos):
    """Refuse packages whose declared sizes are implausible for a workbook. zipfile stops
    reading an entry at its declared size, so these limits bound what is decompressed."""
    if len(infos) > MAX_PARTS:
        raise WorkbookError(f"workbook has {len(infos)} parts; refusing more than {MAX_PARTS}")
    total = 0
    for info in infos:
        if info.file_size > MAX_PART_SIZE:
            raise WorkbookError(f"{info.filename} is {info.file_size} bytes unpacked; refusing parts over {MAX_PART_SIZE}")
        if info.file_size > 1024 * 1024 and info.file_size > MAX_RATIO * max(info.compress_size, 1):
            raise WorkbookError(f"{info.filename} is compressed more than {MAX_RATIO}:1; refusing it")
        total += info.file_size
    if total > MAX_TOTAL_SIZE:
        raise WorkbookError(f"workbook is {total} bytes unpacked; refusing more than {MAX_TOTAL_SIZE}")


def check_archive(path):
    """Read the ZIP end record before zipfile builds its list of parts, and refuse archives
    whose central directory is too large, so a crafted part count cannot exhaust memory."""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            f.seek(max(0, size - 65557))
            tail = f.read()
    except OSError as e:
        raise WorkbookError(f"{path} could not be read: {e}")
    end = tail.rfind(b"PK\x05\x06")
    if end < 0 or len(tail) - end < 22:
        raise WorkbookError(f"{path} is not an Excel workbook: no ZIP end record")
    parts = int.from_bytes(tail[end + 10:end + 12], "little")
    directory = int.from_bytes(tail[end + 12:end + 16], "little")
    if parts == 0xFFFF or directory == 0xFFFFFFFF or (end >= 20 and tail[end - 20:end - 16] == b"PK\x06\x07"):
        raise WorkbookError(f"{path} is a ZIP64 archive, which an Excel workbook of this size never needs")
    if parts > MAX_PARTS:
        raise WorkbookError(f"workbook has {parts} parts; refusing more than {MAX_PARTS}")
    if directory > MAX_CENTRAL_DIRECTORY:
        raise WorkbookError(f"workbook's ZIP directory is {directory} bytes; refusing more than {MAX_CENTRAL_DIRECTORY}")


def parse_xml(data, name):
    """Parse a workbook part already screened by Workbook.read."""
    try:
        return ElementTree.fromstring(data)
    except ElementTree.ParseError as e:
        raise WorkbookError(f"{name} is not valid XML: {e}") from e


def rich_text(node):
    """Text of a shared or inline string, including rich-text runs but not phonetic hints."""
    parts = []
    for child in node:
        if child.tag == f"{MAIN}t":
            parts.append(child.text or "")
        elif child.tag == f"{MAIN}r":
            t = child.find(f"{MAIN}t")
            parts.append(t.text or "" if t is not None else "")
    return "".join(parts)


class Workbook:
    """Read-only view of the parts of the .xlsx package this script needs."""

    def __init__(self, path):
        self.path = path
        check_archive(path)
        try:
            self.zip = zipfile.ZipFile(path)
        except (OSError, zipfile.BadZipFile) as e:
            raise WorkbookError(f"{path} is not an Excel workbook: {e}")
        try:
            check_limits(self.zip.infolist())
            # Screen every XML part, not only the ones read below, so a DTD cannot sit in an
            # unused part and be carried into a filled workbook.
            for info in self.zip.infolist():
                if info.filename.lower().endswith((".xml", ".rels", ".vml")):
                    self.read(info.filename)
            self.sheet_paths = self._sheet_paths()
            self.shared = self._shared_strings()
        except BaseException:
            self.zip.close()
            raise

    def close(self):
        self.zip.close()

    def raw(self, part):
        """A package part's bytes, by name or ZipInfo. Corrupt data is a WorkbookError."""
        name = getattr(part, "filename", part)
        try:
            return self.zip.read(part)
        except KeyError:
            raise WorkbookError(f"workbook part missing: {name}")
        except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError) as e:
            raise WorkbookError(f"workbook part {name} is corrupt: {e}") from e

    def read(self, name):
        """A package part. Spreadsheet XML never declares a DTD, so refusing one blocks
        entity-expansion and external-entity attacks from a crafted workbook."""
        data = self.raw(name)
        if re.search(rb"<!\s*(DOCTYPE|ENTITY)", data, re.I):
            raise WorkbookError(f"{name} declares a DTD or entities; refusing to read it")
        return data

    def _sheet_paths(self):
        book = parse_xml(self.read("xl/workbook.xml"), "xl/workbook.xml")
        rels = parse_xml(self.read("xl/_rels/workbook.xml.rels"), "xl/_rels/workbook.xml.rels")
        targets = {r.get("Id"): r.get("Target") for r in rels.iter(f"{PKG_REL}Relationship")}
        paths = {}
        for sheet in book.iter(f"{MAIN}sheet"):
            target = targets.get(sheet.get(f"{REL}id"), "")
            paths[sheet.get("name")] = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        return paths

    def _shared_strings(self):
        if "xl/sharedStrings.xml" not in self.zip.namelist():
            return []
        root = parse_xml(self.read("xl/sharedStrings.xml"), "xl/sharedStrings.xml")
        return [rich_text(si) for si in root.iter(f"{MAIN}si")]

    def shared_string(self, index, ref, sheet):
        try:
            number = int(index)
            if number < 0:
                raise IndexError(number)
            return self.shared[number]
        except (ValueError, IndexError):
            raise WorkbookError(f"{sheet}!{ref} points to shared string {index!r}, which does not exist; "
                                "the workbook is corrupt")

    def sheet_part(self, name):
        if name not in self.sheet_paths:
            raise WorkbookError(f'sheet "{name}" not found; the workbook layout has changed')
        return self.sheet_paths[name]

    def cells(self, name):
        """{ 'A1': value } for every cell with a value."""
        root = parse_xml(self.read(self.sheet_part(name)), self.sheet_part(name))
        values = {}
        for c in root.iter(f"{MAIN}c"):
            kind = c.get("t")
            if kind == "inlineStr":
                inline = c.find(f"{MAIN}is")
                value = rich_text(inline) if inline is not None else ""
            else:
                v = c.find(f"{MAIN}v")
                if v is None or v.text is None:
                    continue
                value = self.shared_string(v.text, c.get("r"), name) if kind == "s" else v.text
            if value != "":
                values[c.get("r")] = value
        return values

    def validations(self, name):
        """[(cells, sheet, column, first_row, last_row)] for list dropdowns that point at a range."""
        xml = self.read(self.sheet_part(name)).decode("utf-8")
        found = []
        for m in re.finditer(r"<x14:dataValidation\b.*?</x14:dataValidation>", xml, re.S):
            f = re.search(r"<xm:f>(.*?)</xm:f>", m.group(0), re.S)
            s = re.search(r"<xm:sqref>(.*?)</xm:sqref>", m.group(0), re.S)
            if f and s:
                found.append((s.group(1), f.group(1)))
        for m in re.finditer(r"<dataValidation\b([^>]*)>(.*?)</dataValidation>", xml, re.S):
            s = re.search(r'\bsqref="([^"]+)"', m.group(1))
            f = re.search(r"<formula1>(.*?)</formula1>", m.group(2), re.S)
            if f and s:
                found.append((s.group(1), f.group(1)))
        out = []
        for sqref, formula in found:
            r = re.fullmatch(r"'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)", formula.strip())
            if r and r.group(2) == r.group(4):
                out.append((expand_sqref(sqref), r.group(1), r.group(2), int(r.group(3)), int(r.group(5))))
        return out


def load_questions(workbook):
    """Questions in order, each with its input cell and options read from the workbook."""
    questions_sheet = workbook.cells("Questions")
    header = {}
    for ref, value in questions_sheet.items():
        col, row = split_ref(ref)
        if row == 1:
            for key, text in QUESTION_HEADERS.items():
                if str(value).strip().lower() == text:
                    header[key] = col
    missing = [k for k in ("question", "option", "tag") if k not in header]
    if missing:
        raise WorkbookError(f"Questions sheet is missing columns: {', '.join(missing)}")

    def at(key, row):
        return str(questions_sheet.get(f"{header[key]}{row}", "")).strip() if key in header else ""

    assessment = workbook.cells("Assessment")
    labels = {}
    for ref, value in assessment.items():
        if re.fullmatch(r"Q\d+", str(value).strip()):
            labels[split_ref(ref)[1]] = (str(value).strip(), ref)
    if not labels:
        raise WorkbookError("no Q1, Q2 … labels found on the Assessment sheet")
    by_row = {}
    for cells, sheet, col, first, last in workbook.validations("Assessment"):
        if sheet != "Questions" or col != header["option"]:
            continue
        for cell in cells:
            by_row.setdefault(split_ref(cell)[1], (cell, first, last))

    questions = []
    for row in sorted(labels):
        qid, label_ref = labels[row]
        if row not in by_row:
            raise WorkbookError(f"{qid} has no answer dropdown; the workbook layout has changed")
        cell, first, last = by_row[row]
        text_col = col_letters(col_number(split_ref(label_ref)[0]) + 1)
        options = []
        for r in range(first, last + 1):
            tag = at("tag", r)
            if not tag:
                raise WorkbookError(f"{qid}: option row {r} on the Questions sheet has no tag")
            options.append({"tag": tag, "option_text": at("option", r),
                            "technical": at("technical", r), "ethical": at("ethical", r)})
        questions.append({
            "id": qid,
            "assessment_cell": cell,
            "question": str(assessment.get(f"{text_col}{row}", "")).strip() or at("question", first),
            "options": options,
        })
    version = at("version", 2)
    return questions, version


def meta_cells(workbook):
    instructions = workbook.cells("Instructions")
    cells = {}
    for key, pattern in META_LABELS.items():
        for ref, value in sorted(instructions.items(), key=lambda kv: split_ref(kv[0])[::-1]):
            if re.search(pattern, str(value), re.I):
                col, row = split_ref(ref)
                cells[key] = f"{col}{row + 1}"
                break
        else:
            raise WorkbookError(f'Instructions sheet has no "{key}" label; the workbook layout has changed')
    return cells


def validate(data, questions):
    errors = []
    if not isinstance(data, dict):
        return {}, {}, ["answers file must be a JSON object with 'meta' and 'answers'"]
    unknown = set(data) - {"meta", "answers"}
    if unknown:
        errors.append(f"unknown top-level keys: {', '.join(sorted(unknown))}")
    answers, meta = data.get("answers", {}), data.get("meta", {})
    if not isinstance(answers, dict):
        errors.append("'answers' must be an object of question id to tag")
        answers = {}
    if not isinstance(meta, dict):
        errors.append("'meta' must be an object of use-case fields")
        meta = {}
    ids = [q["id"] for q in questions]
    for key in sorted(set(answers) - set(ids)):
        errors.append(f"{key}: not a question in this workbook")
    resolved = {}
    for q in questions:
        tag = str(answers.get(q["id"]) or "").strip()
        if not tag:
            errors.append(f"{q['id']}: missing answer")
            continue
        match = [o for o in q["options"] if o["tag"] == tag]
        if not match:
            owner = next((other["id"] for other in questions for o in other["options"] if o["tag"] == tag), None)
            errors.append(f"{q['id']}: tag '{tag}' belongs to {owner}" if owner else f"{q['id']}: unknown tag '{tag}'")
            continue
        resolved[q["assessment_cell"]] = match[0]["option_text"]
    for key in sorted(set(meta) - set(META_LABELS)):
        errors.append(f"meta.{key}: unknown field")
    clean = {}
    for key in META_LABELS:
        value = meta.get(key)
        if value is None or str(value).strip() == "":
            continue
        value = str(value).strip()
        if key == "over_5m_or_drf":
            value = value.upper()
            if value not in ("YES", "NO"):
                errors.append(f"meta.over_5m_or_drf must be YES or NO (got {meta[key]!r})")
        if key == "date_completed":
            try:
                if not DATE.fullmatch(value):
                    raise ValueError(value)
                datetime.datetime.strptime(value, "%d/%m/%Y")
            except ValueError:
                errors.append(f"meta.date_completed must be a real date as dd/mm/yyyy (got {value!r})")
        clean[key] = value
    return resolved, clean, errors


def set_cell_inline(xml, ref, value):
    """Replace a cell with an inline string, keeping its style (s="…")."""
    text = escape(INVALID_XML.sub("", str(value)))
    pattern = re.compile(r'<c r="%s"(?=[\s/>])([^>]*?)(?:/>|>.*?</c>)' % re.escape(ref), re.S)
    m = pattern.search(xml)
    if not m:
        raise WorkbookError(f"cell {ref} not found; the workbook layout has changed")
    style = re.search(r'\ss="\d+"', m.group(1))
    new = f'<c r="{ref}"{style.group(0) if style else ""} t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'
    return xml[:m.start()] + new + xml[m.end():]


def force_recalc(xml):
    """Make Excel recalculate every formula on open, whatever calcPr said before."""
    calc = re.search(r"<calcPr\b[^>]*?/?>", xml)
    if not calc:
        return xml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>')
    tag = re.sub(r'\sfullCalcOnLoad\s*=\s*("[^"]*"|\'[^\']*\')', "", calc.group(0))
    tag = re.sub(r"^<calcPr\b", '<calcPr fullCalcOnLoad="1"', tag)
    return xml[:calc.start()] + tag + xml[calc.end():]


def fill(template, answers_path, out_path):
    with open(answers_path, encoding="utf-8") as f:
        data = json.load(f)
    book = Workbook(template)
    try:
        questions, _ = load_questions(book)
        cells = meta_cells(book)
        resolved, meta, errors = validate(data, questions)
        if errors:
            raise WorkbookError("could not fill the workbook:\n  - " + "\n  - ".join(errors))
        edits = {}
        assessment = book.sheet_part("Assessment")
        xml = book.read(assessment).decode("utf-8")
        for ref, text in resolved.items():
            xml = set_cell_inline(xml, ref, text)
        edits[assessment] = xml
        instructions = book.sheet_part("Instructions")
        xml = book.read(instructions).decode("utf-8")
        for key, value in meta.items():
            xml = set_cell_inline(xml, cells[key], value)
        edits[instructions] = xml
        edits["xl/workbook.xml"] = force_recalc(book.read("xl/workbook.xml").decode("utf-8"))

        out_path = os.path.abspath(out_path)
        if os.path.abspath(template) == out_path:
            raise WorkbookError("--out must be a new file, not the template")
        fd, tmp = tempfile.mkstemp(suffix=".xlsx", dir=os.path.dirname(out_path) or ".")
        os.close(fd)
        try:
            with zipfile.ZipFile(tmp, "w") as out:
                for info in book.zip.infolist():
                    data_bytes = edits[info.filename].encode("utf-8") if info.filename in edits else book.raw(info)
                    out.writestr(info, data_bytes, compress_type=info.compress_type)
            os.replace(tmp, out_path)
        except BaseException:
            os.remove(tmp)
            raise
        return out_path, len(resolved), len(questions), sorted(meta)
    finally:
        book.close()


def require_trusted(url):
    """Only HTTPS URLs on a nsw.gov.au host are fetched, including every redirect."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise WorkbookError(f"refusing to download over an insecure connection: {url}")
    if not WORKBOOK_HOST.search(parsed.hostname or ""):
        raise WorkbookError(f"refusing to download from a host that is not a nsw.gov.au site: {url}")


class TrustedRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        require_trusted(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def read_limited(stream, limit, url):
    chunks, size = [], 0
    while True:
        chunk = stream.read(64 * 1024)
        if not chunk:
            return b"".join(chunks)
        size += len(chunk)
        if size > limit:
            raise WorkbookError(f"{url} is larger than {limit} bytes; refusing it")
        chunks.append(chunk)


def fetch(url, timeout, limit):
    """GET a URL, reading at most limit bytes. Falls back to the system curl (which still
    verifies certificates) when this Python has no CA bundle, as with a python.org install
    on macOS."""
    require_trusted(url)
    request = urllib.request.Request(url, headers={"User-Agent": "nswds-skills"})
    try:
        with urllib.request.build_opener(TrustedRedirects).open(request, timeout=timeout) as response:
            require_trusted(response.geturl())
            return read_limited(response, limit, url)
    except urllib.error.URLError as e:
        if not isinstance(getattr(e, "reason", None), ssl.SSLCertVerificationError):
            raise
        return curl_fetch(url, timeout, e.reason, limit)


def curl_fetch(url, timeout, reason, limit):
    curl = shutil.which("curl")
    if not curl:
        raise WorkbookError(f"Python cannot verify HTTPS certificates ({reason}). Install its certificates "
                            f"or download the workbook yourself from {PAGE_URL}")
    # Redirects are followed one at a time so every address is checked before it is
    # requested, as the urllib path does.
    for _ in range(MAX_REDIRECTS + 1):
        require_trusted(url)
        body, status, location = curl_once(curl, url, timeout, limit)
        if not (300 <= status < 400):
            return body
        if not location:
            raise WorkbookError(f"{url} redirected without a location")
        url = urllib.parse.urljoin(url, location)
    raise WorkbookError(f"more than {MAX_REDIRECTS} redirects fetching {url}")


def curl_once(curl, url, timeout, limit):
    """One request without following redirects. curl writes the status and any redirect
    target after the body."""
    command = [curl, "--fail", "--silent", "--show-error", "--proto", "=https", "--max-time", str(timeout),
               "--max-filesize", str(limit), "--user-agent", "nswds-skills",
               "--write-out", "\n%{http_code} %{redirect_url}", url]
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as process:
        try:
            # The status line follows the body, so allow room for it here and check the
            # body itself against the limit below.
            output = read_limited(process.stdout, limit + 8 * 1024, url)
        except WorkbookError:
            process.kill()
            raise WorkbookError(f"{url} is larger than {limit} bytes; refusing it") from None
        errors = process.stderr.read()
        if process.wait():
            raise WorkbookError(f"could not download {url}: {errors.decode(errors='replace').strip()}")
    body, _, trailer = output.rpartition(b"\n")
    status, _, location = trailer.decode("utf-8", "replace").strip().partition(" ")
    if not status.isdigit():
        raise WorkbookError(f"could not read the response status for {url}")
    if len(body) > limit:
        raise WorkbookError(f"{url} is larger than {limit} bytes; refusing it")
    return body, int(status), location.strip()


def download(directory):
    """Fetch the current workbook, check it, and save it under its published name.
    Always downloads, so a workbook updated under the same name is picked up."""
    page = fetch(PAGE_URL, 60, MAX_PAGE_BYTES).decode("utf-8", "replace")
    links = re.findall(r'href="([^"]+\.xlsx)"', page, re.I)
    links = [l for l in links if "aiaf" in l.lower()] or links
    if not links:
        raise WorkbookError(f"no .xlsx download found on {PAGE_URL}; the page has changed")
    url = urllib.parse.urljoin(PAGE_URL, links[0])
    parsed = urllib.parse.urlparse(url)
    require_trusted(url)
    name = os.path.basename(urllib.parse.unquote(parsed.path))
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._ -]*\.xlsx", name):
        raise WorkbookError(f"unexpected download file name {name!r} on {PAGE_URL}")
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, name)
    if os.path.islink(path) or (os.path.exists(path) and not os.path.isfile(path)):
        raise WorkbookError(f"{path} exists and is not a regular file; refusing to replace it")
    body = fetch(url, 120, MAX_DOWNLOAD_BYTES)
    unchanged = False
    if os.path.isfile(path):
        with open(path, "rb") as f:
            unchanged = f.read() == body
    fd, tmp = tempfile.mkstemp(suffix=".part", dir=directory)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(body)
        book = Workbook(tmp)
        try:
            load_questions(book)
        finally:
            book.close()
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    return path, url, unchanged


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    d = sub.add_parser("download", help="download the current official workbook from Digital NSW")
    d.add_argument("--dir", default=".", help="directory to save it in (default: current directory)")
    q = sub.add_parser("questions", help="print every question, option, tag and description in a workbook")
    q.add_argument("--workbook", required=True)
    q.add_argument("--json", action="store_true", help="print as JSON")
    f = sub.add_parser("fill", help="write answers into a copy of the workbook")
    f.add_argument("--workbook", required=True, help="the official workbook to fill (not modified)")
    f.add_argument("--answers", required=True, help="answers.json")
    f.add_argument("--out", required=True, help="the completed workbook to write")
    args = parser.parse_args(argv)
    try:
        if args.command == "download":
            path, url, unchanged = download(args.dir)
            print(f"Downloaded{' (unchanged since last download)' if unchanged else ''}: {path}\nSource: {url}")
        elif args.command == "questions":
            book = Workbook(args.workbook)
            try:
                questions, version = load_questions(book)
            finally:
                book.close()
            if args.json:
                print(json.dumps({"workbook": os.path.basename(args.workbook), "version": version,
                                  "questions": questions}, indent=2, ensure_ascii=False))
            else:
                print(f"{os.path.basename(args.workbook)}{f' (question set {version})' if version else ''}: "
                      f"{len(questions)} questions. Choose one tag per question.\n")
                for q in questions:
                    print(f"{q['id']} ({q['assessment_cell']}): {q['question']}")
                    for o in q["options"]:
                        print(f"  {o['tag']}: {' '.join(o['option_text'].split())}")
                        if o["technical"]:
                            print(f"      technical: {o['technical']}")
                        if o["ethical"]:
                            print(f"      ethical: {o['ethical']}")
                    print()
        else:
            path, filled, total, meta = fill(args.workbook, args.answers, args.out)
            print(f"Wrote {path}\n  {filled}/{total} answers filled; use-case fields: {', '.join(meta) or 'none'}")
    except (WorkbookError, OSError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
