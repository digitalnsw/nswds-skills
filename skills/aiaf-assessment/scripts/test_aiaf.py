"""Tests for aiaf.py. Run: python3 -m unittest discover -s skills/aiaf-assessment/scripts

Set AIAF_WORKBOOK to the official workbook's path to also run the checks against it.
"""
import io
import json
import os
import re
import tempfile
import types
import unittest
from unittest.mock import patch
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


def build_workbook(path, drop_validation=False, q2_sqref="E4:E5"):
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
        f'<xm:sqref>{q2_sqref}</xm:sqref></x14:dataValidation>')
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


class XmlRuntimeTest(unittest.TestCase):
    def test_refuses_old_python_before_parsing(self):
        with patch.object(aiaf.sys, "version_info", (3, 10, 20)), \
                patch.object(aiaf.expat, "version_info", (2, 7, 4)), \
                patch.object(aiaf.ElementTree, "fromstring") as parse:
            with self.assertRaisesRegex(aiaf.WorkbookError, "Python 3.11 or later"):
                aiaf.parse_xml(b"<root/>", "test.xml")
            parse.assert_not_called()

    def test_refuses_old_expat_even_with_new_python(self):
        with patch.object(aiaf.sys, "version_info", (3, 13, 7)), \
                patch.object(aiaf.expat, "version_info", (2, 7, 1)), \
                patch.object(aiaf.ElementTree, "fromstring") as parse:
            with self.assertRaisesRegex(aiaf.WorkbookError, "Expat 2.7.2 or later"):
                aiaf.parse_xml(b"<root/>", "test.xml")
            parse.assert_not_called()

    def test_accepts_minimum_runtime(self):
        with patch.object(aiaf.sys, "version_info", (3, 11, 0)), \
                patch.object(aiaf.expat, "version_info", (2, 7, 2)):
            self.assertEqual(aiaf.parse_xml(b"<root>ok</root>", "test.xml").text, "ok")

    def test_cli_refuses_old_runtime_before_io(self):
        commands = [
            ["questions", "--workbook", "unused.xlsx"],
            ["fill", "--workbook", "unused.xlsx", "--answers", "unused.json", "--out", "out.xlsx"],
        ]
        for args in commands:
            with self.subTest(command=args[0]), \
                    patch.object(aiaf.expat, "version_info", (2, 7, 1)), \
                    patch.object(aiaf, "Workbook") as workbook, \
                    patch.object(aiaf, "fill") as fill, \
                    redirect_stderr(io.StringIO()) as err:
                self.assertEqual(aiaf.main(args), 1)
                self.assertIn("Update your Python distribution", err.getvalue())
                workbook.assert_not_called()
                fill.assert_not_called()

    def test_direct_entry_points_refuse_old_runtime_before_io(self):
        with patch.object(aiaf.expat, "version_info", (2, 7, 1)), \
                patch.object(aiaf, "check_archive") as check_archive, \
                patch.object(aiaf.zipfile, "ZipFile") as zip_file:
            with self.assertRaisesRegex(aiaf.WorkbookError, "Expat 2.7.2 or later"):
                aiaf.Workbook("unused.xlsx")
            check_archive.assert_not_called()
            zip_file.assert_not_called()

        with patch.object(aiaf.expat, "version_info", (2, 7, 1)), \
                patch("builtins.open") as open_file:
            with self.assertRaisesRegex(aiaf.WorkbookError, "Expat 2.7.2 or later"):
                aiaf.fill("unused.xlsx", "unused.json", "out.xlsx")
            open_file.assert_not_called()


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
        self.assertEqual(aiaf.force_recalc("<workbook><sheets/></workbook>"), '<workbook><sheets/><calcPr fullCalcOnLoad="1"/></workbook>')
        nested = "<workbook><bookViews><workbookView><extLst/></workbookView></bookViews><sheets/><definedNames/></workbook>"
        self.assertEqual(aiaf.force_recalc(nested),
                         '<workbook><bookViews><workbookView><extLst/></workbookView></bookViews><sheets/><definedNames/>'
                         '<calcPr fullCalcOnLoad="1"/></workbook>', "an extLst inside bookViews is not a workbook child")
        self.assertEqual(aiaf.force_recalc('<x:workbook><x:sheets></x:sheets></x:workbook>'),
                         '<x:workbook><x:sheets></x:sheets><x:calcPr fullCalcOnLoad="1"/></x:workbook>')
        self.assertEqual(aiaf.force_recalc('<x:workbook><x:sheets/><x:calcPr calcId="1" fullCalcOnLoad="0"/></x:workbook>'),
                         '<x:workbook><x:sheets/><x:calcPr fullCalcOnLoad="1" calcId="1"/></x:workbook>')
        for broken in ("<workbook></workbook>", "<x:workbook><x:sheets/>", "<other/>"):
            with self.assertRaisesRegex(aiaf.WorkbookError, "workbook layout has changed"):
                aiaf.force_recalc(broken)
        self.assertEqual(aiaf.force_recalc("<workbook><sheets/><definedNames/><pivotCaches/><extLst/></workbook>"),
                         '<workbook><sheets/><definedNames/><calcPr fullCalcOnLoad="1"/><pivotCaches/><extLst/></workbook>')

    def test_refuses_oversized_or_highly_compressed_packages(self):
        big = os.path.join(self.dir.name, "big.xlsx")
        with zipfile.ZipFile(big, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("xl/workbook.xml", b"0" * (3 * 1024 * 1024))
        code, _, err = self.run_cli("questions", "--workbook", big)
        self.assertEqual(code, 1)
        self.assertIn("compressed more than 200:1", err)
        with self.assertRaises(aiaf.WorkbookError):
            aiaf.check_limits([zipfile.ZipInfo(f"p{i}") for i in range(aiaf.MAX_PARTS + 1)])

    def test_checks_the_zip_directory_before_zipfile_reads_it(self):
        many = os.path.join(self.dir.name, "many.xlsx")
        with zipfile.ZipFile(many, "w") as z:
            for i in range(aiaf.MAX_PARTS + 1):
                z.writestr(f"p{i}", b"")

        def ended(parts, directory):
            path = os.path.join(self.dir.name, f"end-{parts}-{directory}.xlsx")
            with open(path, "wb") as f:
                f.write(b"PK\x05\x06" + bytes(4) + parts.to_bytes(2, "little") * 2
                        + directory.to_bytes(4, "little") + bytes(6))
            return path

        real_zipfile = aiaf.zipfile.ZipFile
        aiaf.zipfile.ZipFile = lambda *a, **k: self.fail("zipfile opened a package that should be refused first")
        try:
            for path, message in [(many, f"{aiaf.MAX_PARTS + 1} parts"),
                                  (ended(3, aiaf.MAX_CENTRAL_DIRECTORY + 1), "ZIP directory is"),
                                  (ended(0xFFFF, 10), "ZIP64"),
                                  (self.write_answers({}), "no ZIP end record")]:
                with self.assertRaisesRegex(aiaf.WorkbookError, message):
                    aiaf.Workbook(path)
        finally:
            aiaf.zipfile.ZipFile = real_zipfile

    def rewrite_part(self, name, change, stored=False):
        path = os.path.join(self.dir.name, "changed.xlsx")
        with zipfile.ZipFile(self.template) as src, zipfile.ZipFile(path, "w") as out:
            for info in src.infolist():
                data = src.read(info)
                if info.filename == name:
                    data = change(data)
                out.writestr(info.filename, data, zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
        return path

    def test_reports_malformed_xml_cleanly(self):
        path = self.rewrite_part("xl/sharedStrings.xml", lambda data: data.replace(b"</sst>", b""))
        code, _, err = self.run_cli("questions", "--workbook", path)
        self.assertEqual(code, 1)
        self.assertIn("error: xl/sharedStrings.xml is not valid XML", err)
        self.assertNotIn("Traceback", err)

    def test_whole_sheet_dropdown_ranges_are_cheap(self):
        build_workbook(self.template, q2_sqref="E4:XFD1048576")
        book = aiaf.Workbook(self.template)
        try:
            questions = aiaf.load_questions(book)[0]
        finally:
            book.close()
        self.assertEqual([q["assessment_cell"] for q in questions], ["E3", "E4"])

    def test_refuses_parts_that_are_not_utf8(self):
        def utf16(data):
            text = data.decode("utf-8").replace('encoding="UTF-8"', 'encoding="UTF-16"')
            text = text.replace("?>", '?><!DOCTYPE sst [<!ENTITY a "EXPANDED">]>', 1).replace("<t>Q1</t>", "<t>&a;</t>")
            return text.encode("utf-16")
        cases = [utf16,
                 lambda data: data.decode("utf-8").encode("utf-16-le"),
                 lambda data: data.replace(b'encoding="UTF-8"', b'encoding="ISO-8859-1"')]
        for change in cases:
            path = self.rewrite_part("xl/sharedStrings.xml", change)
            code, _, err = self.run_cli("questions", "--workbook", path)
            self.assertEqual(code, 1)
            self.assertIn("xl/sharedStrings.xml is not UTF-8 XML", err)

    def test_reads_each_part_once(self):
        reads = {}
        real_read = aiaf.zipfile.ZipFile.read

        def counting(zf, name, *args, **kwargs):
            key = getattr(name, "filename", name)
            reads[key] = reads.get(key, 0) + 1
            return real_read(zf, name, *args, **kwargs)
        aiaf.zipfile.ZipFile.read = counting
        try:
            aiaf.fill(self.template, self.write_answers(GOOD), os.path.join(self.dir.name, "filled.xlsx"))
        finally:
            aiaf.zipfile.ZipFile.read = real_read
        self.assertEqual({k: v for k, v in reads.items() if v > 1}, {})

    def test_never_overwrites_the_template_through_another_name(self):
        link = os.path.join(self.dir.name, "link.xlsx")
        os.symlink(self.template, link)
        with open(self.template, "rb") as f:
            before = f.read()
        code, _, err = self.run_cli("fill", "--workbook", self.template, "--answers", self.write_answers(GOOD), "--out", link)
        self.assertEqual(code, 1)
        self.assertIn("must be a new file", err)
        with open(self.template, "rb") as f:
            self.assertEqual(f.read(), before)

    def test_reports_missing_shared_strings_cleanly(self):
        for bad in (b"<v>9999</v>", b"<v>-1</v>", b"<v>x</v>"):
            path = self.rewrite_part("xl/worksheets/sheet3.xml", lambda data: data.replace(b"<v>25</v>", bad, 1))
            code, _, err = self.run_cli("questions", "--workbook", path)
            self.assertEqual(code, 1, bad)
            self.assertIn("error: Assessment!C3 points to shared string", err)
            self.assertNotIn("Traceback", err)

    def test_reports_corrupt_compressed_data_cleanly(self):
        path = self.rewrite_part("xl/sharedStrings.xml", lambda data: data, stored=True)
        with open(path, "rb") as f:
            body = f.read()
        with open(path, "wb") as f:
            f.write(body.replace(b"Which lifecycle phase?", b"Which lifecycle phasX?"))
        code, _, err = self.run_cli("questions", "--workbook", path)
        self.assertEqual(code, 1)
        self.assertIn("error: workbook part xl/sharedStrings.xml is corrupt", err)
        code, _, err = self.run_cli("fill", "--workbook", path, "--answers", self.write_answers(GOOD),
                                    "--out", os.path.join(self.dir.name, "out.xlsx"))
        self.assertEqual(code, 1)
        self.assertIn("is corrupt", err)

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

    def test_refuses_a_dtd_in_a_part_the_script_never_reads(self):
        path = self.rewrite_part("xl/styles.xml", lambda data: b'<?xml version="1.0"?><!DOCTYPE s [<!ENTITY a "x">]>' + data)
        for args in (("questions", "--workbook", path),
                     ("fill", "--workbook", path, "--answers", self.write_answers(GOOD),
                      "--out", os.path.join(self.dir.name, "out.xlsx"))):
            code, _, err = self.run_cli(*args)
            self.assertEqual(code, 1, args[0])
            self.assertIn("xl/styles.xml declares a DTD or entities", err)
        self.assertFalse(os.path.exists(os.path.join(self.dir.name, "out.xlsx")))

    def test_questions_command_prints_text_and_json(self):
        code, out, _ = self.run_cli("questions", "--workbook", self.template)
        self.assertEqual(code, 0)
        self.assertIn("question set TEST-01", out)
        self.assertIn("Q2 (E4): Who is affected by the system?", out)
        self.assertIn("  stakeholder:public: The public", out)
        code, out, _ = self.run_cli("questions", "--workbook", self.template, "--json")
        self.assertEqual(json.loads(out)["questions"][1]["options"][0]["tag"], "stakeholder:internal")

    def test_expands_cell_ranges(self):
        self.assertEqual(aiaf.sqref_ranges("E3 E18:E20 A1:XFD1048576"), [(5, 3, 5, 3), (5, 18, 5, 20), (1, 1, 16384, 1048576)])
        self.assertEqual(aiaf.col_letters(aiaf.col_number("AB")), "AB")


class PlatformSheetTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.questions, self.version = aiaf.load_question_set()
        self.data = {
            "triage": {"approved_tool": "Not sure", "purpose": "Pilot or official agency use", "higher_impact": "Yes"},
            "registration": {"title": "AI-assisted pull request code review", "team": "Design System",
                             "platform": "Other", "platform_other": "GitHub Copilot",
                             "use_case_type": "Quality defect detection",
                             "description": "Reviews pull requests and suggests changes a developer approves."},
            "answers": {q["id"]: q["options"][0]["tag"] for q in self.questions},
        }

    def tearDown(self):
        self.dir.cleanup()

    def write_answers(self, data):
        path = os.path.join(self.dir.name, "answers.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        return path

    def sheet(self, data):
        return aiaf.platform_sheet(self.write_answers(data))

    def problems(self, data):
        with self.assertRaises(aiaf.WorkbookError) as caught:
            self.sheet(data)
        return str(caught.exception)

    def changed(self, **registration):
        data = json.loads(json.dumps(self.data))
        data["registration"].update(registration)
        return data

    def test_loads_the_bundled_question_set(self):
        self.assertEqual([q["id"] for q in self.questions], [f"Q{n}" for n in range(1, 17)])
        self.assertEqual(self.version, "PROD-01")
        self.assertTrue(all(o["technical"] and o["ethical"] for q in self.questions for o in q["options"]))
        section_ids = [qid for _, ids in aiaf.PLATFORM_SECTIONS for qid in ids]
        self.assertEqual(sorted(section_ids), sorted(q["id"] for q in self.questions))

    def test_lists_questions_in_platform_section_order_with_exact_option_text(self):
        out, warnings = self.sheet(self.data)
        self.assertEqual(warnings, [])
        order = re.findall(r"^- \*\*(Q\d+)\.\*\*", out, re.M)
        self.assertEqual(order, [qid for _, ids in aiaf.PLATFORM_SECTIONS for qid in ids])
        self.assertIn(aiaf.one_line(self.questions[0]["options"][0]["option_text"]), out)
        self.assertIn("| Platform | Other (specify: GitHub Copilot) |", out)
        self.assertIn("**Not sure**", out)
        self.assertIn("question set PROD-01", out)

    def test_platform_titles_match_the_reference(self):
        with open(QUESTIONS_MD, encoding="utf-8") as f:
            rows = dict(re.findall(r"^\| (Q\d+) \| (.+) \|$", f.read(), re.M))
        self.assertEqual(rows, aiaf.PLATFORM_TITLES)
        self.assertIn(aiaf.PLATFORM_TITLES["Q12"], self.sheet(self.data)[0])

    def test_platform_reference_matches_the_script(self):
        with open(PLATFORM_MD, encoding="utf-8") as f:
            text = f.read()
        triage = {}
        for question, options in re.findall(r"^\| (.+\?) \| (.+) \|$", text, re.M):
            triage[question] = [re.sub(r" \(.*\)$", "", o.strip()) for o in options.split(" · ")]
        self.assertEqual(triage, {q: opts for q, opts in aiaf.TRIAGE.values()})
        platforms = re.search(r"^\| Platform \| (.+?), or Other\.", text, re.M)[1]
        self.assertEqual(platforms.split(", ") + ["Other"], aiaf.PLATFORMS)
        self.assertIn(f"At most {aiaf.MAX_TITLE_CHARS} characters", text)
        self.assertIn(f"At most {aiaf.MAX_DESCRIPTION_WORDS} words", text)
        types = re.search(r"^Use case types: (.+)\.$", text, re.M)[1]
        self.assertEqual(types.split("; "), aiaf.USE_CASE_TYPES)

    def test_reports_every_problem_at_once(self):
        data = self.changed(title="x" * 65, platform_other="", description="word " * 151, use_case_type=7)
        data["triage"]["purpose"] = "Something else"
        data["answers"]["Q2"] = data["answers"]["Q1"]
        data["answers"]["Q17"] = "phase:live"
        del data["answers"]["Q16"]
        message = self.problems(data)
        for expected in ("triage.purpose", "65 characters", "platform_other", "151 words",
                         "use_case_type must be text", "Q2: tag", "Q16: missing answer",
                         "Q17: not a question in this core question set"):
            self.assertIn(expected, message)

    def test_reports_non_text_values_alongside_other_problems(self):
        data = self.changed(title=123, platform_other=5, description="word " * 151)
        data["triage"] = []
        message = self.problems(data)
        for expected in ("'triage' must be an object", "registration.title must be text",
                         "registration.platform_other must be text", "151 words"):
            self.assertIn(expected, message)

    def test_stops_when_the_product_itself_is_being_assessed(self):
        data = json.loads(json.dumps(self.data))
        data["triage"]["purpose"] = aiaf.PRODUCT_ASSESSMENT
        self.assertIn("procurement, cyber security, privacy or technical assurance", self.problems(data))

    def test_warns_instead_of_failing_on_values_the_platform_may_have_added(self):
        out, warnings = self.sheet(self.changed(platform="New Platform AI", platform_other="Unused",
                                                use_case_type="Coding assistant", team=""))
        self.assertEqual(len(warnings), 4)
        for w in warnings:
            self.assertIn(f"- {w}", out)
        self.assertIn("| Platform | New Platform AI |", out)

    def test_keeps_table_cells_on_one_line(self):
        out, _ = self.sheet(self.changed(team="Data | Analytics", title="Pull request\nreview"))
        self.assertIn("| Team | Data \\| Analytics |", out)
        self.assertIn("| Use case title | Pull request review |", out)

    def test_reads_a_regenerated_block_whatever_its_first_line(self):
        path = os.path.join(self.dir.name, "questions.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write("```text\nmy copy.xlsx (question set PROD-02): 1 questions. Choose one tag per question.\n\n"
                    "Q1 (E3): Phase?\n  phase:live: Live\n      technical: Running\n      ethical: Watch\n\n```\n")
        questions, version = aiaf.load_question_set(path)
        self.assertEqual((len(questions), version), (1, "PROD-02"))

    def test_refuses_an_unreadable_question_set(self):
        path = os.path.join(self.dir.name, "questions.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write("```text\nheader\nQ1 (E3): Phase?\n  phase:live: Live\n      technical: Running\n"
                    "  continued text\n```\n")
        with self.assertRaisesRegex(aiaf.WorkbookError, "unexpected line"):
            aiaf.load_question_set(path)

    def test_writes_the_sheet_only_when_it_succeeds(self):
        out = os.path.join(self.dir.name, "sheet.md")
        with redirect_stdout(io.StringIO()):
            self.assertEqual(aiaf.main(["platform", "--answers", self.write_answers(self.data), "--out", out]), 0)
        with open(out, encoding="utf-8") as f:
            self.assertTrue(f.read().startswith("# AIAF Platform entry sheet"))
        bad = os.path.join(self.dir.name, "bad.md")
        with redirect_stderr(io.StringIO()):
            self.assertEqual(aiaf.main(["platform", "--answers", self.write_answers({"answers": {}}), "--out", bad]), 1)
        self.assertFalse(os.path.exists(bad))
        self.assertEqual([n for n in os.listdir(self.dir.name) if n.endswith(".part")], [])

    def test_does_not_need_the_xml_runtime(self):
        with patch.object(aiaf.expat, "version_info", (2, 7, 1)), redirect_stdout(io.StringIO()) as out:
            self.assertEqual(aiaf.main(["platform", "--answers", self.write_answers(self.data)]), 0)
        self.assertIn("# AIAF Platform entry sheet", out.getvalue())


QUESTIONS_MD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "references", "questions.md")
PLATFORM_MD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "references", "platform.md")


def bundled_question_set():
    """The `questions` output embedded in references/questions.md."""
    with open(QUESTIONS_MD, encoding="utf-8") as f:
        text = f.read()
    match = re.search(r"^```text\n(.*?)^```$", text, re.S | re.M)
    if not match:
        raise AssertionError("references/questions.md has no ```text block")
    return match.group(1)


class BundledQuestionSetTest(unittest.TestCase):
    def test_has_sixteen_questions_each_with_tagged_options(self):
        block = bundled_question_set()
        ids = re.findall(r"^(Q\d+) \(E\d+\): ", block, re.M)
        self.assertEqual(ids, [f"Q{n}" for n in range(1, 17)])
        for chunk in re.split(r"^Q\d+ \(E\d+\): ", block, flags=re.M)[1:]:
            tags = re.findall(r"^  ([a-z_]+:[a-z0-9_]+): ", chunk, re.M)
            self.assertGreaterEqual(len(tags), 2, chunk.splitlines()[0])
            self.assertEqual(len({t.split(":")[0] for t in tags}), 1, "one tag prefix per question")


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

    def test_bundled_question_set_matches_the_workbook(self):
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(aiaf.main(["questions", "--workbook", os.environ["AIAF_WORKBOOK"]]), 0)
        # The first line names the workbook file, which differs between copies.
        printed = out.getvalue().split("\n", 1)[1]
        self.assertEqual(bundled_question_set().split("\n", 1)[1], printed)


if __name__ == "__main__":
    unittest.main()
