const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-exam-test-'));
let compiled;
try {
  execFileSync('./node_modules/.bin/tsc', ['src/App.tsx', 'src/vite-env.d.ts', '--jsx', 'react-jsx', '--module', 'commonjs', '--target', 'es2022', '--skipLibCheck', '--outDir', buildDir, '--ignoreConfig'], { stdio: 'inherit' });
  compiled = fs.readFileSync(path.join(buildDir, 'App.js'), 'utf8') + '\nexports.Home = Home;';
} finally {
  fs.rmSync(buildDir, { recursive: true });
}
// Component-state integration harness: exercises real handlers and effects,
// without a browser, authentication, or access to anyone's saved data.
function harness(seed = {}) {
  let slots = [], cursor = 0, effects = [], dirty = true, tree, now = 100000, timer;
  const storage = new Map(Object.entries(seed));
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const react = {
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value; if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}]; },
    useRef(initial) { const i=cursor++; if (!(i in slots)) slots[i]={current:initial}; return slots[i]; },
    useMemo(fn,deps) { const i=cursor++; if(!slots[i] || !same(slots[i].deps,deps)) slots[i]={deps,value:fn()}; return slots[i].value; },
    useEffect(fn,deps) { const i=cursor++; if(!slots[i] || !same(slots[i].deps,deps)) {const previous=slots[i]; slots[i]={deps}; effects.push(()=>{previous?.cleanup?.(); slots[i].cleanup=fn();});} },
  };
  const jsx=(type,props)=>({type,props:props||{}});
  const exports={};
  const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  const fakeDate=class extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} };
  vm.runInNewContext(compiled,{exports, require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:{},
    localStorage, Date:fakeDate, window:{setInterval:fn=>{timer=fn;return 1;},location:{search:'',pathname:'/'}},clearInterval:()=>{timer=null;}, console});
  function render(){let guard=0; do{dirty=false;cursor=0;effects=[];tree=exports.Home();effects.forEach(fn=>fn());assert.ok(++guard<20);}while(dirty);return tree;}
  function nodes(node=tree){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n??null));return [node,...nodes(node.props?.children??null),...nodes(node.props?.actions??null)];}
  function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
  function button(label){const n=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(n,'button '+label);return n;}
  function click(label){const n=button(label);assert.ok(!n.props.disabled,label+' enabled');n.props.onClick();render();}
  function chip(denom){const n=nodes().find(n=>n.type?.name==='Chip'&&n.props.denom===denom&&!n.props.small);assert.ok(n);n.props.onClick();render();}
  function problem(){return nodes().find(n=>n.type?.name==='ProblemPile').props.chips;}
  function answer(denom){return nodes().find(n=>n.type?.name==='GroupedRow'&&n.props.denom===denom).props.qty;}
  function solve(){click('全削除');let left=Object.entries(problem()).reduce((s,[d,q])=>s+Number(d)*q,0)*1.5;for(const d of [400,100,20,4,1])while(left>=d){chip(d);left-=d;}assert.equal(left,0);}
  render();
  return {click,chip,problem,answer,solve,button,render,nodes,text,storage,advance(ms){now+=ms;timer?.();render();},records(){return JSON.parse(storage.get('bj-attempts')||'[]');},tree:()=>tree};
}
const old=Array.from({length:1000},(_,i)=>({id:'old-'+i,correct:true,minimal:true,seconds:1}));
const h=harness({'bj-attempts':JSON.stringify(old),'bj-insurance-attempts':'[{"id":"insurance","correct":true,"seconds":7}]'});
h.click('★試験モード3問・90秒');
assert.ok(h.tree().props.className.includes('compact-layout'));
assert.equal(h.button('前の問題').props.disabled,true);
const p1=JSON.stringify(h.problem());h.chip(4);h.advance(5000);h.click('次の問題');
const p2=JSON.stringify(h.problem());h.chip(20);h.advance(3000);h.click('前の問題');
assert.equal(JSON.stringify(h.problem()),p1);assert.equal(h.answer(4),1);
h.solve();h.advance(2000);h.click('次の問題');
assert.equal(JSON.stringify(h.problem()),p2);assert.equal(h.answer(20),1);
h.solve();h.click('配当確定');assert.equal(h.button('次の問題').props.disabled,true);
h.solve();h.click('試験を終了');h.click('見直しを続ける');h.click('前の問題');h.click('次の問題');
assert.equal(h.records().length,1000); // no writes while moving/reviewing
h.click('試験を終了');const finish=h.button('終了して採点').props.onClick;finish();h.render();finish();h.render();
const records=h.records();assert.equal(records.length,1000);assert.equal(records[0].id,'old-3');
assert.equal(records.slice(-3).filter(r=>r.correct).length,3);assert.equal(new Set(records.slice(-3).map(r=>r.id)).size,3);
assert.equal(records.at(-3).seconds,7);assert.equal(records.at(-2).seconds,3);
assert.equal(JSON.parse(h.storage.get('bj-insurance-attempts')).length,1);
const t=harness();t.click('★試験モード3問・90秒');t.solve();t.advance(7000);t.click('次の問題');t.advance(83000);
assert.equal(t.records().length,3);assert.equal(t.records()[0].correct,true);assert.equal(t.records()[1].timedOut,true);
assert.equal(t.records().reduce((s,r)=>s+r.seconds,0),90);
t.advance(1000);assert.equal(t.records().length,3);
const m=harness();m.click('★試験モード3問・90秒');m.click('次の問題');m.click('次の問題');m.click('試験を終了');m.advance(90000);
assert.equal(m.records().length,3);assert.equal(m.nodes().some(n=>n.type?.name==='Modal'),false);
const p=harness();p.click('♣初級モード5〜100ドル・最小枚数');p.solve();p.click('配当確定');assert.equal(p.records()[0].correct,true);
console.log('PASS: default layout, navigation/restoration, revised final grading, timer continuity, finalization guard, timeout with modal, 1000-record retention, insurance preservation, ordinary practice.');
