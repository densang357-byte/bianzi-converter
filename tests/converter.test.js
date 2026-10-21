'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Converter } = require('../app/converter');
const { getConverter } = require('../app/profiles');
const token = (text, pos, start=0) => ({text,pos,start,end:start+text.length});

test('the modern effective dictionary retains source letters in both directions', () => {
  for (const direction of ['s2t','t2s']) {
    assert.equal(getConverter('modern',direction).convertSync('哩覆榦澂象像'),'哩覆榦澂象像');
  }
  assert.equal(getConverter('modern','s2t').convertSync('抬头看'),'擡頭看');
});

test('the verb fallback remains a risk and never replaces native tags', () => {
  const zhi=require('../app/zhi-policy');
  const tokens=[token('制','v')],original=structuredClone(tokens);
  const decision=zhi.decisions('制',tokens)[0];
  assert.equal(decision.target,'製');
  assert.equal(decision.decisionBasis,'verb-default');
  assert.equal(zhi.risks('制',tokens)[0].reviewOnly,true);
  assert.deepEqual(tokens,original);
  assert.equal(zhi.decisions('制服',[token('制服','v')])[0].target,'制');
  for (const pos of ['n','nh','ni','ns','nz','nl','nd','nt','m','q']) {
    assert.deepEqual(zhi.decisions('制',[token('制',pos)]),[]);
  }
});

test('conversion records diagnostics with independent run IDs', async () => {
  const converter=new Converter();
  try {
    const text='抬头看，象还是象。';
    const context={stage:'test',sourceName:'synthetic.txt',sourceSha256:crypto.createHash('sha256').update(text).digest('hex')};
    const a=await converter.convert({text,mode:'dictionary',diagnosticsContext:context});
    const b=await converter.convert({text,mode:'dictionary',diagnosticsContext:context});
    assert.equal(a.text,'擡頭看，象還是象。');
    assert.notEqual(a.diagnostics.runId,b.diagnostics.runId);
    const file=path.join(__dirname,'../outputs/轉換問題收集/test',a.diagnostics.runId,'索引.json');
    const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(manifest.sourceSha256,context.sourceSha256);
    assert.equal(manifest.stage,'test');
    assert.ok(manifest.versions.files);
  } finally {converter.close();}
});

for(const mode of ['fast','slow'])test(`${mode} performs real analysis and captures native tokens`,{skip:process.env.RUN_MODEL_TESTS!=='1'},async()=>{
  const converter=new Converter();
  try {
    const text='他有才能，今天才来。工人制造工具，并控制温度。';
    const result=await converter.convert({text,mode,profile:'modern',diagnosticsContext:{stage:'test',sourceName:'synthetic.txt',sourceSha256:crypto.createHash('sha256').update(text).digest('hex')}});
    assert.ok(result.sentences.some(s=>s.tokens?.length));
    assert.ok(result.text.includes('才能'));
    assert.ok(result.text.includes('纔來'));
    const file=path.join(__dirname,'../outputs/轉換問題收集/test',result.diagnostics.runId,'原生詞性與句法.jsonl');
    const records=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(records.some(r=>r.tokens.length));
    assert.ok(records.every(r=>r.engine.toLowerCase()===(mode==='fast'?'hanlp':'ltp')));
  } finally {converter.close();}
});


test('every standard can convert with its glyph evidence kept intact', async () => {
  const converter=new Converter();
  try {
    for(const profile of require('../app/profiles').profiles) {
      const result=await converter.convert({text:'一个人在卫生间里看电线。',mode:'dictionary',profile:profile.id,diagnosticsContext:{stage:'test',sourceName:'synthetic.txt'}});
      assert.ok(result.text.length>0);
      if(profile.id==='modern') assert.equal(result.text,'一個人在衞生間裡看電綫。');
      if(profile.id==='student') assert.ok(result.text.includes('箇'));
    }
  } finally {converter.close();}
});
