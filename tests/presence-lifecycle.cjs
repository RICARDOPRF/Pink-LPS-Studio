const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../visual/pink-3d-presence.js'),'utf8').replace('await import(THREE_URL)','await Promise.resolve(THREE_MOCK)');
class Element extends EventTarget {constructor(){super();this.dataset={state:'idle'};this.children=[];this.classList={add(){},remove(){}};}setAttribute(){}prepend(c){this.children.unshift(c)}remove(){this.removed=true}querySelector(s){return this.children.find(c=>!c.removed&&'.'+c.className===s)}getBoundingClientRect(){return {width:400,height:600,left:0,top:0}}}
class Object3D {constructor(g,m){this.geometry=g;this.material=m;this.children=[];this.position={x:0,y:0,set(){}};this.rotation={x:0,y:0,z:0,set(){}};this.scale={setScalar(){}};this.userData={};}add(x){this.children.push(x)}traverse(fn){fn(this);this.children.forEach(x=>x.traverse(fn))}updateProjectionMatrix(){}lookAt(){}}
class Resource {constructor(o={}){Object.assign(this,o);this.color={setHex(){}}}setAttribute(){}dispose(){this.disposed=true}clone(){return new Resource(this)}}
async function run({reduce=false,hidden=false,webgl=true}={}){
 let count=0,id=0;const queue=new Map(),stage=new Element(),doc=new Element(),mq=new Element();doc.hidden=hidden;mq.matches=reduce;doc.querySelector=()=>stage;doc.createElement=()=>new Element();
 class Renderer {constructor(o){this.domElement=o.canvas}setClearColor(){}setPixelRatio(){}setSize(){}render(){count++}dispose(){}}
 const THREE={WebGLRenderer:Renderer};for(const n of ['Scene','PerspectiveCamera','Group','Points','LineSegments','Mesh'])THREE[n]=Object3D;for(const n of ['BufferGeometry','BufferAttribute','PointsMaterial','LineBasicMaterial','TorusGeometry','MeshBasicMaterial','IcosahedronGeometry'])THREE[n]=Resource;
 const win=new Element();win.matchMedia=()=>mq;if(webgl)win.WebGLRenderingContext=function(){};
 const ctx={window:win,document:doc,navigator:{userAgent:'iPhone',deviceMemory:4},performance:{now:()=>0},console,CustomEvent:class extends Event{constructor(t,o){super(t);this.detail=o.detail}},MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{queue.set(++id,fn);return id},cancelAnimationFrame:id=>queue.delete(id),THREE_MOCK:THREE};vm.runInNewContext(source,ctx);await new Promise(r=>setImmediate(r));
 const tick=t=>{const jobs=[...queue.values()];queue.clear();jobs.forEach(fn=>fn(t))};const api=win.Pink3DPresence;
 if(!webgl){assert.equal(api.snapshot().fallback,true);assert.equal(queue.size,0);api.destroy();assert.equal(stage.querySelector('.pink-3d-fallback-ring'),undefined);return;}
 if(hidden){assert.equal(queue.size,0);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));}
 tick(100);assert.equal(count,1);if(reduce){assert.equal(queue.size,0);api.setState('presenting');tick(150);assert.equal(count,2);}else{tick(110);assert.equal(count,1);tick(140);assert.equal(count,2);}
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(queue.size,0);
 doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(queue.size,1);
 api.setState('reviewing');assert.equal(api.snapshot().state,'reviewing');
 const canvas=stage.querySelector('.pink-3d-presence-canvas');canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(api.snapshot().ready,false);assert.equal(api.snapshot().fallback,true);assert.equal(queue.size,0);
 api.destroy();doc.dispatchEvent(new Event('visibilitychange'));assert.equal(queue.size,0);assert.equal(stage.querySelector('.pink-3d-fallback-ring'),undefined);
}
(async()=>{for(const options of [{},{reduce:true},{hidden:true},{webgl:false}])await run(options);console.log('PASS: frame budget, hidden boot/pause/resume, reduced motion, states, context loss, fallback and destroy (mock renderer).')})().catch(e=>{console.error(e);process.exitCode=1});
