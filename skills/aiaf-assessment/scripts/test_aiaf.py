"""Tests for aiaf.py. Run: python3 -m unittest discover -s skills/aiaf-assessment/scripts

Set AIAF_WORKBOOK to the official workbook's path to also run the checks against it.
"""
import io
import json
import os
import re
import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout

import aiaf

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def shared(strings):
    items = "".join(f"<si><t>{s}</t></si>" for s in strings)
    return f'<?xml version="1.0" encoding="UTF-8"?><sst {NS} count="{len(strings)}">{items}</sst>'


def sheet(cells, extra=""):
    rows = {}
    for ref, body in cells:
        rows.setdefault(int(re.sub(r"[A-Z]", "", ref)), []).append(body)
    data = "".join(f'<row r="{r}">{"".join(c)}</row>' for r, c in sorted(rows.items()))
    return f'<?xml version="1.0" encoding="UTF-8"?><worksheet {NS}><sheetData>{data}</sheetData>{extra}</worksheet>'


def build_workbook(path, drop_validation=False):
    strings = [
        "Question", "Response (with Qualifying Statement)", "TechnicalDescription", "EthicalDescription", "Tag", "VERSION",
        "What phase?", "Concept - Idea only.", "Planning.", "Weigh necessity.", "phase:concept", "TEST-01",
        "Live - In use.", "Running.", "Monitor.", "phase:live",
        "Who is affected?", "Staff only", "Internal.", "Low reach.", "stakeholder:internal",
        "The public", "External.", "Broad reach.", "stakeholder:public",
        "Q1", "Which lifecycle phase?", "Q2", "Who is affected by the system?",
        "Project Title:", "Project Description", "Is this project valued at over $5M(ETC)?",
        "Who is completing this assessment?:", "Date Completed:dd/mm/yyyy",
    ]
    s = {text: i for i, text in enumerate(strings)}

    def str_cell(ref, text, style=None):
        st = f' s="{style}"' if style else ""
        return ref, f'<c r="{ref}"{st} t="s"><v>{s[text]}</v></c>'

    questions = sheet([
        *[str_cell(f"{col}1", text) for col, text in zip("ABCDEF", strings[:6])],
        str_cell("A2", "What phase?"), str_cell("B2", "Concept - Idea only."), str_cell("C2", "Planning."),
        str_cell("D2", "Weigh necessity."), str_cell("E2", "phase:concept"), str_cell("F2", "TEST-01"),
        str_cell("A3", "What phase?"), str_cell("B3", "Live - In use."), str_cell("C3", "Running."),
        str_cell("D3", "Monitor."), str_cell("E3", "phase:live"),
        str_cell("A4", "Who is affected?"), str_cell("B4", "Staff only"), str_cell("C4", "Internal."),
        str_cell("D4", "Low reach."), str_cell("E4", "stakeholder:internal"),
        str_cell("A5", "Who is affected?"), str_cell("B5", "The public"), str_cell("C5", "External."),
        str_cell("D5", "Broad reach."), str_cell("E5", "stakeholder:public"),
    ])
    q2_validation = "" if drop_validation else (
        '<x14:dataValidation type="list"><x14:formula1><xm:f>Questions!$B$4:$B$5</xm:f></x14:formula1>'
        '<xm:sqref>E4:E5</xm:sqref></x14:dataValidation>')
    extensions = (
        '<extLst><ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" '
        'xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main">'
        '<x14:dataValidations xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main" count="2">'
        '<x14:dataValidation type="list"><x14:formula1><xm:f>Questions!$B$2:$B$3</xm:f></x14:formula1>'
        f'<xm:sqref>E3</xm:sqref></x14:dataValidation>{q2_validation}</x14:dataValidations></ext></extLst>')
    assessment = sheet([
        str_cell("C3", "Q1"), str_cell("D3", "Which lifecycle phase?"), ("E3", '<c r="E3" s="7"/>'),
        ("F3", '<c r="F3"><f>IFERROR(MATCH(E3,Questions!B2:B3,0),"")</f><v></v></c>'),
        str_cell("C4", "Q2"), str_cell("D4", "Who is affected by the system?"), ("E4", '<c r="E4" s="8"/>'),
    ], extensions)
    instructions = sheet([
        str_cell("G4", "Project Title:"), ("G5", '<c r="G5" s="3"/>'),
        str_cell("G7", "Project Description"), ("G8", '<c r="G8" s="4"/>'),
        str_cell("G13", "Is this project valued at over $5M(ETC)?"), ("G14", '<c r="G14" s="5"/>'),
        str_cell("G15", "Who is completing this assessment?:"), ("G16", '<c r="G16"/>'),
        str_cell("G18", "Date Completed:dd/mm/yyyy"), ("G19", '<c r="G19" s="6"><v>1</v></c>'),
    ], '<dataValidations count="1"><dataValidation type="list" sqref="G14"><formula1>"YES, NO"</formula1></dataValidation></dataValidations>')
    book = (f'<?xml version="1.0" encoding="UTF-8"?><workbook {NS} {RNS}><sheets>'
            '<sheet name="Instructions" sheetId="21" r:id="rId2"/><sheet name="Assessment" sheetId="7" r:id="rId3"/>'
            '<sheet name="Questions" sheetId="6" state="hidden" r:id="rId7"/></sheets><calcPr calcId="191029"/></workbook>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?><Relationships '
            'xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId7" Type="worksheet" Target="worksheets/sheet7.xml"/>'
            '<Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/>'
            '<Relationship Id="rId3" Type="worksheet" Target="/xl/worksheets/sheet3.xml"/></Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("xl/workbook.xml", book)
        z.writestr("xl/_rels/workbook.xml.rels", rels)
        z.writestr("xl/sharedStrings.xml", shared(strings))
        z.writestr("xl/worksheets/sheet2.xml", instructions)
        z.writestr("xl/worksheets/sheet3.xml", assessment)
        z.writestr("xl/worksheets/sheet7.xml", questions)
        z.writestr("xl/styles.xml", "<styleSheet/>")


GOOD = {
    "meta": {"project_title": "Chat <pilot> & test", "project_description": "Drafts\x01 replies",
             "over_5m_or_drf": "no", "completed_by": "A. Tester", "date_completed": "23/09/2026"},
    "answers": {"Q1": "phase:live", "Q2": "stakeholder:public"},
}


class AiafTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.template = os.path.join(self.dir.name, "template.xlsx")
        build_workbook(self.template)

    def tearDown(self):
        self.dir.cleanup()

    def write_answers(self, data):
        path = os.path.join(self.dir.name, "answers.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        return path

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = aiaf.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_reads_questions_and_input_cells_from_the_workbook(self):
        book = aiaf.Workbook(self.template)
        try:
            questions, version = aiaf.load_questions(book)
            cells = aiaf.meta_cells(book)
        finally:
            book.close()
        self.assertEqual(version, "TEST-01")
        self.assertEqual([(q["id"], q["assessment_cell"], q["question"]) for q in questions],
                         [("Q1", "E3", "Which lifecycle phase?"), ("Q2", "E4", "Who is affected by the system?")])
        self.assertEqual(questions[0]["options"][1],
                         {"tag": "phase:live", "option_text": "Live - In use.", "technical": "Running.", "ethical": "Monitor."})
        self.assertEqual(cells, {"project_title": "G5", "project_description": "G8", "over_5m_or_drf": "G14",
                                 "completed_by": "G16", "date_completed": "G19"})

    def test_fills_only_input_cells_and_keeps_everything_else(self):
        out = os.path.join(self.dir.name, "filled.xlsx")
        path, filled, total, meta = aiaf.fill(self.template, self.write_answers(GOOD), out)
        self.assertEqual((filled, total), (2, 2))
        self.assertEqual(len(meta), 5)
        with zipfile.ZipFile(self.template) as a, zipfile.ZipFile(path) as b:
            self.assertEqual(a.namelist(), b.namelist())
            changed = [n for n in a.namelist() if a.read(n) != b.read(n)]
            self.assertEqual(changed, ["xl/workbook.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"])
            assessment = b.read("xl/worksheets/sheet3.xml").decode()
            instructions = b.read("xl/worksheets/sheet2.xml").decode()
            self.assertIn('<c r="E3" s="7" t="inlineStr"><is><t xml:space="preserve">Live - In use.</t></is></c>', assessment)
            self.assertIn('<c r="E4" s="8" t="inlineStr"><is><t xml:space="preserve">The public</t></is></c>', assessment)
            self.assertIn("<xm:f>Questions!$B$2:$B$3</xm:f>", assessment, "dropdowns are untouched")
            self.assertIn('<f>IFERROR(MATCH(E3,Questions!B2:B3,0),"")</f>', assessment, "formulas are untouched")
            self.assertIn("Chat &lt;pilot&gt; &amp; test", instructions)
            self.assertIn('<t xml:space="preserve">Drafts replies</t>', instructions, "control characters are removed")
            self.assertIn('<c r="G14" s="5" t="inlineStr"><is><t xml:space="preserve">NO</t></is></c>', instructions)
            self.assertIn('<c r="G19" s="6" t="inlineStr"><is><t xml:space="preserve">23/09/2026</t></is></c>', instructions)
            self.assertIn('<calcPr fullCalcOnLoad="1" calcId="191029"/>', b.read("xl/workbook.xml").decode())
        book = aiaf.Workbook(path)
        try:
            self.assertEqual(book.cells("Assessment")["E3"], "Live - In use.")
        finally:
            book.close()

    def test_leaves_blank_metadata_empty(self):
        out = os.path.join(self.dir.name, "filled.xlsx")
        aiaf.fill(self.template, self.write_answers({"answers": GOOD["answers"], "meta": {"completed_by": " "}}), out)
        with zipfile.ZipFile(out) as z:
            self.assertIn('<c r="G16"/>', z.read("xl/worksheets/sheet2.xml").decode())

    def test_reports_every_problem_before_writing_anything(self):
        out = os.path.join(self.dir.name, "filled.xlsx")
        bad = {"answers": {"Q1": "stakeholder:public", "Q3": "x"},
               "meta": {"over_5m_or_drf": "maybe", "date_completed": "31/02/2026", "owner": "x"}, "extra": 1}
        code, _, err = self.run_cli("fill", "--workbook", self.template, "--answers", self.write_answers(bad), "--out", out)
        self.assertEqual(code, 1)
        for message in ["unknown top-level keys: extra", "Q3: not a question", "Q1: tag 'stakeholder:public' belongs to Q2",
                        "Q2: missing answer", "meta.owner: unknown field", "must be YES or NO", "real date as dd/mm/yyyy"]:
            self.assertIn(message, err)
        self.assertFalse(os.path.exists(out))
        code, _, err = self.run_cli("fill", "--workbook", self.template, "--answers", self.write_answers(GOOD), "--out", self.template)
        self.assertEqual(code, 1)
        self.assertIn("must be a new file", err)

    def test_reports_wrongly_shaped_answers_instead_of_crashing(self):
        out = os.path.join(self.dir.name, "filled.xlsx")
        for bad, message in [({"answers": [], "meta": {}}, "'answers' must be an object"),
                             ({"answers": GOOD["answers"], "meta": "x"}, "'meta' must be an object"),
                             ([], "must be a JSON object")]:
            code, _, err = self.run_cli("fill", "--workbook", self.template, "--answers", self.write_answers(bad), "--out", out)
            self.assertEqual(code, 1, err)
            self.assertIn(message, err)

    def test_requires_a_zero_padded_date(self):
        book = aiaf.Workbook(self.template)
        try:
            questions = aiaf.load_questions(book)[0]
        finally:
            book.close()
        for value in ["1/2/2026", "01/2/2026", "01/02/26", "2026-02-01", "01/02/2026x", "31/02/2026"]:
            _, _, errors = aiaf.validate({"answers": GOOD["answers"], "meta": {"date_completed": value}}, questions)
            self.assertTrue(any("dd/mm/yyyy" in e for e in errors), value)
        _, meta, errors = aiaf.validate({"answers": GOOD["answers"], "meta": {"date_completed": "01/02/2026"}}, questions)
        self.assertEqual((errors, meta["date_completed"]), ([], "01/02/2026"))

    def test_forces_recalculation_whatever_calcpr_says(self):
        self.assertEqual(aiaf.force_recalc('<workbook><calcPr calcId="1" fullCalcOnLoad="0"/></workbook>'),
                         '<workbook><calcPr fullCalcOnLoad="1" calcId="1"/></workbook>')
        self.assertEqual(aiaf.force_recalc("<workbook><calcPr fullCalcOnLoad='false' calcId=\"1\"></calcPr></workbook>"),
                         '<workbook><calcPr fullCalcOnLoad="1" calcId="1"></calcPr></workbook>')
        self.assertEqual(aiaf.force_recalc("<workbook></workbook>"), '<workbook><calcPr fullCalcOnLoad="1"/></workbook>')

    def test_refuses_oversized_or_highly_compressed_packages(self):
        big = os.path.join(self.dir.name, "big.xlsx")
        with zipfile.ZipFile(big, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("xl/workbook.xml", b"0" * (3 * 1024 * 1024))
        code, _, err = self.run_cli("questions", "--workbook", big)
        self.assertEqual(code, 1)
        self.assertIn("compressed more than 200:1", err)
        with self.assertRaises(aiaf.WorkbookError):
            aiaf.check_limits([zipfile.ZipInfo(f"p{i}") for i in range(aiaf.MAX_PARTS + 1)])

    def test_rejects_unknown_tags(self):
        book = aiaf.Workbook(self.template)
        try:
            questions = aiaf.load_questions(book)[0]
        finally:
            book.close()
        _, _, errors = aiaf.validate({"answers": {"Q1": "phase:nope", "Q2": "stakeholder:public"}}, questions)
        self.assertEqual(errors, ["Q1: unknown tag 'phase:nope'"])

    def test_fails_clearly_when_the_layout_changes(self):
        build_workbook(self.template, drop_validation=True)
        code, _, err = self.run_cli("questions", "--workbook", self.template)
        self.assertEqual(code, 1)
        self.assertIn("Q2 has no answer dropdown", err)
        not_xlsx = os.path.join(self.dir.name, "x.xlsx")
        with open(not_xlsx, "w") as f:
            f.write("not a workbook")
        self.assertIn("is not an Excel workbook", self.run_cli("questions", "--workbook", not_xlsx)[2])

    def test_refuses_xml_with_a_dtd(self):
        bomb = self.template + ".bomb.xlsx"
        with zipfile.ZipFile(self.template) as src, zipfile.ZipFile(bomb, "w") as out:
            for info in src.infolist():
                data = src.read(info)
                if info.filename == "xl/sharedStrings.xml":
                    data = b'<?xml version="1.0"?><!DOCTYPE sst [<!ENTITY a "aaaa">]>' + data.split(b"?>", 1)[1]
                out.writestr(info, data)
        code, _, err = self.run_cli("questions", "--workbook", bomb)
        self.assertEqual(code, 1)
        self.assertIn("xl/sharedStrings.xml declares a DTD or entities", err)

    def test_questions_command_prints_text_and_json(self):
        code, out, _ = self.run_cli("questions", "--workbook", self.template)
        self.assertEqual(code, 0)
        self.assertIn("question set TEST-01", out)
        self.assertIn("Q2 (E4): Who is affected by the system?", out)
        self.assertIn("  stakeholder:public: The public", out)
        code, out, _ = self.run_cli("questions", "--workbook", self.template, "--json")
        self.assertEqual(json.loads(out)["questions"][1]["options"][0]["tag"], "stakeholder:internal")

    def test_expands_cell_ranges(self):
        self.assertEqual(aiaf.expand_sqref("E3 E18:E20 A1:B1"), ["E3", "E18", "E19", "E20", "A1", "B1"])
        self.assertEqual(aiaf.col_letters(aiaf.col_number("AB")), "AB")


class DownloadTest(unittest.TestCase):
    """download() with the network replaced by fixed responses."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.workbook = os.path.join(self.dir.name, "fixture.xlsx")
        build_workbook(self.workbook)
        with open(self.workbook, "rb") as f:
            self.body = f.read()
        self.page = b'<a href="/sites/default/files/aiaf-tool.xlsx">Excel</a>'
        self.real_fetch = aiaf.fetch
        aiaf.fetch = lambda url, timeout: self.page if url == aiaf.PAGE_URL else self.body
        self.out = os.path.join(self.dir.name, "out")

    def tearDown(self):
        aiaf.fetch = self.real_fetch
        self.dir.cleanup()

    def test_downloads_validates_and_refreshes(self):
        path, url, unchanged = aiaf.download(self.out)
        self.assertEqual((os.path.basename(path), unchanged), ("aiaf-tool.xlsx", False))
        self.assertEqual(url, "https://www.digital.nsw.gov.au/sites/default/files/aiaf-tool.xlsx")
        self.assertEqual(aiaf.download(self.out)[2], True, "a second download reports the file unchanged")
        with open(path, "wb") as f:
            f.write(b"corrupt")
        aiaf.download(self.out)
        with open(path, "rb") as f:
            self.assertEqual(f.read(), self.body, "a corrupt or stale copy is replaced")
        self.assertEqual(sorted(os.listdir(self.out)), ["aiaf-tool.xlsx"], "no temporary files are left behind")

    def test_rejects_an_invalid_download_and_keeps_nothing(self):
        self.body = b"not a workbook"
        with self.assertRaises(aiaf.WorkbookError):
            aiaf.download(self.out)
        self.assertEqual(os.listdir(self.out), [])

    def test_does_not_write_through_links(self):
        os.makedirs(self.out)
        target = os.path.join(self.dir.name, "elsewhere.txt")
        with open(target, "w") as f:
            f.write("keep")
        os.symlink(target, os.path.join(self.out, "aiaf-tool.xlsx"))
        with self.assertRaisesRegex(aiaf.WorkbookError, "not a regular file"):
            aiaf.download(self.out)
        os.symlink(target, os.path.join(self.out, "aiaf-tool.xlsx.part"))
        os.remove(os.path.join(self.out, "aiaf-tool.xlsx"))
        aiaf.download(self.out)
        with open(target) as f:
            self.assertEqual(f.read(), "keep", "a planted .part link is never written through")

    def test_requires_https_on_a_nsw_gov_au_site(self):
        for href, message in [(b"http://www.digital.nsw.gov.au/a.xlsx", "insecure"),
                              (b"https://example.org/aiaf.xlsx", "not on a nsw.gov.au site")]:
            self.page = b'<a href="' + href + b'">x</a>'
            with self.assertRaisesRegex(aiaf.WorkbookError, message):
                aiaf.download(self.out)
        with self.assertRaisesRegex(aiaf.WorkbookError, "insecure"):
            aiaf.HttpsOnlyRedirects().redirect_request(None, None, 302, "Found", {}, "http://www.digital.nsw.gov.au/a.xlsx")


@unittest.skipUnless(os.environ.get("AIAF_WORKBOOK"), "set AIAF_WORKBOOK to test the official workbook")
class OfficialWorkbookTest(unittest.TestCase):
    def test_official_workbook_layout(self):
        book = aiaf.Workbook(os.environ["AIAF_WORKBOOK"])
        try:
            questions, _ = aiaf.load_questions(book)
            cells = aiaf.meta_cells(book)
        finally:
            book.close()
        self.assertEqual([q["id"] for q in questions], [f"Q{n}" for n in range(1, 17)])
        self.assertEqual([q["assessment_cell"] for q in questions], [f"E{n}" for n in range(3, 19)])
        self.assertTrue(all(o["technical"] and o["ethical"] for q in questions for o in q["options"]))
        self.assertEqual(cells, {"project_title": "G5", "project_description": "G8", "over_5m_or_drf": "G14",
                                 "completed_by": "G16", "date_completed": "G19"})


if __name__ == "__main__":
    unittest.main()
