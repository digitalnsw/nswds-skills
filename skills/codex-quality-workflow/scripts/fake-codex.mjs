// Test fixture only; not installed as part of the skill.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
let prompt = '';
for await (const piece of process.stdin) prompt += piece;
const packet = prompt.split('\n').find(line => line.startsWith('{"job":'));
const {job, inputs} = JSON.parse(packet);
const args = process.argv.slice(2);
const sandbox = args[args.indexOf('--sandbox') + 1];
if (sandbox !== (job.role === 'repair' ? 'workspace-write' : 'read-only')) process.exit(7);
if (args.includes('--dangerously-bypass-approvals-and-sandbox')) process.exit(8);
const expectedEffort=job.reasoningEffort??(job.role==='senior'?'medium':'high');
if(!args.includes(`model_reasoning_effort="${expectedEffort}"`)) process.exit(9);
const output = args[args.indexOf('-o') + 1];
const attempt = Number(basename(dirname(output)).split('-')[1]);
let report = {
  review: {base_sha: job.baseSha, head_sha: job.headSha, reviewer: job.role, target: job.target},
  completion: {status: 'COMPLETE', remaining_scope: [], continuation_notes: ''},
  findings: job.role === 'triage' ? inputs[0].findings.map(f => ({...f, status:'CONFIRMED'})) : [],
  coverage: {passes_completed: job.passes, commands_run: [], not_run: [], clean_areas: ['fixture']}
};
if (job.role === 'repair-review') report.review.assigned_finding_ids = inputs.map(f => f.id);
if (job.scope === 'wrong-repair-scope') report.review.assigned_finding_ids = [];
if (job.scope === 'narration-first' && attempt === 1) {
  writeFileSync(output, 'Reading the core source next...'); process.exit(0);
}
if (job.scope === 'partial-first' && attempt === 1 || job.scope === 'always-partial') {
  report.completion = {status:'PARTIAL', remaining_scope:['registry'], continuation_notes:'Inspect registry next'};
}
if (job.scope === 'wrong-sha') report.review.head_sha = 'a'.repeat(40);
if (job.scope === 'missing-pass') report.coverage.passes_completed = [];
if (job.scope === 'missing-id') report.findings = [];
if (job.scope === 'mutates-review') writeFileSync(join(job.repository, 'illegal.txt'), 'mutation');
if (job.role === 'repair') {
  writeFileSync(join(job.repository, 'unaccepted.txt'), 'repair content');
  report = {status:'PARTIAL', finding_id:inputs[0].id, summary:'Cannot finish', tests:[]};
  if (job.scope === 'repair-deferred') report = {
    implementation:'COMPLETE', verification:'DEFERRED', finding_ids:inputs.map(f=>f.id),
    summary:'Implemented the assigned batch; browser execution requires parent permissions.',
    tests:['BLOCKED: browser test; sandbox cannot bind loopback'], remaining_work:[]
  };
}
writeFileSync(output, JSON.stringify(report));
console.log(JSON.stringify({type:'turn.completed'}));
