// Pink Camera Router — explicit voice-commanded browser camera control.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')root.PinkCameraRouter=api})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const KEEP_KEY='pink_camera_keep_open_v1';
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function classify(text=''){
 const n=normalize(text);if(!/(camera|webcam|visao)/.test(n)&&!/(o que voce esta vendo|o que vc esta vendo|o que esta vendo)/.test(n))return null;
 if(/(fecha|fechar|desliga|desligar|pare|parar).*?(camera|webcam|visao)/.test(n))return 'camera.close';
 if(/(status|estado).*?(camera|webcam)/.test(n))return 'camera.status';
 if(/(o que voce esta vendo|o que vc esta vendo|o que esta vendo|olha pela camera|observe|observar|analisa.*camera|veja.*camera)/.test(n))return 'camera.observe';
 if(/(abre|abrir|liga|ligar|ative|ativar|inicia|iniciar|deixa|mantenha).*?(camera|webcam|visao)/.test(n))return 'camera.open';
 return null;
}
function setKeep(value){try{value?sessionStorage.setItem(KEEP_KEY,'1'):sessionStorage.removeItem(KEEP_KEY)}catch(_){}}
function keepRequested(){try{return sessionStorage.getItem(KEEP_KEY)==='1'}catch(_){return false}}
function status(){return {active:Boolean(root.PinkVision?.active),keepOpen:keepRequested(),permission:'browser-controlled'}}
async function open(){
 if(!root.PinkVision?.start)throw new Error('camera_runtime_unavailable');
 await root.PinkVision.start();setKeep(true);
 return {active:true,keepOpen:true,message:'Câmera aberta e mantida ativa nesta sessão até você mandar fechar.'};
}
function close(){
 if(!root.PinkVision?.stop)throw new Error('camera_runtime_unavailable');
 root.PinkVision.stop();setKeep(false);
 return {active:false,keepOpen:false,message:'Câmera fechada.'};
}
async function observe(question='O que você está vendo?'){
 if(!root.PinkVision?.ask)throw new Error('camera_runtime_unavailable');
 if(!root.PinkVision.active){await root.PinkVision.start();setKeep(true)}
 const result=await root.PinkVision.ask(question);
 return {active:true,keepOpen:true,observation:result?.reply||result?.text||result?.answer||result};
}
async function invoke(capability,args={}){
 if(capability==='camera.open')return open();
 if(capability==='camera.close')return close();
 if(capability==='camera.status')return status();
 if(capability==='camera.observe')return observe(args.question||args.request||'O que você está vendo?');
 throw new Error(`camera_capability_unavailable:${capability}`);
}
async function restoreIfGranted(){
 if(!keepRequested()||root.PinkVision?.active)return false;
 try{
  const permission=await root.navigator?.permissions?.query?.({name:'camera'});
  if(permission?.state!=='granted')return false;
  await root.PinkVision.start();return true;
 }catch(_){return false}
}
function install(){
 root.addEventListener?.('pinkvision:state',e=>{if(e?.detail?.active===false&&keepRequested())setKeep(false)});
 setTimeout(()=>restoreIfGranted(),250);
 return true;
}
if(typeof window!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install()}
return Object.freeze({version:'1.0.0',classify,invoke,open,close,observe,status,restoreIfGranted,get keepOpen(){return keepRequested()}});
});
