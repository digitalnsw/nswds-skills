#!/usr/bin/env python3
"""Prepare an NSW AI Assessment Framework (AIAF) assessment for the AIAF Platform, or
read and fill the offline AIAF Excel workbook.

`platform` turns answers.json into an entry sheet for the AIAF Platform, using the
core question set bundled in references/questions.md and the Platform's triage and
registration lists below.

For the offline workbook (requested from Digital NSW), the workbook is the single
source of truth:
questions, answer options, their technical and ethical descriptions, tags and the
position of every input cell are read from the workbook itself, so a new release of
the workbook is picked up without changing this script.

Filling edits only the answer and use-case input cells inside the .xlsx package,
as inline strings that keep each cell's existing style. Formulas, dropdowns,
formatting and every other sheet stay byte-for-byte the same, and Excel is told to
recalculate on open so it computes the risk scores, DeepDive, Risk Register and
Audit Record from the answers.

    python3 aiaf.py questions --workbook FILE [--json]
    python3 aiaf.py fill --workbook FILE --answers answers.json --out FILE
    python3 aiaf.py platform --answers answers.json [--out FILE]

Standard library only. `questions` and `fill` need Python 3.11 or later with Expat
2.7.2 or later; `platform` reads no workbook XML and has no such requirement.
"""
import argparse
import datetime
import json
import os
import re
import sys
import tempfile
import zipfile
import zlib
from xml.etree import ElementTree
from xml.parsers import expat
from xml.sax.saxutils import escape

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
# The official workbook has about 70 parts and 8 MB unpacked; these limits sit far above
# that and stop a crafted file from exhausting memory.
MAX_PARTS = 2000
MAX_PART_SIZE = 50 * 1024 * 1024
MAX_TOTAL_SIZE = 200 * 1024 * 1024
MAX_RATIO = 200
# zipfile reads the whole central directory when a file is opened, one record of at least
# 46 bytes per part, so its size is checked first. The official workbook's is under 10 KB.
MAX_CENTRAL_DIRECTORY = 1024 * 1024

# AIAF Platform (https://aiaf.dac.nsw.gov.au): the core questions come from the
# bundled question set; the triage questions and registration lists below are the
# Platform's own and have no workbook equivalent.
QUESTION_SET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "references", "questions.md")
PLATFORM_SECTIONS = [
    ("System context", ["Q1", "Q2", "Q3", "Q16"]),
    ("Data & deployment", ["Q4", "Q5", "Q6"]),
    ("Risk & impact", ["Q7", "Q8", "Q9", "Q11", "Q12"]),
    ("Governance & oversight", ["Q10", "Q13", "Q14", "Q15"]),
]
# Question titles the Platform words differently from the workbook. Options match the workbook text,
# apart from one punctuation difference recorded in references/questions.md.
PLATFORM_TITLES = {
    "Q2": "What type of AI System are you assessing?",
    "Q4": "Which of the following best describes the data your system primarily uses? (If multiple apply, "
          "select the category with the highest sensitivity or risk)",
    "Q9": "What level of autonomy does the system operate at?",
    "Q10": "What level of human oversight or governance is applied to system's decisions and behaviour?",
    "Q12": "What is the potential impact of a failure or error by the AI system?",
}
TRIAGE = {
    "approved_tool": ("Will this use case use an agency-approved AI platform, product or tool?",
                      ["Yes", "No", "Not sure"]),
    "purpose": ("What are you using AI for?",
                ["Personal, non-agency use", "Individual work productivity", "Controlled experiment or prototype",
                 "Pilot or official agency use", "Assessing the product or platform itself", "Not sure"]),
    "higher_impact": ("Does this use involve higher-impact activity or information?", ["Yes", "No", "Not sure"]),
}
PLATFORMS = ["Azure OpenAI", "Custom model service", "Microsoft 365 Copilot", "Salesforce Einstein", "Other"]
USE_CASE_TYPES = [
    "Agent orchestration", "Anomaly detection", "Case intake triage", "Compliance monitoring", "Content ideation",
    "Conversational assistant", "Data exploration assistant", "Data to narrative", "Document drafting",
    "Document editing and rewriting", "Document summarisation", "Document understanding", "Duplicate detection",
    "Email triage", "Entity extraction", "Experimental / research use", "FAQ self-service",
    "Field extraction (forms)", "Fraud detection", "Identity access anomaly detection", "Insight generation",
    "Intelligent routing", "Knowledge base question answering", "Metadata tagging", "Model monitoring",
    "Personal productivity assistant", "Propensity scoring", "Quality defect detection", "RAG knowledge assistant",
    "Recommendation engine", "Redaction / de-identification", "Report generation", "Research assistant",
    "Resource allocation optimisation", "Risk scoring", "Root cause analysis support", "RPA augmentation",
    "Safety quality monitoring", "Scenario analysis", "Scheduling optimisation", "Security threat detection",
    "Semantic search assistant", "Sensitive information detection", "Slide deck generation", "Summarisation",
    "Template population", "Text drafting", "Text rewriting / editing", "Time series forecasting",
    "Topic modelling", "Transcription", "Translation", "Trend detection", "Visual content generation",
    "Workflow automation", "Other",
]
REGISTRATION_FIELDS = ["title", "team", "platform", "platform_other", "use_case_type", "description"]
MAX_TITLE_CHARS = 64
MAX_DESCRIPTION_WORDS = 150
PRODUCT_ASSESSMENT = "Assessing the product or platform itself"


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


def sqref_ranges(sqref):
    """'E3 E18:E20' -> [(5, 3, 5, 3), (5, 18, 5, 20)] as (first col, first row, last col,
    last row). Ranges are kept as bounds, never expanded, so a whole-sheet range is cheap."""
    ranges = []
    for part in sqref.split():
        start, _, end = part.partition(":")
        c0, r0 = split_ref(start)
        c1, r1 = split_ref(end or start)
        ranges.append((col_number(c0), r0, col_number(c1), r1))
    return ranges


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


def require_xml_runtime():
    """Check the linked parser as well as Python: distributors can ship older Expat."""
    if sys.version_info < (3, 11) or expat.version_info < (2, 7, 2):
        raise WorkbookError(
            "Python 3.11 or later with Expat 2.7.2 or later is required to read workbooks; "
            f"found Python {sys.version.split()[0]} with {expat.EXPAT_VERSION}. "
            "Update your Python distribution (and its linked Expat library)."
        )


def parse_xml(data, name):
    """Parse a workbook part already screened by Workbook.read."""
    require_xml_runtime()
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
        require_xml_runtime()
        self.path = path
        check_archive(path)
        try:
            self.zip = zipfile.ZipFile(path)
        except (OSError, zipfile.BadZipFile) as e:
            raise WorkbookError(f"{path} is not an Excel workbook: {e}")
        try:
            check_limits(self.zip.infolist())
            # Screen every XML part, not only the ones read below, so a DTD cannot sit in an
            # unused part and be carried into a filled workbook. Screened parts are kept, so
            # each is decompressed once.
            self._screened = {}
            for info in self.zip.infolist():
                if info.filename.lower().endswith((".xml", ".rels", ".vml")):
                    self._screened[info.filename] = self._screen(info.filename, self.raw(info))
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

    @staticmethod
    def _screen(name, data):
        """Spreadsheet XML is UTF-8 and never declares a DTD, so refusing anything else blocks
        entity-expansion and external-entity attacks from a crafted workbook. The encoding is
        checked first because the parser also accepts UTF-16, which hides a DTD from a byte
        search."""
        body = data[3:] if data.startswith(b"\xef\xbb\xbf") else data
        declared = re.match(rb"\s*<\?xml[^>]*?\bencoding\s*=\s*[\"']([^\"']+)", body)
        if b"\x00" in body or data[:2] in (b"\xff\xfe", b"\xfe\xff") or (
                declared and declared.group(1).lower() not in (b"utf-8", b"utf8")):
            raise WorkbookError(f"{name} is not UTF-8 XML; refusing to read it")
        try:
            body.decode("utf-8")
        except UnicodeDecodeError:
            raise WorkbookError(f"{name} is not UTF-8 XML; refusing to read it") from None
        if re.search(rb"<!\s*(DOCTYPE|ENTITY)", body, re.I):
            raise WorkbookError(f"{name} declares a DTD or entities; refusing to read it")
        return data

    def read(self, name):
        """A screened XML package part."""
        if name in self._screened:
            return self._screened[name]
        return self._screen(name, self.raw(name))

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
        """[(ranges, sheet, column, first_row, last_row)] for list dropdowns that point at a range."""
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
                out.append((sqref_ranges(sqref), r.group(1), r.group(2), int(r.group(3)), int(r.group(5))))
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
    for ranges, sheet, col, first, last in workbook.validations("Assessment"):
        if sheet != "Questions" or col != header["option"]:
            continue
        for c0, r0, _, r1 in ranges:
            for row in labels:
                if r0 <= row <= r1:
                    by_row.setdefault(row, (f"{col_letters(c0)}{row}", first, last))

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


def validate(data, questions, source="workbook"):
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
        errors.append(f"{key}: not a question in this {source}")
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
    """Make Excel recalculate every formula on open, whatever calcPr said before. The root
    may use a namespace prefix, which new and existing elements share."""
    root = re.search(r"<(\w+:)?workbook\b", xml)
    if not root:
        raise WorkbookError("xl/workbook.xml has no workbook element; the workbook layout has changed")
    prefix = root.group(1) or ""
    calc = re.search(r"<%scalcPr\b[^>]*?/?>" % re.escape(prefix), xml)
    if calc:
        tag = re.sub(r'\sfullCalcOnLoad\s*=\s*("[^"]*"|\'[^\']*\')', "", calc.group(0))
        tag = re.sub(r"^<%scalcPr\b" % re.escape(prefix), f'<{prefix}calcPr fullCalcOnLoad="1"', tag)
        return xml[:calc.start()] + tag + xml[calc.end():]
    # calcPr is a direct child of workbook: after sheets (and definedNames), before these.
    # Search only after sheets, so an extLst nested in bookViews is not matched.
    sheets = re.search(r"</%(p)ssheets>|<%(p)ssheets\b[^>]*/>" % {"p": re.escape(prefix)}, xml)
    close = re.search(r"</%sworkbook>\s*$" % re.escape(prefix), xml)
    if not sheets or not close:
        raise WorkbookError("xl/workbook.xml has no sheets or closing workbook element; the workbook layout has changed")
    later = re.compile(r"<%s(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing"
                       r"|fileRecoveryPr|webPublishObjects|extLst)\b" % re.escape(prefix)).search(xml, sheets.end(), close.start())
    at = later.start() if later else close.start()
    return xml[:at] + f'<{prefix}calcPr fullCalcOnLoad="1"/>' + xml[at:]


def fill(template, answers_path, out_path):
    require_xml_runtime()
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
        if os.path.abspath(template) == out_path or (os.path.exists(out_path) and os.path.samefile(template, out_path)):
            raise WorkbookError("--out must be a new file, not the template")
        fd, tmp = tempfile.mkstemp(suffix=".xlsx", dir=os.path.dirname(out_path) or ".")
        os.close(fd)
        try:
            with zipfile.ZipFile(tmp, "w") as out:
                for info in book.zip.infolist():
                    if info.filename in edits:
                        data_bytes = edits[info.filename].encode("utf-8")
                    else:
                        data_bytes = book._screened.get(info.filename) or book.raw(info)
                    out.writestr(info, data_bytes, compress_type=info.compress_type)
            os.replace(tmp, out_path)
        except BaseException:
            os.remove(tmp)
            raise
        return out_path, len(resolved), len(questions), sorted(meta)
    finally:
        book.close()


def one_line(value):
    """Text collapsed to one line, as the Platform and the entry sheet show it."""
    return " ".join(str(value or "").split())


def load_question_set(path=QUESTION_SET):
    """The core questions from the bundled question set (the `questions` output kept in
    references/questions.md), in the same shape load_questions returns, plus the
    question set version named on the block's first line."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    match = re.search(r"^```text\n(.*?)^```$", text, re.S | re.M)
    if not match:
        raise WorkbookError(f"{path} has no question set block")
    header, _, body = match.group(1).partition("\n")
    version = re.search(r"\(question set ([^)]+)\)", header)
    questions, option = [], None
    for line in body.splitlines():
        if m := re.fullmatch(r"(Q\d+) \((E\d+)\): (.+)", line):
            questions.append({"id": m[1], "assessment_cell": m[2], "question": m[3], "options": []})
            option = None
        elif m := re.fullmatch(r"      (technical|ethical): (.*)", line):
            if option is None:
                raise WorkbookError(f"{path}: description before any option: {line!r}")
            option[m[1]] = m[2]
        elif m := re.fullmatch(r"  ([a-z_]+:[a-z0-9_]+): (.+)", line):
            if not questions:
                raise WorkbookError(f"{path}: option before any question: {line!r}")
            option = {"tag": m[1], "option_text": m[2], "technical": "", "ethical": ""}
            questions[-1]["options"].append(option)
        elif line.strip():
            raise WorkbookError(f"{path}: unexpected line in the question set: {line!r}")
    if not questions:
        raise WorkbookError(f"{path} lists no questions")
    return questions, version[1] if version else ""


def check_platform_fields(data):
    """Problems (which stop the entry sheet) and warnings (which are shown on it) for
    the triage and registration parts of a Platform answers file."""
    errors, warnings = [], []
    triage = data.get("triage", {})
    if not isinstance(triage, dict):
        errors.append("'triage' must be an object")
        triage = {}
    for key in sorted(set(triage) - set(TRIAGE)):
        errors.append(f"triage.{key}: unknown field")
    for key, (_, options) in TRIAGE.items():
        value = triage.get(key)
        if value is None:
            errors.append(f"triage.{key}: missing answer")
        elif value not in options:
            errors.append(f"triage.{key} must be one of: {'; '.join(options)} (got {value!r})")
    if triage.get("purpose") == PRODUCT_ASSESSMENT:
        errors.append("triage.purpose is \"Assessing the product or platform itself\": the AIAF assesses a use "
                      "of AI, not a product or platform on its own. Use the agency's procurement, cyber security, "
                      "privacy or technical assurance process instead, or describe the use case and triage that")
    reg = data.get("registration", {})
    if not isinstance(reg, dict):
        errors.append("'registration' must be an object")
        reg = {}
    for key in sorted(set(reg) - set(REGISTRATION_FIELDS)):
        errors.append(f"registration.{key}: unknown field")
    text = {}
    for key in REGISTRATION_FIELDS:
        value = reg.get(key)
        if value is not None and not isinstance(value, str):
            errors.append(f"registration.{key} must be text")
        text[key] = one_line(value) if isinstance(value, str) else ""
    if not text["title"]:
        errors.append("registration.title: missing")
    elif len(text["title"]) > MAX_TITLE_CHARS:
        errors.append(f"registration.title is {len(text['title'])} characters; the Platform allows {MAX_TITLE_CHARS}")
    if not text["team"]:
        warnings.append("Team is blank; fill it in on the Platform")
    platform = text["platform"]
    if not platform:
        errors.append("registration.platform: missing")
    elif platform not in PLATFORMS:
        warnings.append(f"Platform \"{platform}\" was not in the Platform's list ({'; '.join(PLATFORMS)}); "
                        "check the list when registering")
    if platform == "Other" and not text["platform_other"]:
        errors.append("registration.platform_other: name the platform when platform is Other")
    elif platform != "Other" and text["platform_other"]:
        warnings.append(f"platform_other \"{text['platform_other']}\" is only asked for when Platform is Other")
    if not text["use_case_type"]:
        errors.append("registration.use_case_type: missing")
    elif text["use_case_type"] not in USE_CASE_TYPES:
        warnings.append(f"Use case type \"{text['use_case_type']}\" was not in the Platform's list; "
                        "check the list when registering")
    words = len(text["description"].split())
    if not words:
        errors.append("registration.description: missing")
    elif words > MAX_DESCRIPTION_WORDS:
        errors.append(f"registration.description is {words} words; the Platform allows {MAX_DESCRIPTION_WORDS}")
    return errors, warnings, text


def platform_sheet(answers_path, question_set=QUESTION_SET):
    """An entry sheet for the AIAF Platform: triage, registration and the exact option
    text to choose for each core question, in the Platform's section order."""
    with open(answers_path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise WorkbookError("answers file must be a JSON object with 'triage', 'registration' and 'answers'")
    questions, version = load_question_set(question_set)
    extra = set(data) - {"triage", "registration", "answers"}
    errors = [f"unknown top-level keys: {', '.join(sorted(extra))}"] if extra else []
    field_errors, warnings, reg = check_platform_fields(data)
    errors += field_errors
    resolved, _, answer_errors = validate({"answers": data.get("answers", {})}, questions, source="core question set")
    errors += answer_errors
    if errors:
        raise WorkbookError("could not build the Platform entry sheet:\n  - " + "\n  - ".join(errors))
    by_id = {q["id"]: q for q in questions}

    def cell(value):
        # A literal | would end the Markdown table cell.
        return one_line(value).replace("|", "\\|")

    lines = ["# AIAF Platform entry sheet", ""]
    if version:
        lines += [f"Core questions: question set {version}. If the Platform's questions or options differ, "
                  "follow the Platform.", ""]
    if warnings:
        lines += ["Check before entering:", ""] + [f"- {w}" for w in warnings] + [""]
    lines += ["## 1. Triage", ""]
    for n, (key, (question, _)) in enumerate(TRIAGE.items(), 1):
        lines.append(f"{n}. {question}  \n   **{data['triage'][key]}**")
    platform = cell(reg["platform"]) + (f" (specify: {cell(reg['platform_other'])})" if reg["platform"] == "Other" else "")
    lines += ["", "## 2. Register the use case", "",
              "Agency, business owner and owner email are filled in from your sign-in.", "",
              "| Field | Enter |", "| --- | --- |",
              f"| Use case title | {cell(reg['title'])} |",
              f"| Team | {cell(reg['team'])} |",
              f"| Platform | {platform} |",
              f"| Use case type | {cell(reg['use_case_type'])} |",
              f"| Description | {cell(reg['description'])} |",
              "", "## 3. Assessment"]
    for section, ids in PLATFORM_SECTIONS:
        lines += ["", f"### {section}", ""]
        for qid in ids:
            q = by_id[qid]
            title = PLATFORM_TITLES.get(qid, q["question"])
            lines.append(f"- **{qid}.** {title}  \n  {one_line(resolved[q['assessment_cell']])}")
    return "\n".join(lines) + "\n", warnings


def write_text(path, text):
    """Write text to path only once it is complete, so a failed run leaves nothing behind."""
    path = os.path.abspath(path)
    fd, tmp = tempfile.mkstemp(suffix=".part", dir=os.path.dirname(path) or ".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    return path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    q = sub.add_parser("questions", help="print every question, option, tag and description in a workbook")
    q.add_argument("--workbook", required=True)
    q.add_argument("--json", action="store_true", help="print as JSON")
    f = sub.add_parser("fill", help="write answers into a copy of the workbook")
    f.add_argument("--workbook", required=True, help="the official workbook to fill (not modified)")
    f.add_argument("--answers", required=True, help="answers.json")
    f.add_argument("--out", required=True, help="the completed workbook to write")
    p = sub.add_parser("platform", help="write an AIAF Platform entry sheet from answers.json")
    p.add_argument("--answers", required=True, help="answers.json with triage, registration and answers")
    p.add_argument("--out", help="the Markdown file to write (default: print it)")
    args = parser.parse_args(argv)
    try:
        # Refuse an unsupported runtime before reading or creating any files. The
        # Platform entry sheet reads no workbook XML, so it does not need the check.
        if args.command != "platform":
            require_xml_runtime()
        if args.command == "questions":
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
                        print(f"  {o['tag']}: {one_line(o['option_text'])}")
                        if o["technical"]:
                            print(f"      technical: {o['technical']}")
                        if o["ethical"]:
                            print(f"      ethical: {o['ethical']}")
                    print()
        elif args.command == "platform":
            sheet, warnings = platform_sheet(args.answers)
            for w in warnings:
                print(f"warning: {w}", file=sys.stderr)
            if args.out:
                print(f"Wrote {write_text(args.out, sheet)}")
            else:
                print(sheet, end="")
        else:
            path, filled, total, meta = fill(args.workbook, args.answers, args.out)
            print(f"Wrote {path}\n  {filled}/{total} answers filled; use-case fields: {', '.join(meta) or 'none'}")
    except (WorkbookError, OSError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
