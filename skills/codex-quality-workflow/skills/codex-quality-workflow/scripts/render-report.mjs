#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const line = value => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/</g, '&lt;');
export function renderReport(report) {
  const findings = report.findings ?? [];
  const out = ['# Code review', '', `${findings.length} finding(s). These are review results, not completed repairs.`, ''];
  if (report.completion?.status !== 'COMPLETE') out.push('Review incomplete; remaining scope: '+(report.completion?.remaining_scope??[]).map(line).join(', '), '');
  for (const f of findings) {
    out.push(`## ${line(f.id)} — ${line(f.title)}`, '',
      `${line(f.severity)} · ${line(f.status)}`, '', line(f.observed_behavior), '',
      'Impact: '+line(f.consequence), '', 'Required outcome: '+line(f.required_outcome), '');
    if (f.decision_question) out.push('Decision needed: '+line(f.decision_question), '');
    out.push('Location: '+(f.locations??[]).map(l=>line(l.path)+':'+l.line).join(', '), '');
  }
  if (!findings.length) out.push('No findings reported. This is not proof that unrun gates passed.', '');
  if (report.coverage?.not_run?.length) out.push('## Coverage gaps', '', ...report.coverage.not_run.map(g=>'- '+line(g)), '');
  out.push('Reviewed: '+line(report.review?.base_sha)+' → '+line(report.review?.head_sha));
  return out.join('\n')+'\n';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const rendered=renderReport(JSON.parse(readFileSync(process.argv[2],'utf8')));
    if(process.argv[3]) writeFileSync(process.argv[3],rendered);
    console.log(rendered);
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
