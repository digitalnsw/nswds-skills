#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const engine=root.endsWith('claude-code-quality-workflow')?'claude':'codex';
const skill=engine==='claude'?join(root,'.claude/quality-workflow'):join(root,'skills/codex-quality-workflow');
const repo=realpathSync(mkdtempSync(join(tmpdir(),'quality-batches-')));
const run=(bin,args,expected=0)=>{
 const r=spawnSync(bin,args,{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024});
 assert.equal(r.status,expected,r.stdout+r.stderr);return r.stdout+r.stderr;
};
const git=(...args)=>run('git',args).trim();
const script=(name,...args)=>run(name.endsWith('.sh')?'bash':process.execPath,[join(skill,'scripts',name),...args]);
const call=(...args)=>script('repair-state.mjs',...args);
const fail=(...args)=>run(process.execPath,[join(skill,'scripts/repair-state.mjs'),...args],1);
const save=(p,v)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,typeof v==='string'?v:JSON.stringify(v));};
git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
save(join(repo,'source.txt'),'base');git('add','.');git('commit','-m','base');
git('switch','-c','feature');
save(join(repo,'source.txt'),'feature');
save(join(repo,'.'+engine+'/quality-workflow/validation.commands'),"node -e 'const f=require(\"fs\");const p=\".git/full-count\";f.writeFileSync(p,String(Number(f.existsSync(p)?f.readFileSync(p):0)+1))'\n");
git('add','.');git('commit','-m','feature');script('freeze.sh');script('prepare-review.sh','initial');
const state=join(repo,'.git',engine+'-quality-workflow');
const read=p=>JSON.parse(readFileSync(join(state,p),'utf8'));
const evidence=()=>JSON.parse(readFileSync(join(readFileSync(join(state,'current-evidence.env'),'utf8').split('\n').find(x=>x.startsWith('EVIDENCE_DIR=')).slice(13),'manifest.json'),'utf8'));
const initial=evidence();
assert.equal(initial.validation.phase,'quick');
script('run-full-validation.sh');
assert.equal(readFileSync(join(repo,'.git/full-count'),'utf8'),'1','Initial full gate runs once alongside review');
const fixture=JSON.parse(readFileSync(join(skill,'examples/findings.example.json'),'utf8'));
fixture.review.base_sha=initial.baseSha;fixture.review.head_sha=initial.headSha;
fixture.findings=[1,2,3].map(n=>({...fixture.findings[0],id:'R-00'+n,title:'Fix '+n}));
const triage=join(state,'triage.json');save(triage,fixture);call('init');
// Resume a pre-v3 run with singular findingId and no plan, preserving its base.
const legacyHead=head();
save(join(state,'repair-state.json'),{implementationCommit:legacyHead,acceptedCommit:legacyHead,acceptedFindings:[]});
save(join(state,'repair-candidate.json'),{findingId:'R-001',baseCommit:legacyHead,candidateCommit:legacyHead,candidateTree:git('rev-parse','HEAD^{tree}')});
call('status');call('plan',triage);
assert.equal(read('repair-state.json').acceptedCommit,legacyHead);
assert.equal(read('repair-state.json').version,3);
assert.match(fail('init'),/state already exists/);
const index=git('write-tree'), original=head();
function head(){return git('rev-parse','HEAD');}
const plan=join(state,'checks.json');
save(plan,{scope:'targeted',reason:'Check the current source outcome',commands:[[process.execPath,'-e','if(!require("fs").readFileSync("source.txt","utf8").includes("repair"))process.exit(1)']]});
const review=join(state,'review.json');
function cleanReview(){
 const c=read('repair-candidate.json');
 save(review,{...fixture,review:{base_sha:c.baseCommit,head_sha:c.candidateCommit,reviewer:'independent fixture',target:'repair-diff'},findings:[]});
}
save(join(repo,'source.txt'),'repair first batch');
call('candidate','R-001,R-002');cleanReview();
assert.match(fail('checkpoint','R-001,R-002',review),/verification is missing/);
call('verify',plan);
const bad=JSON.parse(readFileSync(review));bad.review.head_sha='a'.repeat(40);save(join(state,'bad-review.json'),bad);
assert.match(fail('checkpoint','R-001,R-002',join(state,'bad-review.json')),/different snapshot/);
call('checkpoint','R-001,R-002',review);
assert.equal(read('repair-state.json').acceptedFindings.length,0);
assert.equal(read('repair-state.json').checkpointedFindings.length,2);
assert.match(call('status'),/3 actionable; 2 implemented; 2 verified; 2 independently reviewed; 0 accepted/);
assert.match(fail('finalize',review),/unresolved findings: R-003/);
call('check');
save(join(repo,'source.txt'),'repair second batch');call('candidate','R-003');cleanReview();
save(join(state,'failing.json'),{scope:'targeted',reason:'Failure fixture',commands:[[process.execPath,'-e','process.exit(3)']]});
assert.match(fail('verify',join(state,'failing.json')),/FAILED/);
assert.match(fail('checkpoint','R-003',review),/failed or is stale/);
const failedReceipt=read('repair-verification.json').receiptPath;
assert.match(fail('verify',plan),/previous verification failed/);
const resolution={cause:'Fixture intentionally exited 3; use the actual source assertion',evidence:[failedReceipt]};
// Source mutation is preserved, never accepted or reset automatically.
save(join(state,'mutating.json'),{scope:'targeted',reason:'Mutation tripwire fixture',resolution,commands:[[process.execPath,'-e','require("fs").writeFileSync("source.txt","unexpected")']]});
assert.match(fail('verify',join(state,'mutating.json')),/SOURCE_CHANGED/);
assert.equal(readFileSync(join(repo,'source.txt'),'utf8'),'unexpected');
save(join(repo,'source.txt'),'repair second batch');
const restoredPlan=JSON.parse(readFileSync(plan));
restoredPlan.resolution={cause:'Fixture restored exact pre-mutation source; mutation was a deliberately injected diagnostic command',evidence:[read('repair-verification.json').receiptPath]};
save(plan,restoredPlan);call('verify',plan);
assert.equal(JSON.parse(readFileSync(failedReceipt)).status,'FAILED');
// Source or index changes invalidate the verified candidate.
save(join(repo,'unrelated.txt'),'user work');
assert.match(fail('checkpoint','R-003',review),/source differs/);
assert.equal(readFileSync(join(repo,'unrelated.txt'),'utf8'),'user work');
run('git',['clean','-f','--','unrelated.txt']); // isolated, exact test-created file only
call('checkpoint','R-003',review);
assert.equal(readFileSync(join(repo,'.git/full-count'),'utf8'),'1','No full gate per finding/batch');
script('prepare-review.sh','final');
const final=evidence();
assert.equal(final.headSha,read('repair-state.json').checkpointCommit);
assert.equal(readFileSync(join(repo,'.git/full-count'),'utf8'),'2','One initial and one final full gate');
save(review,{...fixture,review:{base_sha:final.baseSha,head_sha:final.headSha,reviewer:'fresh final fixture',target:'final-branch'},findings:[]});
call('finalize',review);
assert.deepEqual(read('repair-state.json').acceptedFindings,['R-001','R-002','R-003']);
assert.match(call('status'),/3 actionable; 3 implemented; 3 verified; 3 independently reviewed; 3 accepted/);
assert.equal(head(),original);assert.equal(git('write-tree'),index);
assert(existsSync(join(state,'progress.md')));
// A genuine rejected diff cannot be overridden by substituting a clean report.
fixture.findings.push({...fixture.findings[0],id:'R-004',title:'Fourth finding'});
save(triage,fixture);call('plan',triage);
save(join(repo,'source.txt'),'repair fourth batch');call('candidate','R-004');call('verify',plan);cleanReview();
const rejected=JSON.parse(readFileSync(review));rejected.findings=[fixture.findings[0]];
save(join(state,'rejected.json'),rejected);
assert.match(fail('checkpoint','R-004',join(state,'rejected.json')),/unresolved findings/);
assert.match(fail('checkpoint','R-004',review),/candidate was rejected/);
// A later HEAD invalidates state rather than resetting it.
git('commit','--allow-empty','-m','external');
assert.match(fail('current'),/HEAD moved/);
console.log('PASS batches ('+engine+'): two repair batches, parent checks, independent review, provisional counts, final-only acceptance, 2 total full gates, failed checks, dirty source and index preservation. '+repo);
