// 第一批必修项的真实窗口验收:真 Electron、磁盘上的插件与智库、桩引擎,不碰用户安装版和数据。
// BLUEBIRD_DESKTOP=<已构建的 desktop 目录> node harness/essentials.e2e.cjs
// 宿主没带 PR #288 时,左栏宽度那几条会红:其余各项与它无关。BLUEBIRD_PLUGIN 指向旧检出 = 负对照。
// BLUEBIRD_LEGACY_HOST=1:同一宿主里藏起 ctx.listCapabilities,验证旧宿主退回筛选列表。
const fs=require('fs'),path=require('path'),os=require('os')
const DESK=process.env.BLUEBIRD_DESKTOP || path.resolve(__dirname,'../../../Forsion-Genesis/desktop')
const LEGACY=!!process.env.BLUEBIRD_LEGACY_HOST,ROOT=process.env.BLUEBIRD_PLUGIN || path.resolve(__dirname,'..'),OUT=process.env.BLUEBIRD_OUT || path.join(path.resolve(__dirname,'..'),'outputs','essentials')
const electron=require(DESK+'/scripts/lib/launch-electron.cjs')
const {startStubEngine}=require(DESK+'/scripts/lib/stub-engine.cjs')
const {skipOnboarding}=require(DESK+'/scripts/lib/skip-onboarding.cjs')
fs.mkdirSync(OUT,{recursive:true})
const FOLDER='Plugins/bluebird'
const answer=(title,platform,url)=>`# ${title}\n\n## Key point\n\nFixture body for ${title}.\n\n\`\`\`json bluebird\n${JSON.stringify({meta:{title,platform,videoId:'',videoUrl:url},segments:[],chapters:[],tags:[]})}\n\`\`\``
// 宿主的平台账号接口换成假的:真登录要用户自己的 B 站账号,台架只验插件这半(状态、失败卡、带登录重试、账号页)。
// 真宿主那半(内置浏览器分区读写、授权框)在 Genesis 的 platformAccounts.test.ts。
const FAKE_ACCOUNTS=`const __acc={state:'none',name:'',calls:[],cookieReads:0};globalThis.__acc=__acc;
ctx=Object.create(ctx,{app:{value:Object.create(ctx.app,{platformAccounts:{value:{platforms:()=>['bilibili'],
status:async()=>({platform:'bilibili',state:__acc.state,...(__acc.name?{name:__acc.name}:{})}),
connect:async()=>{__acc.calls.push('connect');__acc.state='connected';__acc.name='Reader';return {platform:'bilibili',state:'connected',name:'Reader'}},
pasteCookie:async(p,t)=>{__acc.calls.push('paste');if(!/SESSDATA=/.test(t))return {platform:'bilibili',state:'invalid'};__acc.state='connected';__acc.name='';return {platform:'bilibili',state:'connected'}},
disconnect:async()=>{__acc.calls.push('disconnect');__acc.state='none';__acc.name='';return {platform:'bilibili',state:'none'}},
cookie:async()=>{__acc.cookieReads++;return __acc.state==='connected'?'SESSDATA=fixture-secret-123; bili_jct=j':null}}}})}});
`
const run=(content,delay=0)=>[{type:'status',payload:{state:'running'}},{type:'done',payload:{content},...(delay?{delay}:{})}]
const wait=ms=>new Promise(r=>setTimeout(r,ms))

async function main(){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'bluebird-essentials-')),vault=path.join(home,'Vault'),userData=path.join(home,'userdata'),dir=path.join(vault,FOLDER)
 fs.mkdirSync(path.join(dir,'.bluebird'),{recursive:true})
 const seed=[['old-video','Old video note','douyin','https://www.douyin.com/video/7demo','video','learn'],['web-link','example.com/posts/why-notes-rot','','https://example.com/posts/why-notes-rot','link',null],['second','Second entry','douyin','https://www.douyin.com/video/8demo','video',null]]
 const items=seed.map(([id,title,platform,videoUrl,kind,folderId])=>({id,title,platform,videoUrl,kind,folderId,notePath:`${FOLDER}/2026-10-20-${id}.md`,date:'2026-10-20'}))
 fs.writeFileSync(path.join(dir,'.bluebird-index.json'),JSON.stringify({folders:[{id:'learn',name:'Learning'},{id:'design',name:'Design'}],items}))
 for(const e of items){
  fs.writeFileSync(path.join(vault,e.notePath),`# ${e.title}\n\nBody of ${e.id}, unique-marker-${e.id}.\n`)
  fs.writeFileSync(path.join(dir,'.bluebird',e.id+'.json'),JSON.stringify({id:e.id,kind:e.kind,meta:{title:e.title,platform:e.platform,videoUrl:e.videoUrl},sourceUrl:e.videoUrl,summaryMarkdown:`# ${e.title}\n\nBody`,notePath:e.notePath,requirements:'',segments:[],chapters:[],tags:[]}))
 }
 const pdir=path.join(home,'plugins','bluebird');fs.mkdirSync(pdir,{recursive:true})
 for(const f of ['main.js','manifest.json','spaces','agents','skills','icon.png'])fs.cpSync(path.join(ROOT,f),path.join(pdir,f),{recursive:true})
 const src=fs.readFileSync(path.join(pdir,'main.js'),'utf8'),at=src.lastIndexOf('return () => {')
 fs.writeFileSync(path.join(pdir,'main.js'),(LEGACY?'ctx=Object.create(ctx,{listCapabilities:{value:undefined}});\n':FAKE_ACCOUNTS)+src.slice(0,at)+`globalThis.__bb={ctx,bus,queue,runtimeReady,open:(id)=>{pendingOpen={entryId:id};bus.emit({type:'open',entryId:id});ctx.openView('folder')}};\n`+src.slice(at))
 const stub=await startStubEngine({models:[{id:'fixture',name:'Fixture',provider:'stub'}]})
 for(const d of [userData,userData+'-dev']){fs.mkdirSync(d,{recursive:true});for(const f of ['amadeus-config.json','amadeus-config.dev.json'])fs.writeFileSync(path.join(d,f),JSON.stringify({lastVault:vault,localVault:vault}));fs.writeFileSync(path.join(d,'tangu-desktop-config.json'),JSON.stringify({mode:'external',backendUrl:stub.url,token:'fixture'}))}
 const results=[];const check=(name,ok,detail='')=>{results.push({name,ok:!!ok,detail});console.log(ok?'PASS':'FAIL',name,detail)}
 const index=()=>JSON.parse(fs.readFileSync(path.join(dir,'.bluebird-index.json'),'utf8'))
 const row=id=>index().items.find(x=>x.id===id)
 const app=await electron.launch({args:['--user-data-dir='+userData,'--lang=zh-CN',DESK],cwd:DESK,env:{...process.env,TANGU_HOME:home,TANGU_BACKEND_URL:stub.url,TANGU_HARNESS_QUIET:'1',PI_CU_SOCKET_PATH:path.join(home,'bridge.sock')},timeout:90000})
 try{
  const win=await app.firstWindow({timeout:90000})
  win.on('pageerror',e=>console.log('JS_ERROR',e.message))
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900))
  await win.waitForSelector('#root');await skipOnboarding(win);await win.waitForFunction(()=>!!globalThis.__bb)
  await win.evaluate(()=>{localStorage.setItem('forsion_theme_zoom','1');__bb.ctx.app.openSpace('bluebird')})
  await win.waitForSelector('[data-url]',{timeout:30000});await win.evaluate(()=>__bb.runtimeReady);await wait(1500)
  const leftW=()=>win.evaluate(()=>Math.round(document.querySelector('.wb-view--left').getBoundingClientRect().width))
  const visibleText=needle=>win.evaluate(n=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(w.nextNode()){const e=w.currentNode.parentElement;if(w.currentNode.textContent.includes(n)&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'){const r=e.getBoundingClientRect();if(r.width>0&&r.height>0&&document.elementFromPoint(r.left+Math.min(r.width/2,20),r.top+r.height/2)?.closest('body'))return true}}return false},needle)
  const composerVisible=()=>win.evaluate(()=>[...document.querySelectorAll('textarea,[contenteditable="true"]')].some(e=>!e.closest('.bb-root')&&e.closest('.wb-view')&&e.getClientRects().length>0&&/消息|message/i.test(e.getAttribute('placeholder')||e.getAttribute('aria-placeholder')||e.textContent||'')))
  const openRow=async id=>{await win.evaluate(i=>__bb.open(i),id);await wait(1500)}
  const back=async()=>{await win.locator('.bb-reader [data-back]').click();await win.waitForSelector('[data-url]');await wait(700)}
  const foldAll=async state=>{const rows=win.locator(`.t2s-folder-row[aria-expanded="${state}"]`);while(await rows.count()){await rows.first().click();await wait(200)}}
  const expandAll=()=>foldAll('false')
  const rowMenu=async title=>{await expandAll();const r=win.locator('.t2sw-plug-item',{hasText:title}).first();await r.hover();await r.locator('.t2sw-plug-row-menu').click()}

  let fresh=null
  const section=async(name,fn)=>{try{await fn()}catch(e){check(name+' section',false,String(e?.message||e).split('\n')[0].slice(0,160))}await win.keyboard.press('Escape').catch(()=>{});await win.evaluate(()=>{document.querySelectorAll('.bb-menu').forEach(m=>m.remove());__bb.bus.emit({type:'open',fresh:true})}).catch(()=>{});await wait(500)}
  await section('3 左栏宽度',async()=>{
  // 3 左栏宽度
  const samples=[];for(let i=0;i<6;i++){samples.push(await leftW());await wait(300)}
  check('left width settles at the shell default on first open',samples.at(-1)<420,samples.join(' '))
  const w0=await leftW()
  await openRow('old-video');const w1=await leftW();await back();const w2=await leftW();await openRow('second');const w3=await leftW();await back();const w4=await leftW()
  check('left width holds while opening and leaving entries',[w1,w2,w3,w4].every(w=>Math.abs(w-w0)<=2),[w0,w1,w2,w3,w4].join(' → '))
  const sash=await win.evaluate(()=>{const l=document.querySelector('.wb-view--left').getBoundingClientRect();return {x:l.right+1,y:l.top+200}})
  await win.mouse.move(sash.x,sash.y);await win.mouse.down();await win.mouse.move(sash.x+50,sash.y,{steps:6});await win.mouse.up();await wait(500)
  const dragged=await leftW();await openRow('old-video');const d1=await leftW();await back();const d2=await leftW()
  check('a dragged left width survives opening and leaving an entry',dragged>w0+20&&Math.abs(d1-dragged)<=2&&Math.abs(d2-dragged)<=2,[w0,dragged,d1,d2].join(' → '))

  })
  await section('1 运行中不留旧笔记',async()=>{
  // 1 运行中不留旧笔记
  // 11-08 阅读页:青鸟一页里放原内容 + 笔记 + 问答,不再开宿主分栏;整理中右列只有进度。
  const insideReader=needle=>win.evaluate(n=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const hits=[];while(w.nextNode()){const e=w.currentNode.parentElement;if(w.currentNode.textContent.includes(n)&&e.getClientRects().length)hits.push(!!e.closest('.bb-reader .bb-r-note'))}return hits},needle)
  await openRow('old-video');await win.waitForSelector('.bb-reader .bb-r-note [contenteditable="true"]',{timeout:8000}).catch(()=>{});await wait(600)
  const oldHits=await insideReader('unique-marker-old-video')
  check('fixture: the old note shows in the reader, not in a host split',oldHits.length>=1&&oldHits.every(Boolean),JSON.stringify(oldHits))
  check('no host Chat split next to the reader',!await composerVisible())
  await back()
  stub.script(run(answer('Fresh video note','douyin','https://www.douyin.com/video/9demo'),3500))
  await win.locator('[data-url]').fill('https://www.douyin.com/video/9demo');await win.locator('[data-go]').click();await win.waitForSelector('.bb-reader .bb-r-progress');await wait(900)
  check('run hides the previous note',!await visibleText('unique-marker-old-video'))
  check('run hides Chat',!await composerVisible()&&await win.locator('.bb-reader [data-askbox]').isVisible().then(v=>!v))
  check('run says where the note will appear',(await win.locator('.bb-r-progress').innerText()).includes('整理好后笔记出现在这里'))
  await win.screenshot({path:path.join(OUT,'run.png')})
  await win.waitForFunction(()=>__bb.queue.items.some(it=>it.status==='completed'),null,{timeout:15000});await wait(1800)
  fresh=index().items.find(x=>x.title==='Fresh video note')
  const freshHits=await insideReader('Fixture body for Fresh video note')
  check('finished run shows the new note in the reader',fresh&&freshHits.length>=1&&freshHits.every(Boolean),JSON.stringify(freshHits))
  check('the old note never comes back',!await visibleText('unique-marker-old-video'))

  })
  await section('7 标题只出现一次',async()=>{
  // 7 标题只出现一次
  check('new note is named by title without a date',fresh?.notePath===`${FOLDER}/Fresh video note.md`,fresh?.notePath)
  const freshText=fs.readFileSync(path.join(vault,fresh.notePath),'utf8')
  check('date moves into note properties',/^---[\s\S]*\ndate: \d{4}-\d{2}-\d{2}\n---/.test(freshText))
  check('note body does not repeat the title',!freshText.includes('# Fresh video note'))
  check('old note file is untouched',fs.readFileSync(path.join(vault,items[0].notePath),'utf8').includes('# Old video note'))

  })
  await section('2 普通链接',async()=>{
  // 2 普通链接
  await openRow('web-link')
  check('plain link has no player',await win.locator('.bb-reader .bb-media').count()===0&&await win.locator('.bb-reader .bb-link-card').count()===1)
  check('plain link opens the page',await win.locator('.bb-reader [data-source]').getAttribute('href')==='https://example.com/posts/why-notes-rot')
  check('an unorganized link says so above its note',(await win.locator('.bb-reader .bb-r-bar').innerText()).includes('还没整理'))
  await win.screenshot({path:path.join(OUT,'link.png')})
  const runsBefore=stub.seen.runs.length
  stub.script(run(answer('Why notes rot','','https://example.com/posts/why-notes-rot')))
  await win.locator('.bb-reader .bb-r-bar [data-organize]').click()
  await win.waitForFunction(()=>__bb.queue.items.filter(it=>it.status==='completed').length===2,null,{timeout:15000});await wait(1200)
  const msg=stub.seen.runs[runsBefore]?.message||''
  check('organizing a page fetches it instead of running video scripts',msg.includes('web_fetch')&&!msg.includes('Run scripts/transcribe.py'))
  const organized=row('web-link')
  check('organizing replaces the bookmark row',organized?.title==='Why notes rot'&&index().items.filter(x=>x.videoUrl==='https://example.com/posts/why-notes-rot').length===1&&organized.kind!=='link')
  check('organizing keeps the old note',fs.existsSync(path.join(vault,items[1].notePath))&&organized.notePath!==items[1].notePath)
  check('organized page still has no player',await win.locator('.bb-reader .bb-media').count()===0)
  const againFrom=stub.seen.runs.length
  stub.script(run(answer('Why notes rot again','','https://example.com/posts/why-notes-rot')))
  await win.locator('.bb-reader [data-more]').click();await win.locator('.bb-menu div',{hasText:'重新整理'}).first().click();await win.locator('.bb-menu .bb-btn.primary').click()
  await win.waitForFunction(()=>__bb.queue.items.filter(it=>it.status==='completed').length===3,null,{timeout:15000});await wait(800)
  check('organizing a web page again stays on the page path',(stub.seen.runs[againFrom]?.message||'').includes('web_fetch'))

  })
  await section('11 笔记编辑与写盘',async()=>{
  const notePath=path.join(vault,fresh.notePath),before=fs.readFileSync(notePath,'utf8')
  await win.evaluate(i=>__bb.open(i),fresh.id);const ed=win.locator('.bb-reader .bb-r-note [contenteditable="true"]').first();await ed.waitFor({timeout:8000});await wait(1200)
  check('opening a note does not rewrite it',fs.readFileSync(notePath,'utf8')===before)
  await ed.click();await win.keyboard.press(process.platform==='darwin'?'Meta+ArrowDown':'Control+End');await win.keyboard.type(' typed-by-harness');await wait(2200)
  const after=fs.readFileSync(notePath,'utf8')
  check('an edit lands in the note file',after.includes('typed-by-harness'),after.slice(-120))
  check('the properties stay as they were',after.startsWith(before.match(/^---\n[\s\S]*?\n---\n/)[0]))
  check('the reader says it saved',(await win.locator('.bb-reader [data-state]').innerText()).includes('已保存'))
  fs.writeFileSync(notePath,after.replace('typed-by-harness','changed-outside'));await wait(1500)
  check('an outside change shows up when nothing is pending',await visibleText('changed-outside'))
  await ed.click();await win.keyboard.type(' racing-edit');fs.writeFileSync(notePath,fs.readFileSync(notePath,'utf8')+'\nsecond-outside-change\n');await wait(2500)
  const raced=fs.readFileSync(notePath,'utf8')
  check('a pending edit never overwrites an outside change',raced.includes('second-outside-change')&&!raced.includes('racing-edit'))
  check('the reader offers to reload',(await win.locator('.bb-reader [data-state]').innerText()).includes('没有覆盖'))
  await win.locator('.bb-reader [data-state] button').click();await wait(800)
  check('reload shows the file again',await visibleText('second-outside-change'))
  await win.screenshot({path:path.join(OUT,'reader-note.png')})
  })
  await section('12 各类型的左列',async()=>{
  const extra=[
   {id:'post',title:'London rent checklist',kind:'video',meta:{title:'London rent checklist',platform:'xiaohongshu',author:'6028fabc1000000001005093',duration:0,description:'Viewing tips line one\n#rent'},sourceUrl:'https://www.xiaohongshu.com/explore/abc',summaryMarkdown:'# London rent checklist\n\n![](https://ci.xiaohongshu.com/a.jpg)\n![](https://ci.xiaohongshu.com/b.jpg)\n\n## 正文\n\nViewing tips line one',segments:[]},
   {id:'song',title:'Old bookshop',kind:'video',meta:{title:'Old bookshop',platform:'netease',author:'Far Hills',album:'Slow train',duration:252},sourceUrl:'https://music.163.com/song?id=1',summaryMarkdown:'# Old bookshop\n\nAbout the song',segments:[{start:12,end:20,text:'lyric line one'},{start:26,end:30,text:'lyric line two'}]},
  ]
  for(const e of extra){const notePath=`${FOLDER}/${e.id}.md`;fs.writeFileSync(path.join(vault,notePath),`---\nbluebird_id: ${e.id}\n---\nNote of ${e.id}\n`);fs.writeFileSync(path.join(dir,'.bluebird',e.id+'.json'),JSON.stringify({...e,notePath,chapters:[],tags:[]}))}
  const idx=index();idx.items.unshift(...extra.map(e=>({id:e.id,title:e.title,platform:e.meta.platform,videoUrl:e.sourceUrl,kind:e.kind,folderId:null,notePath:`${FOLDER}/${e.id}.md`,date:'2026-11-08'})));fs.writeFileSync(path.join(dir,'.bluebird-index.json'),JSON.stringify(idx));await win.evaluate(()=>__bb.bus.emit({type:'saved'}));await wait(600)
  await openRow('post')
  check('an image post shows a gallery, not a player',await win.locator('.bb-reader .bb-r-gal').count()===1&&await win.locator('.bb-reader .bb-media').count()===0&&await win.locator('.bb-reader .bb-r-thumbs button').count()===2)
  check('an image post shows its text',(await win.locator('.bb-reader .bb-r-text').innerText()).includes('Viewing tips line one'))
  const postMeta=await win.locator('.bb-reader [data-metaline]').innerText()
  check('a platform ID is not shown as the author',!postMeta.includes('6028fabc')&&postMeta.includes('图文 2 张'),postMeta)
  await win.screenshot({path:path.join(OUT,'reader-post.png')})
  await openRow('song')
  check('a song shows its cover card and lyrics',await win.locator('.bb-reader .bb-r-song').count()===1&&await win.locator('.bb-reader .bb-media').count()===0&&await win.locator('.bb-reader .bb-r-seg.static').count()===2)
  check('a song links out to its app',(await win.locator('.bb-reader [data-source]').innerText()).includes('网易云音乐'))
  await win.screenshot({path:path.join(OUT,'reader-song.png')})
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(900,860));await wait(900)
  check('a narrow window stacks into one column with three tabs',await win.locator('.bb-reader.narrow').count()===1&&await win.locator('.bb-reader .bb-r-srctab').isVisible())
  await win.locator('.bb-reader .bb-r-srctab').click();await wait(300)
  check('the first tab shows the lyrics',await win.locator('.bb-reader .bb-r-seg.static').first().isVisible())
  await win.screenshot({path:path.join(OUT,'reader-narrow.png')})
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));await wait(600)
  })
  await section('4 移动',async()=>{
  // 4 移动
  await rowMenu('Second entry');await win.getByRole('menuitem',{name:'移动到…'}).click();await win.waitForSelector('.bb-pick-menu')
  check('move has no free text input',await win.locator('.bb-pick-menu input').count()===0)
  await win.screenshot({path:path.join(OUT,'pick.png')})
  await win.locator('.bb-pick',{hasText:'Design'}).click();await wait(500)
  check('move picks a folder',row('second').folderId==='design')
  await rowMenu('Second entry');await win.getByRole('menuitem',{name:'移动到…'}).click();await win.waitForSelector('.bb-pick-menu')
  await win.locator('.bb-pick',{hasText:'新建文件夹'}).click();await win.locator('.bb-menu input').fill('Later');await win.locator('.bb-menu input').press('Enter');await wait(600)
  check('move can create a folder in an existing index',index().folders.find(f=>f.name==='Later')?.id===row('second').folderId)
  await rowMenu('Second entry');await win.getByRole('menuitem',{name:'移动到…'}).click();await win.waitForSelector('.bb-pick-menu')
  await win.locator('.bb-pick',{hasText:'Design'}).click();await wait(500)
  // 4 移出与撤销
  await rowMenu('Second entry');await win.getByRole('menuitem',{name:'移出收藏夹'}).click();await wait(500)
  check('remove takes the row out of the list',!row('second')&&!await visibleText('Second entry'))
  check('remove keeps the note and sidecar',fs.existsSync(path.join(vault,items[2].notePath))&&fs.existsSync(path.join(dir,'.bluebird/second.json')))
  await win.getByRole('button',{name:'撤销'}).last().click();await wait(500)
  check('undo restores the row and its folder',row('second')?.folderId==='design')

  })
  await section('5 改名',async()=>{
  // 5 改名
  await rowMenu('Second entry');await win.getByRole('menuitem',{name:/重命名/}).click()
  const input=win.locator('.wb-view--left input').last();await input.fill('Renamed entry');await input.press('Enter');await wait(500)
  check('rename updates the index and sidecar',row('second')?.title==='Renamed entry'&&JSON.parse(fs.readFileSync(path.join(dir,'.bluebird/second.json'),'utf8')).meta.title==='Renamed entry')
  if(LEGACY){
  await win.locator('.t2sw-plug-overflow').click();await win.getByRole('menuitem',{name:'管理文件夹…'}).click();await win.waitForSelector('.bb-pick-menu')
  await win.locator('.bb-pick',{hasText:'Design'}).click();await win.locator('.bb-pick',{hasText:'重命名文件夹'}).click()
  await win.locator('.bb-menu input').fill('Visual');await win.locator('.bb-menu input').press('Enter');await wait(500)
  check('folder rename',index().folders.find(f=>f.id==='design')?.name==='Visual')
  await win.locator('.t2sw-plug-overflow').click();await win.getByRole('menuitem',{name:'管理文件夹…'}).click();await win.waitForSelector('.bb-pick-menu')
  await win.locator('.bb-pick',{hasText:'Visual'}).click();await win.locator('.bb-pick',{hasText:'删除文件夹'}).click();await wait(500)
  }else{
   await win.locator('[data-row-key="folder:design"]').click({button:'right'});await win.getByRole('menuitem',{name:/重命名/}).click()
   const folderInput=win.locator('.wb-view--left input').last();await folderInput.fill('Visual');await folderInput.press('Enter');await wait(500)
   check('folder rename in place',index().folders.find(f=>f.id==='design')?.name==='Visual')
   await win.locator('[data-row-key="folder:design"]').click({button:'right'});await win.getByRole('menuitem',{name:'删除文件夹'}).click();await wait(500)
  }
  check('folder delete returns bookmarks to unfiled',!index().folders.some(f=>f.id==='design')&&row('second').folderId===null)
  await win.getByRole('button',{name:'撤销'}).last().click();await wait(500)
  check('folder delete can be undone',index().folders.some(f=>f.id==='design')&&row('second').folderId==='design')

  })
  await section('6 用词与控件',async()=>{
  // 6 用词与控件
  await openRow('old-video')
  const hdr=await win.locator('.bb-reader .bb-r-hd').innerText()
  check('header is one line with no action pile',(await win.locator('.bb-reader .bb-r-hd').boundingBox()).height<70&&!/总结|分析|重新整理/.test(hdr),hdr.replace(/\n/g,' '))
  // 前面「撤销」留下的通知卡浮在窗口右上角,会盖住「更多」:先关掉
  for(const c of await win.locator('.ntf-close').all())await c.click().catch(()=>{});await wait(400)
  const moreHit=await win.evaluate(()=>{const b=document.querySelector('.bb-reader [data-more]');if(!b)return 'no button';const r=b.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e===b?'ok':(e?e.className||e.tagName:'nothing')+' '+JSON.stringify([r.left,r.top,r.width,r.height])})
  check('the more button is reachable',moreHit==='ok',moreHit)
  await win.locator('.bb-reader [data-more]').click()
  const moreText=await win.locator('.bb-menu').innerText()
  check('the more menu uses organize wording',moreText.includes('重新整理')&&!/总结|分析/.test(moreText),moreText.replace(/\n/g,' / '))
  const radius=await win.evaluate(()=>[getComputedStyle(document.querySelector('.bb-reader [data-more]')).borderTopLeftRadius,getComputedStyle(document.documentElement).getPropertyValue('--radius-sm').trim()])
  check('buttons follow the host control radius',radius[0]===radius[1],radius.join(' vs '))
  await win.locator('.bb-menu div',{hasText:'导出…'}).first().click()
  const exportText=await win.locator('.bb-menu').innerText()
  check('menus have no emoji',!/\p{Extended_Pictographic}/u.test(exportText),exportText.replace(/\n/g,' / '))
  await win.keyboard.press('Escape')
  await win.screenshot({path:path.join(OUT,'reading.png')})
  })
  const pad=n=>String(n).padStart(2,'0'),ago=n=>{const d=new Date(Date.now()-n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
  const setIndex=async value=>{fs.writeFileSync(path.join(dir,'.bluebird-index.json'),typeof value==='string'?value:JSON.stringify(value));await win.evaluate(()=>__bb.bus.emit({type:'saved'}));await wait(600)}
  const goHome=async()=>{await win.evaluate(()=>{for(const it of __bb.queue.items)it.hidden=true;__bb.bus.emit({type:'queue'});__bb.bus.emit({type:'open',fresh:true})});await win.waitForSelector('[data-url]');await wait(500)}
  const sections=()=>win.$$eval('.bb-shelf-h',els=>els.map(e=>e.firstChild.textContent))
  const leftKeys=()=>win.$$eval('.wb-view--left [data-row-key]',els=>els.map(e=>e.dataset.rowKey))
  const taskRows=()=>win.$$eval('.wb-view--left [data-row-key^="run:"]',els=>els.map(e=>e.innerText))
  const fixture=[['n-today','Today note','bilibili','video','learn',0],['n-yest','Yesterday clip','youtube','video',null,1],['n-link','https://example.com/raw/path','','link',null,2],['n-three','Three days','douyin','video',null,3],['n-ten','Ten days old','','video','design',10],['n-year','Last year note','','video',null,400]]
  const fixtureIndex=()=>({folders:[{id:'learn',name:'Learning'},{id:'design',name:'Design'}],items:fixture.map(([id,title,platform,kind,folderId,n])=>({id,title,platform,kind,folderId,videoUrl:kind==='link'?title:`https://www.douyin.com/video/${id}`,notePath:`${FOLDER}/${id}.md`,date:ago(n)}))})
  for(const [id,title,platform,kind,,] of fixture){const url=kind==='link'?title:`https://www.douyin.com/video/${id}`;fs.writeFileSync(path.join(vault,FOLDER,id+'.md'),`# ${title}\n\nBody.\n`);fs.writeFileSync(path.join(dir,'.bluebird',id+'.json'),JSON.stringify({id,kind,meta:{title,platform,videoUrl:url},sourceUrl:url,summaryMarkdown:`# ${title}\n\nBody`,notePath:`${FOLDER}/${id}.md`,requirements:kind==='link'?'Keep the code samples':'',segments:[],chapters:[],tags:[]}))}
  if(LEGACY)await section('10 旧宿主退回',async()=>{
  await goHome();await setIndex(fixtureIndex())
  check('old hosts keep the filter menu',await win.locator('.t2sw-plug-filter').count()===1)
  check('old hosts get no folder rows',await win.locator('.t2s-folder-row').count()===0&&!(await leftKeys()).some(k=>k.startsWith('folder:')))
    check('old hosts list every bookmark',(await leftKeys()).length===fixture.length,(await leftKeys()).join(' '))
  await win.locator('.t2sw-plug-overflow').click();const legacyMenu=await win.getByRole('menuitem').allInnerTexts();await win.keyboard.press('Escape')
  check('old hosts keep folder management',legacyMenu.some(x=>x.includes('管理文件夹'))&&legacyMenu.some(x=>x.includes('新建文件夹')),legacyMenu.join(' / '))
  })
  if(!LEGACY){
  await section('8 新主页',async()=>{
  await goHome();await setIndex({folders:[],items:[]})
  check('a new library shows the empty state and no sections',await visibleText('还没有收藏')&&(await sections()).length===0&&await visibleText('粘贴一个链接'))
  await win.screenshot({path:path.join(OUT,'home-empty.png')})
  await setIndex('{broken')
  check('an unreadable index is not shown as empty',!await visibleText('还没有收藏')&&await win.locator('.bb-recovery').count()===1)
  check('an unreadable index gets a left row, not an empty list',(await leftKeys()).includes('index-error'))
  check('an unreadable index stays on disk untouched',fs.readFileSync(path.join(dir,'.bluebird-index.json'),'utf8')==='{broken')
  await setIndex(fixtureIndex())
  check('idle home draws only the sections with content',(await sections()).join()==='需要你处理,最近整理',(await sections()).join())
  const composeH=()=>win.evaluate(()=>Math.round(document.querySelector('.bb-compose').getBoundingClientRect().height))
  const idleH=await composeH()
  check('the input is one line at rest',idleH<64&&!await win.locator('[data-requirements]').isVisible(),String(idleH))
  await win.locator('.bb-qrow[data-entry-id="n-link"]').waitFor()
  check('link titles drop the scheme',(await win.locator('.bb-qrow[data-entry-id="n-link"] .ttl').innerText())==='example.com/raw/path')
  await win.screenshot({path:path.join(OUT,'home-light.png')})
  const runs0=stub.seen.runs.length
  await win.locator('[data-url]').fill('看这个 https://www.bilibili.com/video/BV1demo 不错')
  await wait(200);const pasted=[await win.locator('[data-requirements]').isVisible(),await composeH(),await win.locator('[data-detected]').innerText(),await win.locator('.bb-clead').getAttribute('data-fav')]
  check('a pasted link expands the options and names the platform',pasted[0]&&pasted[1]>idleH+60&&pasted[2].length>0&&!!pasted[3],pasted.join(' '))
  await win.screenshot({path:path.join(OUT,'home-pasted.png')})
  check('template, length and presets sit in the options',await win.locator('.bb-chips [data-tpl]').isVisible()&&await win.locator('.bb-chips [data-detail]').isVisible()&&await win.locator('.bb-chips [data-presets]').isVisible())
  await win.locator('[data-url]').press('Enter');await wait(800)
  const savedLink=index().items.find(x=>x.videoUrl==='https://www.bilibili.com/video/BV1demo')
  check('Enter saves without organizing',savedLink?.kind==='link'&&stub.seen.runs.length===runs0&&await win.locator('[data-url]').inputValue()==='')
  check('Enter stays home and collapses the options',await win.locator('[data-url]').isVisible()&&!await win.locator('[data-requirements]').isVisible())
  check('the saved link waits in Needs attention',await win.locator(`.bb-qrow[data-entry-id="${savedLink?.id}"]`).count()===1)
  // 草稿
  await win.locator('[data-more]').click()
  check('options open without a link',await win.locator('[data-requirements]').isVisible())
  await win.locator('[data-requirements]').fill('只要结论')
  await win.locator('[data-bi]').click();await win.locator('.bb-menu button').first().click();await wait(200)
  check('a preset chip lights up and appends',(await win.locator('[data-requirements]').inputValue()).startsWith('只要结论')&&await win.locator('[data-bi].on').count()===1)
  await win.locator('[data-tpl]').selectOption({index:1})
  const tplValue=await win.locator('[data-tpl]').inputValue()
  await win.locator('[data-bi]').click();await wait(200)
  check('clicking a lit chip takes its text out',await win.locator('[data-requirements]').inputValue()==='只要结论')
  await openRow('n-yest');await back()
  check('the draft survives leaving home',await win.locator('[data-requirements]').inputValue()==='只要结论'&&await win.locator('[data-tpl]').inputValue()===tplValue&&await win.locator('[data-requirements]').isVisible())
  await win.locator('[data-requirements]').fill('')
  // 回车 + ⌘ 收藏并整理,运行中在列表里、不在索引里
  stub.script(run(answer('Queued video','douyin','https://www.douyin.com/video/1live'),3000))
  await win.locator('[data-url]').fill('https://www.douyin.com/video/1live');await win.locator('[data-url]').press(process.platform==='darwin'?'Meta+Enter':'Control+Enter')
  await win.waitForSelector('.bb-reader .bb-r-progress');await wait(500)
  check('Mod+Enter organizes',stub.seen.runs.length===runs0+1||await win.evaluate(()=>__bb.queue.items.some(i=>i.url==='https://www.douyin.com/video/1live')))
  const liveRow=await taskRows()
  check('a running task is in the left list at once',liveRow.length===1,liveRow.join(' | '))
  check('a running row has a second line',await win.locator('.wb-view--left [data-row-key^="run:"] .t2sw-plug-sub').count()===1)
  check('a running task is not written to the index',!index().items.some(x=>x.videoUrl==='https://www.douyin.com/video/1live'))
  check('the running row is the active one',await win.locator('.wb-view--left [data-row-key^="run:"].active').count()===1)
  await back()
  check('home shows In progress first',(await sections())[0]==='进行中'&&await win.locator('.bb-shelf .bb-qrow[data-task-id]').count()===1)
  await win.screenshot({path:path.join(OUT,'home-running.png')})
  await win.locator('.wb-view--left [data-row-key^="run:"]').click();await wait(400)
  check('clicking the running row shows its progress',await win.locator('.bb-reader .bb-r-progress').count()===1)
  await back()
  await win.waitForFunction(()=>__bb.queue.items.some(i=>i.url==='https://www.douyin.com/video/1live'&&i.status==='completed'),null,{timeout:15000});await wait(900)
  check('a finished task swaps its run row for the saved row',(await taskRows()).length===0&&index().items.some(x=>x.videoUrl==='https://www.douyin.com/video/1live'))
  check('In progress disappears when nothing runs',!(await sections()).includes('进行中'))
  // 需要你处理:整理后消失,失败可重试
  stub.script(run(answer('Organized link','','https://example.com/raw/path')))
  await win.locator('.bb-qrow[data-entry-id="n-link"] .acts button').first().dblclick()
  await win.waitForFunction(()=>__bb.queue.items.some(i=>i.replaceEntry==='n-link'&&i.status==='completed'),null,{timeout:15000});await wait(900)
  const organized=index().items.find(x=>x.id==='n-link')
  check('a double click queues one task',await win.evaluate(()=>__bb.queue.items.filter(i=>i.replaceEntry==='n-link').length)===1)
  check('organizing a saved link keeps its requirements',await win.evaluate(()=>__bb.queue.items.find(i=>i.replaceEntry==='n-link')?.requirements)==='Keep the code samples')
  await goHome()
  check('an organized link leaves Needs attention',organized&&organized.kind!=='link'&&await win.locator('.bb-shelf-h',{hasText:'最近整理'}).count()===1&&await win.locator('.bb-qrow[data-entry-id="n-link"] .acts').count()===0)
  await win.evaluate(()=>{__bb.queue.items.push({id:'fail1',url:'https://www.bilibili.com/video/BV1fail',status:'error',error:'Rejected by the site',errKey:'',tpl:'通用',detail:'standard',requirements:'',vault:__bb.ctx.app.vaultRoot(),plat:{platform:'bilibili'},logs:[],runs:[],title:''});__bb.bus.emit({type:'queue'})});await wait(300)
  check('a failed task sits in Needs attention with its error',await visibleText('Rejected by the site')&&(await sections()).includes('需要你处理'))
  const failRow=await taskRows()
  check('a failed task shows its status in the left list',failRow.length===1&&failRow[0].includes('失败'),failRow.join(' | '))
  await win.screenshot({path:path.join(OUT,'home-failed.png')})
  stub.script(run(answer('Retried','bilibili','https://www.bilibili.com/video/BV1fail')))
  await win.locator('.bb-qrow[data-task-id="fail1"] button',{hasText:'重试'}).click()
  await win.waitForFunction(()=>__bb.queue.items.some(i=>i.id!=='fail1'&&i.url==='https://www.bilibili.com/video/BV1fail'&&i.status==='completed'),null,{timeout:15000});await goHome()
  check('a retried failure disappears',await win.locator('.bb-qrow[data-task-id="fail1"]').count()===0&&!(await visibleText('Rejected by the site')))
  // 回形针
  const sub=path.join(home,'sample.srt');fs.writeFileSync(sub,'1\n00:00:00,000 --> 00:00:02,000\nhello\n')
  stub.script(run(answer('Imported subtitles','','local://import'),300))
  await win.locator('[data-import-file]').setInputFiles(sub)
  await win.waitForFunction(()=>__bb.queue.items.some(i=>i.importText?.includes('hello')),null,{timeout:8000})
  check('the paperclip imports a local file',true)
  await win.waitForFunction(()=>!__bb.queue.items.some(i=>['pending','parsing','transcribing'].includes(i.status)),null,{timeout:15000})
  })
  await section('9 文件夹树',async()=>{
  await goHome();await setIndex(fixtureIndex());await win.evaluate(()=>{document.querySelector('.wb-view--left')?.scrollTo?.(0,0)})
  await foldAll('true')
  const keys=await leftKeys()
  check('folders on top, then unfiled newest first',keys.join(' ')==='folder:learn folder:design n-yest n-link n-three n-year',keys.join(' '))
  check('the filter menu is gone',await win.locator('.t2sw-plug-filter').count()===0)
  check('the primary action reads New bookmark',await win.locator('.t2sw-plug-toolbar',{hasText:'新建收藏'}).count()===1&&!(await win.locator('.t2sw-plug-toolbar').innerText()).includes('＋'))
  await win.locator('.t2sw-plug-overflow').click();const overflow=await win.getByRole('menuitem').allInnerTexts();await win.keyboard.press('Escape')
  check('overflow names the action',overflow.join().includes('新建文件夹')&&!overflow.join().includes('新文件夹名')&&!overflow.join().includes('管理文件夹'),overflow.join(' / '))
  const year=new Date(Date.now()-400*864e5).getFullYear()===new Date().getFullYear()?ago(400).slice(5):ago(400),textOf=id=>win.locator(`[data-row-key="${id}"]`).innerText()
  check('relative dates',(await textOf('n-yest')).includes('昨天')&&(await textOf('n-three')).includes('3 天前')&&(await textOf('n-year')).includes(year),[await textOf('n-yest'),await textOf('n-three'),await textOf('n-year')].join(' | '))
  check('a link title drops the scheme in the list',(await textOf('n-link')).includes('example.com/raw/path')&&!(await textOf('n-link')).includes('https://'))
  check('plain rows stay one line',await win.locator('.wb-view--left .t2sw-plug-sub').count()===0)
  await win.screenshot({path:path.join(OUT,'tree-light.png')})
  await openRow('n-ten')
  check('opening an entry unfolds its folder and marks it active',await win.locator('[data-row-key="n-ten"].active').count()===1,await win.locator('[data-row-key="n-ten"]').getAttribute('class').catch(e=>''))
  await goHome()
  check('going home clears the active row',await win.locator('.wb-view--left [data-row-key].active').count()===0)
  // 搜索压平
  const search=win.locator('.t2sw-plug-toolbar input').first()
  if(!await search.count())await win.locator('.t2sw-plug-toolbar button[aria-label*="搜索"]').first().click()
  await search.fill('Today');await wait(400)
  check('search flattens and names the folder',await win.locator('.t2s-folder-row').count()===0&&(await textOf('n-today')).includes('Learning'),await textOf('n-today'))
  await win.screenshot({path:path.join(OUT,'tree-search.png')})
  await search.fill('');await wait(400)
  // 拖动落盘
  await win.locator('[data-row-key="n-yest"]').dragTo(win.locator('[data-row-key="folder:design"]'));await wait(700)
  check('dragging onto a folder lands on disk',row('n-yest')?.folderId==='design',String(row('n-yest')?.folderId))
  await win.getByRole('button',{name:'撤销'}).last().click();await wait(600)
  check('the move can be undone',row('n-yest')?.folderId===null,String(row('n-yest')?.folderId))
  await expandAll()
  const target=win.locator('[data-row-key="n-three"]'),box=await target.boundingBox()
  await win.locator('[data-row-key="n-ten"]').dragTo(target,{targetPosition:{x:box.width/2,y:2}});await wait(700)
  check('dragging between unfiled rows leaves the folder',row('n-ten')?.folderId===null,String(row('n-ten')?.folderId))
  await win.getByRole('button',{name:'撤销'}).last().click();await wait(600)
  await win.locator('[data-row-key="n-yest"]').dragTo(win.locator('[data-row-key="n-ten"]'));await wait(700)
  check('dragging between rows of a folder joins it',row('n-yest')?.folderId==='design',String(row('n-yest')?.folderId))
  await win.getByRole('button',{name:'撤销'}).last().click();await wait(600)
  const fb=await win.locator('[data-row-key="folder:learn"]').boundingBox()
  await win.locator('[data-row-key="folder:design"]').dragTo(win.locator('[data-row-key="folder:learn"]'),{targetPosition:{x:fb.width/2,y:2}});await wait(700)
  check('folders can be reordered',index().folders.map(f=>f.id).join()==='design,learn',index().folders.map(f=>f.id).join())
  await win.screenshot({path:path.join(OUT,'tree-open.png')})
  await win.evaluate(()=>{const r=document.documentElement;r.dataset.mode='dark';r.classList.add('dark')});await wait(400)
  await win.screenshot({path:path.join(OUT,'tree-dark.png')})
  })
  await section('13 B 站账号',async()=>{
  // 13 B 站账号:收藏时提示、要登录的失败卡、连接后带登录重试、账号页
  await win.evaluate(()=>{const r=document.documentElement;r.dataset.mode='light';r.classList.remove('dark')})
  await goHome()
  const BV='https://www.bilibili.com/video/BV1xx411c7mD'
  await win.locator('[data-url]').fill(BV);await wait(600)
  check('a Bilibili link says the account is not connected',await win.locator('[data-acct-hint]').isVisible()&&(await win.locator('[data-acct-hint]').innerText()).includes('B 站未连接'))
  await win.locator('[data-url]').fill('https://www.douyin.com/video/7x');await wait(300)
  check('other platforms show no account hint',!await win.locator('[data-acct-hint]').isVisible())
  const from=stub.seen.runs.length
  stub.script(run('```json bluebird\n'+JSON.stringify({error:{stage:'media',message:'Bilibili full media is unavailable (login, preview or restricted content)',code:'',blocked:true}})+'\n```'))
  await win.locator('[data-url]').fill(BV);await win.locator('[data-go]').click()
  await win.waitForFunction(()=>__bb.queue.items.some(it=>it.needLogin==='bilibili'),null,{timeout:15000});await wait(1200)
  const first=stub.seen.runs[from]||{}
  check('without an account the run carries no secret',!first.secretEnv&&!String(first.message||'').includes('BLUEBIRD_COOKIE is already set'),JSON.stringify(first.secretEnv||null))
  check('the failure says Bilibili needs sign-in',await visibleText('B 站要求登录后才能获取这条视频'))
  check('the failure offers Connect Bilibili',await win.locator('.bb-reader .bb-r-progress button',{hasText:'连接 B 站'}).isVisible())
  await win.screenshot({path:path.join(OUT,'login-needed.png')})
  await win.locator('.bb-reader .bb-r-progress button',{hasText:'连接 B 站'}).click();await wait(800)
  check('connecting asks the host once',(await win.evaluate(()=>__acc.calls)).join()==='connect',(await win.evaluate(()=>__acc.calls)).join())
  check('after connecting the card says connected and offers Retry',await visibleText('B 站已连接')&&await visibleText('Reader')&&await win.locator('.bb-reader .bb-r-progress button',{hasText:'重试'}).isVisible())
  await win.screenshot({path:path.join(OUT,'login-ready.png')})
  const retryFrom=stub.seen.runs.length
  stub.script(run(answer('Bilibili fixture','bilibili',BV)))
  await win.locator('.bb-reader .bb-r-progress button',{hasText:'重试'}).click()
  await win.waitForFunction(()=>__bb.queue.items.some(it=>it.status==='completed'&&/BV1xx411c7mD/.test(it.url)),null,{timeout:15000});await wait(1200)
  const second=stub.seen.runs[retryFrom]||{}
  check('the retry carries the sign-in as a run secret',second.secretEnv?.BLUEBIRD_COOKIE==='SESSDATA=fixture-secret-123; bili_jct=j',JSON.stringify(second.secretEnv||null))
  check('the model only hears that the variable is set',String(second.message||'').includes('BLUEBIRD_COOKIE is already set')&&!String(second.message||'').includes('fixture-secret'))
  const logs=await win.evaluate(()=>JSON.stringify(__bb.queue.items))
  check('the sign-in never lands in the task record',!logs.includes('fixture-secret'))
  const saved=index().items.find(x=>x.title==='Bilibili fixture')
  check('the note never contains the sign-in',saved&&!fs.readFileSync(path.join(vault,saved.notePath),'utf8').includes('fixture-secret'))
  // 账号页:从阅读页 ⋯ 进
  await win.locator('.bb-reader [data-more]').click();await win.locator('.bb-menu div',{hasText:'平台账号'}).first().click();await wait(600)
  check('the account page shows who is connected',await visibleText('已连接 · Reader'))
  await win.locator('.bb-acc [data-acc-off]').click();await wait(500)
  check('disconnect goes through the host and shows not connected',(await win.evaluate(()=>__acc.calls)).includes('disconnect')&&await visibleText('未连接')&&await win.locator('.bb-acc [data-acc-on]').isVisible())
  await win.locator('.bb-acc details summary').click();await win.locator('.bb-acc [data-acc-paste]').fill('buvid3=1');await win.locator('.bb-acc [data-acc-save]').click();await wait(400)
  check('a paste without SESSDATA is explained',await visibleText('没找到登录信息'))
  await win.locator('.bb-acc [data-acc-paste]').fill('SESSDATA=abc; bili_jct=x');await win.locator('.bb-acc [data-acc-save]').click();await wait(400)
  check('a good paste connects',await visibleText('已连接')&&await win.locator('.bb-acc [data-acc-paste]').inputValue()==='')
  await win.screenshot({path:path.join(OUT,'accounts.png')})
  await win.evaluate(()=>{const r=document.documentElement;r.dataset.mode='dark';r.classList.add('dark')});await wait(400)
  await win.screenshot({path:path.join(OUT,'accounts-dark.png')})
  await win.evaluate(()=>{const r=document.documentElement;r.dataset.mode='light';r.classList.remove('dark')})
  })
  }
 } catch(error){check('harness finished',false,String(error?.stack||error))}
 finally{await app.close().catch(()=>{});stub.close?.();fs.rmSync(home,{recursive:true,force:true})}
 fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,1))
 const bad=results.filter(r=>!r.ok);console.log(`${results.length-bad.length}/${results.length} passed`);if(bad.length)process.exitCode=1
}
main().catch(e=>{console.error(e);process.exit(1)})
