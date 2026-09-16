#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, unlinkSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const engine=root.endsWith('claude-code-quality-workflow') ? 'claude' : 'codex';
const skill=engine==='claude' ? join(root,'.claude/quality-workflow') : join(root,'skills/codex-quality-workflow');
const {recoverBuild}=await import(pathToFileURL(join(skill,'scripts/recover-build.mjs')));
const repo=realpathSync(mkdtempSync(join(tmpdir(),'quality-gate-test-')));
const run=(bin,args,expected=0)=>{
  const r=spawnSync(bin,args,{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024});
  assert.equal(r.status,expected,r.stdout+r.stderr); return r.stdout;
};
const git=(...args)=>run('git',args);
const save=(path,text)=>{mkdirSync(dirname(join(repo,path)),{recursive:true});writeFileSync(join(repo,path),text);};
const commit=()=>{git('add','.');git('commit','-m','fixture');};
const scripts=join(skill,'scripts');
const prepare=(target='initial',expected=target==='initial'?0:1)=>run('node',[join(scripts,'prepare-review.mjs'),target],expected);
git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
save('source.txt','base\n');save('.gitignore','generated/\n');commit();
git('switch','-c','feature');
save('source.txt','feature\n');
save('.'+engine+'/quality-workflow/validation.commands','false\n');
commit();run('bash',[join(scripts,'freeze.sh')]);
const state=join(repo,'.git',engine+'-quality-workflow');
const evidence=()=>{
 const env=readFileSync(join(state,'current-evidence.env'),'utf8');
 const dir=env.split('\n').find(x=>x.startsWith('EVIDENCE_DIR=')).slice(13);
 return {path:join(dir,'manifest.json'),...JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'))};
};
prepare();let initial=evidence();
assert.equal(initial.ready,true);assert.equal(initial.reviewable,true);assert.equal(initial.validation.status,0);assert.equal(initial.validation.phase,'quick');
const fullRun=run('bash',[join(scripts,'run-full-validation.sh')],1);
assert.match(fullRun,/STATUS=1/);assert.match(fullRun,/RECEIPT=.*receipt\.env/);
assert.equal(git('status','--porcelain').trim(),'');
prepare('final');assert.equal(evidence().ready,false);assert.equal(evidence().validation.phase,'full');
// The actual worker admission path admits diagnosis but never a failed final.
if(engine==='codex'){
 const {runLane}=await import(pathToFileURL(join(scripts,'run-lane.mjs')));
 const runtime={binary:process.execPath,prefix:[join(root,'scripts/fake-codex.mjs')]};
 const job=join(state,'job.json');
 const base={repository:repo,evidence:initial.path,scope:'failed-gate',passes:[4,7,9],baseSha:initial.baseSha,headSha:initial.headSha,target:'frozen-implementation',inputs:[]};
 writeFileSync(job,JSON.stringify({...base,role:'gate'}));
 assert.equal((await runLane(job,runtime)).complete,true);
 writeFileSync(job,JSON.stringify({...base,role:'final',target:'final-branch',evidence:evidence().path}));
 await assert.rejects(runLane(job,runtime),/final review requires passing/);
}
// A clean newer HEAD is not the initially reviewed snapshot.
git('commit','--allow-empty','-m','external change');
const moved = spawnSync('node',[join(scripts,'prepare-review.mjs'),'final'],{cwd:repo,encoding:'utf8'});
assert.equal(moved.status,1);assert.match(moved.stderr,/HEAD moved/);
for (const code of [75,78,127,143]) {
  save('.'+engine+'/quality-workflow/validation.commands','exit '+code+'\n');commit();
  run('bash',[join(scripts,'freeze.sh')]);prepare('final');
  assert.equal(evidence().reviewable,false,'Infrastructure/cancellation is not gate evidence');
}
// Unsafe evidence cannot be used just because validation failure is reviewable.
save('.'+engine+'/quality-workflow/validation.commands','echo changed > source.txt\nfalse\n');commit();
run('bash',[join(scripts,'freeze.sh')]);prepare('final');
assert.equal(evidence().reviewable,false);save('source.txt','feature\n');
// Build recovery is shared across adapters, once per source, and source preserving.
mkdirSync(join(repo,'generated'),{recursive:true});
const plan={reason:'Fixture missing generated output',outputs:['generated/theme.css'],command:[process.execPath,'-e','require("fs").writeFileSync("generated/theme.css","theme")']};
mkdirSync(join(repo,'.git/claude-quality-workflow/validation.lock'),{recursive:true});
assert.equal((await recoverBuild(repo,plan)).status,'BUSY');
rmdirSync(join(repo,'.git/claude-quality-workflow/validation.lock'));
assert.equal((await recoverBuild(repo,plan)).status,'RECOVERED');
assert.equal((await recoverBuild(repo,plan)).status,'NOT_NEEDED');
unlinkSync(join(repo,'generated/theme.css'));
assert.equal((await recoverBuild(repo,plan)).status,'RECOVERY_EXHAUSTED');
await assert.rejects(recoverBuild(repo,{...plan,outputs:['source.txt']}),/ignored/);
save('source.txt','next\n');commit();
const changed={...plan,command:[process.execPath,'-e','require("fs").writeFileSync("source.txt","bad")']};
assert.equal((await recoverBuild(repo,changed)).status,'SOURCE_CHANGED');
assert.equal(readFileSync(join(repo,'source.txt'),'utf8'),'bad');
assert.equal(git('diff','--cached').trim(),'');
commit();
assert.equal((await recoverBuild(repo,{...plan,command:[process.execPath,'-e','process.exit(3)']})).status,'RECOVERY_FAILED');
save('source.txt','timeout\n');commit();
const childCode='setInterval(()=>require("fs").appendFileSync("generated/heartbeat","x"),20)';
const wrapper='require("child_process").spawn(process.execPath,["-e",'+JSON.stringify(childCode)+'],{stdio:"inherit"});setInterval(()=>{},1000)';
const timed=await recoverBuild(repo,{...plan,command:[process.execPath,'-e',wrapper]},{timeoutMs:1000});
assert.equal(timed.status,'RECOVERY_FAILED');
const heartbeat=readFileSync(join(repo,'generated/heartbeat'),'utf8');
await new Promise(done=>setTimeout(done,200));
assert.equal(readFileSync(join(repo,'generated/heartbeat'),'utf8'),heartbeat,'Timed-out descendants must stop writing');
console.log('PASS gate failure: reviewable failed evidence, final rejection, source mutation blocking, build recovery locks/budget/source preservation ('+engine+')');
