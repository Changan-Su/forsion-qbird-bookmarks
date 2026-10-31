import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Called by the host live harness: real isolated engine and GPT-6 Luna, supplied source text. */
export async function checkBluebirdLive({ run, out }) {
  const source='[00:05] Active recall means retrieving information before checking your notes. [01:10] Space review sessions over 1, 3 and 7 days. The pilot exercise lasts exactly 17 minutes.'
  const cases=[
    {key:'bilingual',requirements:'Create Chinese-English parallel study material. Include learning objectives, key terms and 5 self-test questions with answers. Preserve the original English terms. Use only the supplied timestamps.'},
    {key:'english',requirements:'Respond entirely in English. Make exactly 3 revision cards, each with a question and answer. Keep the number 17 and the term active recall. Do not add timestamps.'},
  ]
  const evidence=[]
  // Real retrieval needs a fresh share URL: BLUEBIRD_SILENT_URL=<Xiaohongshu video without an audio track>
  const silentUrl=process.env.BLUEBIRD_SILENT_URL
  if(silentUrl){
    const assets=join(out,'silent-assets')
    const response=await run('bluebird-live-silent-'+Date.now(),`Use the bundled Bluebird video analysis skill with host run_bash. Analyze this source: ${silentUrl}
Default template: General. Default detail: standard.
Run scripts/transcribe.py to retrieve real source content. If it returns source:needs_asr, return only a bluebird JSON block containing needs_asr:true, audio_path, meta and assets. The host handles speech recognition; do not invent another transcription route. If source:image_text, organize the actual post text/images, not a transcript.
Pass --save-to ${JSON.stringify(assets)} to transcribe.py. Preserve returned assets as ![[filename]] embeds. Do not use expiring CDN URLs when a local asset exists.
End with a \`\`\`json bluebird block containing meta.`,300000,{agentSlug:'bluebird',execMode:'host'})
    const text=response.content || ''
    const embed=(/!\[\[(bluebird-[^\]]+\.mp4)\]\]/.exec(text) || [])[1]
    const ok=!response.error&&response.done&&!!embed&&existsSync(join(assets,embed))&&/```(?:json\s+bluebird|bluebird)/i.test(text)&&!/needs_asr/i.test(text)&&!/\[\d{2}:\d{2}\]/.test(text)
    evidence.push({key:'silent-video',ok,embed,response})
    const noSpeech=await run('bluebird-live-no-speech-'+Date.now(),`Load the Bluebird video analysis skill. Do not run scripts or write files. No speech was recognized in this video. Organize only the post text below and do not invent spoken content.
The author's post text, also source content: "Blender can render ASCII art. Shared the geometry nodes setup and the 3 steps: convert to points, sample colour, swap instances for glyphs."
Available archived assets: ["bluebird-demo.mp4"]. Preserve them as ![[filename]] embeds.
End with a \`\`\`json bluebird block containing meta with title and platform xiaohongshu.`,240000,{agentSlug:'bluebird',execMode:'host'})
    const said=noSpeech.content || ''
    evidence.push({key:'no-speech',ok:!noSpeech.error&&noSpeech.done&&/!\[\[bluebird-demo\.mp4\]\]/.test(said)&&/blender/i.test(said)&&!/\[\d{2}:\d{2}\]/.test(said)&&/```(?:json\s+bluebird|bluebird)/i.test(said),response:noSpeech})
  }
  // Music-only videos are organized from meta.description, which only reaches the host if the model copies it back.
  const bgmUrl=process.env.BLUEBIRD_BGM_URL
  if(bgmUrl){
    const assets=join(out,'bgm-assets')
    const response=await run('bluebird-live-bgm-'+Date.now(),`Use the bundled Bluebird video analysis skill with host run_bash. Analyze this source: ${bgmUrl}
Default template: General. Default detail: standard.
Run scripts/transcribe.py to retrieve real source content. If it returns source:needs_asr, return only a bluebird JSON block containing needs_asr:true, audio_path, meta and assets. The host handles speech recognition; do not invent another transcription route. If source:image_text, organize the actual post text/images, not a transcript.
Pass --save-to ${JSON.stringify(assets)} to transcribe.py. Preserve returned assets as ![[filename]] embeds. Do not use expiring CDN URLs when a local asset exists.`,300000,{agentSlug:'bluebird',execMode:'host'})
    const raw=(/```(?:json\s+bluebird|bluebird)\s*([\s\S]*?)```/i.exec(response.content||'')||[])[1]
    let data={};try{data=JSON.parse(raw)}catch{}
    const ok=!response.error&&response.done&&data.needs_asr===true&&!!data.audio_path&&String(data.meta?.description||'').trim().length>0
    evidence.push({key:'bgm-description',ok,description:data.meta?.description,response})
  }
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
    const explicitQuestions=(body.match(/\*\*(?:\d+\.\s*)?Question[^*]*\*\*/gi)||[]).length
    const questionCount=explicitQuestions || (body.match(/^\d+\.\s/gm)||[]).length
    const countCorrect=questionCount===(item.key==='bilingual'?5:3)
    const ok=!response.error&&response.done&&loaded&&noFetch&&format&&language&&fullParallel&&countCorrect&&/17/.test(text)
    evidence.push({key:item.key,ok,loaded,noFetch,format,language,fullParallel,countCorrect,response})
  }
  writeFileSync(join(out,'bluebird-evidence.json'),JSON.stringify(evidence,null,2))
  return {ok:evidence.every(e=>e.ok),detail:evidence.map(e=>`${e.key}: ${e.ok?'PASS':'FAIL'}; skill ${e.loaded}; language ${e.language}; no fetch ${e.noFetch}\n${e.response.content}`).join('\n\n'),evidence}
}
