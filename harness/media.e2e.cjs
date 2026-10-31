// Real Electron, isolated vault, scripted engine. Does not use the user's app or data.
// BLUEBIRD_DESKTOP=/path/to/desktop node harness/media.e2e.cjs
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{execFileSync}=require('child_process')
const DESK=process.env.BLUEBIRD_DESKTOP || path.resolve(__dirname,'../../../Forsion-Genesis/desktop')
const ROOT=path.resolve(__dirname,'..')
const electron=require(DESK+'/scripts/lib/launch-electron.cjs')
const {startStubEngine}=require(DESK+'/scripts/lib/stub-engine.cjs')
const {skipOnboarding}=require(DESK+'/scripts/lib/skip-onboarding.cjs')
const block=data=>'```json bluebird\n'+JSON.stringify(data)+'\n```'
const silentNote='# Silent clip\n\n![[bluebird-silent.mp4]]\n\n**Author** · [Open](https://www.xiaohongshu.com/explore/silent)\n\n## 正文\n\nPost text\n\n'+block({meta:{title:'Silent clip',platform:'xiaohongshu'}})
const asrAsk=block({needs_asr:true,audio_path:'/tmp/bluebird-fixture.wav',assets:['bluebird-silent.mp4'],meta:{title:'Music only',platform:'xiaohongshu',description:'Geometry nodes in three steps'}})
const musicNote='# Music only\n\n![[bluebird-silent.mp4]]\n\n## 帖子正文\n\nGeometry nodes in three steps\n\n'+block({meta:{title:'Music only',platform:'xiaohongshu'}})
async function main(){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'bluebird-media-e2e-')),vault=path.join(home,'Vault'),userData=path.join(home,'userdata')
 const assets=path.join(vault,'Plugins/bluebird/assets');fs.mkdirSync(assets,{recursive:true})
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x64:d=1','-pix_fmt','yuv420p',path.join(assets,'bluebird-silent.mp4')])
 const pdir=path.join(home,'plugins','bluebird');fs.mkdirSync(pdir,{recursive:true})
 for(const f of ['main.js','manifest.json','spaces','agents','skills','icon.png'])fs.cpSync(path.join(ROOT,f),path.join(pdir,f),{recursive:true})
 let src=fs.readFileSync(path.join(pdir,'main.js'),'utf8')
 const asr="const r = await tg.transcribeAudioFile(audioPath, { timestamps: true })";assert.ok(src.includes(asr))
 src=src.replace(asr,"const r = { text:'.', segments:[{ start:0, end:21, text:'.' }] }")
 const at=src.lastIndexOf('return () => {')
 fs.writeFileSync(path.join(pdir,'main.js'),src.slice(0,at)+`globalThis.__bb={ctx,queue,qAdd,bus,open:id=>{pendingOpen={entryId:id};bus.emit({type:'open',entryId:id});ctx.openView('folder')}};\n`+src.slice(at))
 const stub=await startStubEngine({models:[{id:'fixture',name:'Fixture model',provider:'stub'}]})
 for(const content of [silentNote,asrAsk,musicNote])stub.script([{type:'status',payload:{state:'running'}},{type:'done',payload:{content}}])
 for(const d of [userData,userData+'-dev']){fs.mkdirSync(d,{recursive:true});for(const f of ['amadeus-config.json','amadeus-config.dev.json'])fs.writeFileSync(path.join(d,f),JSON.stringify({lastVault:vault,localVault:vault}));fs.writeFileSync(path.join(d,'tangu-desktop-config.json'),JSON.stringify({mode:'external',backendUrl:stub.url,token:'mock'}))}
 const app=await electron.launch({args:['--user-data-dir='+userData,'--lang=zh-CN',DESK],cwd:DESK,env:{...process.env,TANGU_HOME:home,TANGU_BACKEND_URL:stub.url,TANGU_HARNESS_QUIET:'1'}})
 const check=(name,ok)=>{assert.ok(ok,name);console.log('PASS',name)}
 try{
  const win=await app.firstWindow({timeout:90000})
  await win.waitForSelector('#root');await skipOnboarding(win);await win.waitForFunction(()=>!!globalThis.__bb)
  await win.evaluate(()=>__bb.ctx.app.openSpace('bluebird'));await win.waitForSelector('[data-url]')
  const share='如何做动效 https://xhslink.cn/o/2Ez33pZrosk 存下口令,跳转【小红书】阅读~'
  await win.fill('[data-url]',share)
  check('real share text with xhslink.cn enables analysis',await win.evaluate(()=>!document.querySelector('[data-go]').disabled))
  const run=async url=>{
   await win.evaluate(u=>{__bb.qAdd(u,'通用','standard','')},url)
   await win.waitForFunction(u=>__bb.queue.items.find(i=>i.url===u&&['completed','error'].includes(i.status)),url,{timeout:30000})
   return win.evaluate(u=>{const i=__bb.queue.items.find(x=>x.url===u);return {status:i.status,error:i.error,notePath:i.notePath,entryId:i.entryId}},url)
  }
  const silent=await run('https://www.xiaohongshu.com/explore/silent')
  check('silent video saves as a completed entry',silent.status==='completed'&&silent.notePath)
  const note=fs.readFileSync(path.join(vault,silent.notePath),'utf8')
  check('note embeds the archived video exactly once',note.split('bluebird-silent.mp4]]').length===2)
  await win.evaluate(id=>__bb.open(id),silent.entryId)
  await win.waitForFunction(()=>{const v=document.querySelector('[data-media] video');return v&&v.readyState>=1},null,{timeout:20000})
  check('archived mp4 decodes in the reading view',await win.evaluate(()=>{const v=document.querySelector('[data-media] video');return v.videoWidth===64&&v.duration>0}))
  await win.screenshot({path:path.join(home,'silent.png')})
  const music=await run('https://www.xiaohongshu.com/explore/music')
  check('music-only video completes from the post text',music.status==='completed'&&music.notePath)
  const text=String(stub.seen.runs.at(-1).message)
  check('follow-up prompt reports no speech and carries the post text',text.includes('No speech was recognized')&&text.includes('Geometry nodes in three steps')&&!text.includes('Organize this speech transcription'))
  if(process.env.BLUEBIRD_SHOT)fs.copyFileSync(path.join(home,'silent.png'),process.env.BLUEBIRD_SHOT)
 }finally{await app.close().catch(()=>{});stub.close?.();fs.rmSync(home,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1})
