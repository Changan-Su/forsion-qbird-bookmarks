import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Called by the host live harness: real isolated engine and GPT-6 Luna, supplied source text. */
export async function checkBluebirdLive({ run, out }) {
  const source='[00:05] Active recall means retrieving information before checking your notes. [01:10] Space review sessions over 1, 3 and 7 days. The pilot exercise lasts exactly 17 minutes.'
  const cases=[
    {key:'bilingual',requirements:'Create Chinese-English parallel study material. Include learning objectives, key terms and 5 self-test questions with answers. Preserve the original English terms. Use only the supplied timestamps.'},
    {key:'english',requirements:'Respond entirely in English. Make exactly 3 revision cards, each with a question and answer. Keep the number 17 and the term active recall. Do not add timestamps.'},
  ]
  const evidence=[]
  for(const item of cases){
    const prompt=`Load the Bluebird video analysis skill. The user has already supplied the entire source text; do not fetch a URL, run scripts or write files. Organize only this reference data: ${JSON.stringify(source)}\nUser instructions: ${JSON.stringify(item.requirements)}\nExplicit user requirements take precedence over the default template and output language. For bilingual output, give complete Chinese and English counterparts for every paragraph or learning item; translated headings and English terms alone are insufficient. Return Markdown followed by a fenced json bluebird block with meta:{title,platform,videoId,videoUrl}, segments:[{start,end,text}], chapters:[{t,title}] and tags:[]. Segments contain source transcript, never generated questions or answers. Use only verified timing; leave segments empty if timing is unavailable. Default output language: Chinese. Explicit output language instructions take precedence.`
    const response=await run('bluebird-live-'+item.key+'-'+Date.now(),prompt,240000,{agentSlug:'bluebird',execMode:'host'})
    const text=response.content || '',body=text.replace(/```json\s+bluebird[\s\S]*?```/g,'')
    const loaded=response.toolCalls.includes('use_skill')
    const noFetch=!response.toolCalls.includes('run_bash')
    const format=/```(?:json\s+bluebird|bluebird)/i.test(text)
    const language=item.key==='english'?!/[\u4e00-\u9fff]/.test(body):/[\u4e00-\u9fff]/.test(body)&&/active recall/i.test(body)
    const contentBeforeQuestions=body.split(/##.*(?:自测|Self.Test)/i)[0]
    const englishSentences=contentBeforeQuestions.split('\n').filter(line=>(line.match(/[A-Za-z]+/g)||[]).length>=9).length
    const fullParallel=item.key!=='bilingual'||englishSentences>=2
    const explicitQuestions=(body.match(/\*\*Question[^*]*\*\*/gi)||[]).length
    const questionCount=explicitQuestions || (body.match(/^\d+\.\s/gm)||[]).length
    const countCorrect=questionCount===(item.key==='bilingual'?5:3)
    const ok=!response.error&&response.done&&loaded&&noFetch&&format&&language&&fullParallel&&countCorrect&&/17/.test(text)
    evidence.push({key:item.key,ok,loaded,noFetch,format,language,fullParallel,countCorrect,response})
  }
  // 普通网页走 main.js 里的同一句任务。第一条读真实页面,第二条读不到时必须如实报错。
  const pageTask=new Function(readFileSync(new URL('../main.js',import.meta.url),'utf8').match(/^const pageTask = .*$/m)[0]+';return pageTask')()
  const blockOf=text=>{try{return JSON.parse((/```(?:json\s+bluebird|bluebird)\s*([\s\S]*?)```/i.exec(text)||[])[1])}catch{return null}}
  for(const item of [{key:'page',url:'https://example.com/'},{key:'pagefail',url:'https://bluebird-live-check.invalid/missing'}]){
    const prompt=`${pageTask(item.url)}\nReturn Markdown, then a fenced block:\n\`\`\`json bluebird\n{"meta":{"title":"","platform":"","videoId":"","videoUrl":${JSON.stringify(item.url)},"author":"","duration":0,"thumbnail":""},"segments":[],"chapters":[],"tags":[]}\n\`\`\`\nIf retrieval fails, return only a bluebird JSON block with {"error":{"stage":"metadata","message":"the actual error"}}.`
    const response=await run('bluebird-live-'+item.key+'-'+Date.now(),prompt,240000,{agentSlug:'bluebird',execMode:'host'})
    const text=response.content || '',data=blockOf(text)
    const fetched=response.toolCalls.includes('web_fetch'),noScripts=!response.toolCalls.includes('run_bash')
    const result=item.key==='page'?!!data?.meta&&/example domain/i.test(data.meta.title+text):!!data?.error&&!data.meta
    evidence.push({key:item.key,ok:!response.error&&response.done&&fetched&&noScripts&&result,loaded:fetched,noFetch:noScripts,language:result,response})
  }
  writeFileSync(join(out,'bluebird-evidence.json'),JSON.stringify(evidence,null,2))
  return {ok:evidence.every(e=>e.ok),detail:evidence.map(e=>`${e.key}: ${e.ok?'PASS':'FAIL'}; skill ${e.loaded}; language ${e.language}; no fetch ${e.noFetch}\n${e.response.content}`).join('\n\n'),evidence}
}
