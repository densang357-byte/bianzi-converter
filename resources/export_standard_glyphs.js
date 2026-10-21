'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Converter} = require('../app/converter');
const {profiles, getDictionaries, profileCandidates} = require('../app/profiles');
const {candidatesFor} = require('../app/standard');
const excluded = require('../app/excluded-characters');
const root = path.join(__dirname, '..');
const output = path.join(root, 'standards');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const labels = profiles.map(p => p.label);
const samples = ['电线','卫生','里面','花朵','床铺','群众','山峰','烟火','为了','伪造','启发','叙述','嘴唇','秘密','恒心','咒骂','污水','猫咪','面条','铁钩','嫉妒','才华','考察','抬头'];
const specific = ['象','像','哩','覆','榦','澂','線','綫','衛','衞','裡','裏','朵','朶','床','牀','群','羣','峰','峯','煙','烟','爲','為','僞','偽','啓','啟','敍','敘','叙','考','攷'];
const scalar = text => [...text].length === 1;

async function main() {
  fs.mkdirSync(output, {recursive:true});
  const all = new Set(specific);
  for (const p of profiles) for (const source of getDictionaries(p.id).characters.keys()) if (scalar(source)) all.add(source);
  const sources = [...all].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0));
  const converter = new Converter();
  const charts = [], sampleResults = [];
  try {
    for (const p of profiles) {
      const runId = crypto.randomUUID();
      const context = {runId,stage:'regression',sourceName:`glyph-table-${p.id}.txt`,sourceSha256:hash(JSON.stringify(sources)),kind:'glyph-table'};
      const actual = [];
      for (let start=0;start<sources.length;start+=128) {
        const result = await converter.convertSegments({segments:sources.slice(start,start+128),direction:'s2t',mode:'dictionary',profile:p.id,diagnosticsContext:{...context,unitOffset:start}});
        actual.push(...result.segments.map(s=>s.text));
      }
      const records = sources.map((source,i)=>{
        const inherited=getDictionaries(p.id).characters.get(source)||[source];
        const candidates=p.id==='modern'?candidatesFor(source,inherited):profileCandidates(p.id,source,inherited);
        const values=[...new Set(candidates.map(target=>excluded.mapping(source,target)))];
        return {source,codePoint:'U+'+source.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'),isolatedOutput:actual[i],candidates:values};
      });
      const data={schema:1,id:p.id,label:p.label,direction:'s2t',mode:'dictionary',variants:[],preserveZhe:true,scope:'單字獨立輸入的現行輸出與字庫候選；詞義分化須另按詞界、詞性與局部語境處理。',characters:records};
      fs.writeFileSync(path.join(output,p.id+'.json'),JSON.stringify(data,null,2)+'\n');
      fs.writeFileSync(path.join(output,p.id+'.tsv'),'原字\t碼位\t獨立單字輸出\t字庫候選\n'+records.map(r=>[r.source,r.codePoint,r.isolatedOutput,r.candidates.join(' ')].join('\t')).join('\n')+'\n');
      charts.push(data);
      const sample=await converter.convertSegments({segments:samples,direction:'s2t',mode:'dictionary',profile:p.id,diagnosticsContext:{stage:'regression',sourceName:`glyph-samples-${p.id}.txt`,sourceSha256:hash(JSON.stringify(samples)),kind:'glyph-samples'}});
      sampleResults.push(sample.segments.map(s=>s.text));
    }
  } finally {converter.close();}
  const differences=sources.map((source,i)=>({source,outputs:charts.map(c=>c.characters[i].isolatedOutput)})).filter(r=>new Set(r.outputs).size>1);
  fs.writeFileSync(path.join(output,'differences.tsv'),['原字',...labels].join('\t')+'\n'+differences.map(r=>[r.source,...r.outputs].join('\t')).join('\n')+'\n');
  const rows=samples.map((s,i)=>'| '+[s,...sampleResults.map(r=>r[i])].join(' | ')+' |');
  fs.writeFileSync(path.join(output,'comparison.md'),'# 各標準用字對照\n\n以下爲現行工具以純詞庫模式、預設設定轉換下列示例的結果。\n\n| '+['輸入',...labels].join(' | ')+' |\n| '+labels.map(()=> '---').concat('---').join(' | ')+' |\n'+rows.join('\n')+'\n\n完整單字差異見 [differences.tsv](differences.tsv)。單字表保留多個候選；完整語境下的詞性選字另依轉換規則處理。\n');
  const selected=[0,1,2,3,4,5,6,7];
  const quick=charts.map((c,i)=>'| '+[c.label,...selected.map(j=>sampleResults[i][j])].join(' | ')+' |');
  fs.writeFileSync(path.join(output,'README.md'),`# 各標準字形\n\n本目錄整理工具目前九種方案的字形與用字，列出 ${sources.length} 個輸入字；其中 ${differences.length} 個字的獨立單字輸出因方案而異。\n\n| 方案 | 綫／線 | 衞／衛 | 裡／裏 | 朶／朵 | 牀／床 | 羣／群 | 峯／峰 | 烟／煙 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${quick.join('\n')}\n\n古籍繁體爲大陸標準繁體；調和繁體爲大陸繁體微調。港臺舊標準爲字形重建方案；《學生字典》爲試用方案，待核字組見 [policy.json](../dictionaries/student-standard/policy.json)。\n\n## 字表下載\n\n| 方案 | JSON | TSV |\n| --- | --- | --- |\n${charts.map(c=>'| '+c.label+' | [JSON]('+c.id+'.json) | [TSV]('+c.id+'.tsv) |').join('\n')}\n\n另有[常見用字對照](comparison.md)和[完整單字差異表](differences.tsv)。\n\nJSON 的 \`isolatedOutput\` 爲該字單獨輸入時的輸出；\`candidates\` 爲字庫候選。多候選不表示任意互換，詞義分化須看實際詞界、詞性與局部語境。表內記錄 Unicode 字元；同碼位的字體筆形由所用字體呈現。\n\n字表從目前程式及字庫產生，使用純詞庫模式、預設異體設定及保留「着」。示例均爲字詞，未引用私人作品。重新產生：\n\n\`\`\`sh\nnpm run export:standards\n\`\`\`\n\n產生過程的診斷分類保存在本機 regression stage；不隨字表發布。第三方字表授權見 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。\n`);
  const paths=fs.readdirSync(output).filter(f=>f!=='manifest.json').sort();
  const runtimePaths=['app/converter.js','app/profiles.js','app/standard.js','app/profile-rules.js','app/source-letter-policy.js','app/lexicon-resolution.js','app/student-standard.js','app/data/historical-profiles.json','app/data/excluded-conversion-characters.json','app/data/lexicon-direction-policy.json','dictionaries/pos-lexicon/resolution_policy.json','dictionaries/student-standard/policy.json'];
  const manifest={schema:1,openccVersion:require('opencc/package.json').version,runtimeRules:Object.fromEntries(runtimePaths.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))])),profiles:profiles.map(p=>p.id),inputCharacters:sources.length,differingIsolatedOutputs:differences.length,settings:{direction:'s2t',mode:'dictionary',variants:[],preserveZhe:true},files:Object.fromEntries(paths.map(f=>[f,hash(fs.readFileSync(path.join(output,f)))]))};
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({profiles:charts.length,characters:sources.length,differences:differences.length,files:paths.length+1}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
