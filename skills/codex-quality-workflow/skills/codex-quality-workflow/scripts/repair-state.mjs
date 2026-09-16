#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const [action, arg, reviewPath] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const run = (args, options = {}) => {
  const r=spawnSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024,...options});
  if(r.status!==0) throw new Error(r.stderr||'git failed');
  return r.stdout.trim();
};
const repo=run(['rev-parse','--show-toplevel']); process.chdir(repo);
const stateDir=resolve(repo,run(['rev-parse','--git-path','codex-quality-workflow']));
mkdirSync(stateDir,{recursive:true});
const stateFile=join(stateDir,'repair-state.json'), candidateFile=join(stateDir,'repair-candidate.json'), verificationFile=join(stateDir,'repair-verification.json');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const head=()=>run(['rev-parse','HEAD']), index=()=>run(['write-tree']);
function snapshot(label) {
 const temp=mkdtempSync(join(tmpdir(),'quality-index-')),env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 try {
  run(['read-tree','HEAD'],{env});run(['add','-A','--','.'],{env});
  const tree=run(['write-tree'],{env});
  return {tree,commit:run(['commit-tree',tree,'-p','HEAD'],{env,input:'quality-workflow snapshot: '+label+'\n'})};
 } finally {rmSync(temp,{recursive:true,force:true});}
}
function state() {
 if(!existsSync(stateFile)) throw new Error('repair state is not initialized');
 const s=read(stateFile);
 s.checkpointCommit??=s.acceptedCommit;
 s.checkpointedFindings??=s.acceptedFindings??[];
 if(s.implementationCommit!==head()) throw new Error('HEAD moved since repair initialization; preserve pending changes and reconcile the frozen run');
 return s;
}
const checkpoint=s=>s.checkpointCommit??s.acceptedCommit;
function assertTree(commit) {
 if(snapshot('check').tree!==run(['rev-parse',commit+'^{tree}'])) throw new Error('source differs from the recorded snapshot');
}
function validatedReport(path) {
 const r=spawnSync(process.execPath,[join(here,'validate-findings.mjs'),path],{encoding:'utf8'});
 if(r.status!==0) throw new Error(r.stderr||'invalid report');
 const report=read(path);
 if(report.completion.status!=='COMPLETE') throw new Error('review is incomplete');
 return report;
}
function cleanReview(path,base,targetHead,target,all=false) {
 const r=validatedReport(path);
 if(r.review.base_sha!==base||r.review.head_sha!==targetHead||r.review.target!==target) throw new Error('review targets a different snapshot');
 if(r.findings.length) {const error=new Error('independent review has unresolved findings');error.rejected=true;throw error;}
 if(all&&[1,2,3,4,5,6,7,8,9].some(p=>!r.coverage.passes_completed.includes(p))) throw new Error('final review is missing passes');
}
function candidate(s) {
 if(!existsSync(candidateFile)) throw new Error('no candidate snapshot');
 const c=read(candidateFile);
 c.findingIds??=c.findingId?[c.findingId]:[];
 if(c.baseCommit!==checkpoint(s)) throw new Error('candidate belongs to an older checkpoint');
 assertTree(c.candidateCommit);return c;
}
function readyVerification(c) {
 if(!existsSync(verificationFile)) throw new Error('parent verification is missing');
 const v=read(verificationFile);
 if(v.status!=='PASSED'||v.candidateCommit!==c.candidateCommit||v.index!==index()) throw new Error('parent verification failed or is stale');
 return v;
}
async function execute(argv,log,seconds) {
 const fd=openSync(log,'w');
 return new Promise((done,reject)=>{
  const child=spawn(argv[0],argv.slice(1),{cwd:repo,stdio:['ignore',fd,fd],detached:process.platform!=='win32'});
  let timeout=false,cancelled=false,cleaned=false;
  const kill=()=>{try{process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL');}catch{}};
  const timer=setTimeout(()=>{timeout=true;kill();},seconds*1000),cancel=()=>{cancelled=true;kill();};
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  const cleanup=()=>{if(cleaned)return;cleaned=true;clearTimeout(timer);process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);closeSync(fd);};
  child.once('error',e=>{cleanup();reject(e);});
  child.once('close',code=>{cleanup();done({code,timeout,cancelled});});
 });
}
let lock;
const validationLocks=[];
try {
 lock=openSync(join(stateDir,'repair-state.lock'),'wx');
 if(action==='init') {
  if(existsSync(stateFile)) throw new Error('state already exists; resume it, do not erase progress');
  if(run(['status','--porcelain=v1','--untracked-files=all'])) throw new Error('repair pipeline must start clean');
  const sha=head();
  save(stateFile,{version:3,implementationCommit:sha,acceptedCommit:sha,checkpointCommit:sha,acceptedFindings:[],checkpointedFindings:[],batches:[],findings:[]});
  console.log('CHECKPOINT_SNAPSHOT='+sha);
 } else if(action==='plan') {
  const s=state(),r=validatedReport(arg);
  if(r.review.head_sha!==s.implementationCommit) throw new Error('triage targets a different implementation');
  if(r.findings.some(f=>f.status==='UNTRIAGED')) throw new Error('triage is unfinished');
  for(const id of new Set([...(s.checkpointedFindings??[]),...(s.acceptedFindings??[])])) {
   const old=s.findings?.find(f=>f.id===id),next=r.findings.find(f=>f.id===id);
   if(!next||(old&&JSON.stringify(old)!==JSON.stringify(next))) throw new Error('cannot remove or redefine a checkpointed finding');
  }
  if(JSON.stringify(s.findings)!==JSON.stringify(r.findings)) s.finalized=false;
  s.version=3;s.findings=r.findings;save(stateFile,s);console.log('Recorded '+r.findings.length+' triaged findings; preserved existing checkpoints and source.');
 } else if(action==='check'||action==='current') {
  const s=state();if(action==='check') assertTree(checkpoint(s));
  console.log('CHECKPOINT_SNAPSHOT='+checkpoint(s)+'\nACCEPTED_SNAPSHOT='+s.acceptedCommit);
 } else if(action==='candidate') {
  const s=state(),ids=(arg??'').split(',');
  if(!ids.length||ids.length>5||new Set(ids).size!==ids.length||ids.some(id=>!/^R-[0-9]{3,}$/.test(id))) throw new Error('candidate needs 1–5 distinct finding IDs, comma separated');
  for(const id of ids) {
   const f=s.findings?.find(f=>f.id===id);
   if(!f||f.status!=='CONFIRMED'||!['BLOCKING','SHOULD_FIX'].includes(f.severity)) throw new Error('candidate requires confirmed planned findings');
   if((s.checkpointedFindings??s.acceptedFindings??[]).includes(id)) throw new Error('finding already checkpointed');
  }
  const prior=existsSync(candidateFile)?read(candidateFile):null;
  const snap=snapshot(ids.join(',')+' '+new Date().toISOString());
  const same=prior&&prior.baseCommit===checkpoint(s)&&JSON.stringify(prior.findingIds)===JSON.stringify(ids)&&prior.candidateTree===snap.tree;
  const c=same?prior:{findingIds:ids,baseCommit:checkpoint(s),candidateCommit:snap.commit,candidateTree:snap.tree,createdAt:new Date().toISOString()};
  save(candidateFile,c);console.log('BASE_SNAPSHOT='+c.baseCommit+'\nCANDIDATE_SNAPSHOT='+c.candidateCommit);
 } else if(action==='verify') {
  const s=state(),c=candidate(s),plan=read(arg);
  if(!['targeted','full'].includes(plan.scope)||typeof plan.reason!=='string'||!plan.reason.trim()) throw new Error('verification plan requires scope targeted/full and reason');
  const commands=plan.scope==='full'?[['bash',join(here,'verify.sh'),'full']]:plan.commands;
  if(!Array.isArray(commands)||!commands.length||commands.some(a=>!Array.isArray(a)||!a.length||a.some(x=>typeof x!=='string'||!x.length))) throw new Error('verification commands must be nonempty argv arrays');
  const seconds=plan.timeoutSeconds??900;
  if(!Number.isInteger(seconds)||seconds<1||seconds>3600) throw new Error('invalid timeout');
  if(plan.scope==='targeted') {
   for(const engine of ['claude','codex']) {
    const directory=resolve(repo,run(['rev-parse','--git-path',engine+'-quality-workflow']));
    mkdirSync(directory,{recursive:true});const path=join(directory,'validation.lock');
    try{mkdirSync(path);}catch{throw new Error('validation busy; wait for the active checks, do not start a competing run');}
    validationLocks.push(path);
    writeFileSync(join(path,'owner'),'PID='+process.pid+'\nSTARTED_AT_EPOCH='+Math.floor(Date.now()/1000)+'\n');
   }
  }
  const previous=existsSync(verificationFile)?read(verificationFile):null;
  const failed=previous&&previous.candidateCommit===c.candidateCommit&&previous.status!=='PASSED';
  if(failed&&(!plan.resolution||typeof plan.resolution.cause!=='string'||!plan.resolution.cause.trim()||!Array.isArray(plan.resolution.evidence)||!plan.resolution.evidence.length||plan.resolution.evidence.some(p=>typeof p!=='string'||!existsSync(p))))
   throw new Error('previous verification failed; diagnose it and supply resolution cause and evidence paths before another run');
  const v={candidateCommit:c.candidateCommit,index:index(),scope:plan.scope,reason:plan.reason,status:'RUNNING',commands:[],startedAt:new Date().toISOString(),previous:previous?.receiptPath??null,resolution:failed?plan.resolution:null};
  save(verificationFile,v);
  const logs=join(stateDir,'batch-validation',Date.now()+'-'+process.pid);mkdirSync(logs,{recursive:true});
  v.receiptPath=join(logs,'receipt.json');save(verificationFile,v);save(v.receiptPath,v);
  for(let n=0;n<commands.length;n++) {
   const log=join(logs,n+'.log');console.log('Checking '+commands[n].join(' ')+'; log '+log);
   const result=await execute(commands[n],log,seconds);v.commands.push({argv:commands[n],log,...result});
   if(result.code!==0||result.timeout||result.cancelled){v.status='FAILED';break;}
  }
  if(head()!==s.implementationCommit||index()!==v.index||snapshot('after-validation').tree!==c.candidateTree) v.status='SOURCE_CHANGED';
  if(v.status==='RUNNING') v.status='PASSED';
  v.finishedAt=new Date().toISOString();save(v.receiptPath,v);save(verificationFile,v);
  if(v.status!=='PASSED') throw new Error('parent verification '+v.status+'; inspect '+verificationFile);
  console.log('Parent '+plan.scope+' verification passed; independent review is next. Not accepted.');
 } else if(action==='checkpoint'||action==='accept') {
  // Legacy accept now enforces evidence and means provisional checkpoint only.
  const s=state(),c=candidate(s);
  if(arg!==c.findingIds.join(',')) throw new Error('candidate finding IDs do not match');
  if(c.rejectedReview) throw new Error('candidate was rejected by independent review; preserve the diff and resolve the recorded finding');
  const v=readyVerification(c);
  try{cleanReview(reviewPath,c.baseCommit,c.candidateCommit,'repair-diff');}
  catch(error){if(error.rejected){c.rejectedReview=resolve(reviewPath);save(candidateFile,c);}throw error;}
  s.checkpointCommit=c.candidateCommit;
  s.checkpointedFindings=[...new Set([...(s.checkpointedFindings??s.acceptedFindings??[]),...c.findingIds])];
  s.batches=[...(s.batches??[]),{...c,verification:v,review:resolve(reviewPath)}];
  s.finalized=false;save(stateFile,s);
  console.log('Checkpointed '+c.findingIds.join(', ')+': verified and independently reviewed; final acceptance pending.');
 } else if(action==='finalize') {
  const s=state();assertTree(checkpoint(s));
  const pending=(s.findings??[]).filter(f=>f.status==='NEEDS_DECISION'||(f.status==='CONFIRMED'&&f.severity!=='WORTH_KNOWING'&&!(s.checkpointedFindings??[]).includes(f.id)));
  if(pending.length) throw new Error('unresolved findings: '+pending.map(f=>f.id).join(','));
  const env=Object.fromEntries(readFileSync(join(stateDir,'current-evidence.env'),'utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
  const m=read(join(env.EVIDENCE_DIR,'manifest.json'));
  if(!m.ready||m.validation?.status!==0||!m.validation.configured||m.headSha!==checkpoint(s)||m.repository!==repo||m.target!=='final') throw new Error('fresh passing configured final evidence is required');
  cleanReview(arg,m.baseSha,m.headSha,'final-branch',true);
  s.acceptedCommit=checkpoint(s);s.acceptedFindings=s.checkpointedFindings??[];s.finalized=true;s.finalReport=resolve(arg);save(stateFile,s);
  console.log('All '+s.acceptedFindings.length+' repairs accepted after full validation and final independent review.');
 } else if(action==='status') {
  const s=state(),tree=snapshot('status').tree,c=existsSync(candidateFile)?read(candidateFile):null;
  if(c) c.findingIds??=c.findingId?[c.findingId]:[];
  const currentCandidate=c&&c.candidateTree===tree&&c.baseCommit===checkpoint(s);
  const reviewed=new Set(s.checkpointedFindings??s.acceptedFindings??[]);
  const implemented=new Set([...reviewed,...(currentCandidate?c.findingIds:[])]),verified=new Set(reviewed);
  if(currentCandidate){try{readyVerification(c);c.findingIds.forEach(id=>verified.add(id));}catch{}}
  const actionable=(s.findings??[]).filter(f=>f.status==='CONFIRMED'&&f.severity!=='WORTH_KNOWING');
  const accepted=s.finalized&&tree===run(['rev-parse',s.acceptedCommit+'^{tree}'])?s.acceptedFindings.length:0;
  const lines=['# Quality workflow progress','',actionable.length+' actionable; '+implemented.size+' implemented; '+verified.size+' verified; '+reviewed.size+' independently reviewed; '+accepted+' accepted.','',s.finalized&&accepted===actionable.length?'Final acceptance recorded.':'Workflow incomplete. Checkpoints are provisional, not merge approval.',''];
  for(const f of s.findings??[]) {
   const stage=f.status==='REJECTED'?'rejected':f.status==='NEEDS_DECISION'?'needs decision':f.severity==='WORTH_KNOWING'?'informational':reviewed.has(f.id)?(accepted?'accepted':'reviewed; final gates pending'):verified.has(f.id)?'verified; independent review next':implemented.has(f.id)?'implemented; parent verification next':'not implemented';
   lines.push('- '+f.id+' — '+f.title+' — '+stage);
  }
  const rendered=lines.join('\n')+'\n';writeFileSync(join(stateDir,'progress.md'),rendered);console.log(rendered);
 } else throw new Error('usage: repair-state.mjs init|plan <triage>|check|current|candidate <IDs>|verify <plan>|checkpoint <IDs> <review>|finalize <review>|status');
} catch(error){console.error('repair-state: '+error.message);process.exitCode=1;}
finally{
 for(const path of validationLocks.reverse()){if(existsSync(join(path,'owner')))unlinkSync(join(path,'owner'));rmdirSync(path);}
 if(lock!==undefined){closeSync(lock);unlinkSync(join(stateDir,'repair-state.lock'));}
}
