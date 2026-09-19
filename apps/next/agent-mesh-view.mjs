export class PinkAgentMeshView{
  constructor({runtime,root}={}){
    if(!runtime?.agentMesh)throw new TypeError('PinkAgentMeshView requires runtime.agentMesh');
    if(!root)throw new TypeError('PinkAgentMeshView requires root');
    this.runtime=runtime;this.root=root;this.nodes=root.querySelector('[data-mesh-nodes]');this.messages=root.querySelector('[data-mesh-messages]');this.status=root.querySelector('[data-mesh-status]');this.timer=0;this.selected=null;
  }
  render(){
    const snap=this.runtime.snapshot().agentMesh;if(!snap)return;
    if(this.nodes){this.nodes.textContent='';const list=snap.nodes||[];list.forEach((node,index)=>{const b=document.createElement('button');b.type='button';b.className='mesh-agent';b.dataset.agent=node.id;b.dataset.state=node.state||'idle';const a=(index/Math.max(1,list.length))*Math.PI*2-Math.PI/2;b.style.left=(50+Math.cos(a)*39)+'%';b.style.top=(50+Math.sin(a)*36)+'%';b.innerHTML='<small>'+String(node.state||'idle').toUpperCase()+'</small><strong>'+String(node.label||node.id)+'</strong>';b.addEventListener('click',()=>{this.selected=node.id;this.render()});if(this.selected===node.id)b.classList.add('is-selected');this.nodes.appendChild(b)})}
    if(this.messages){const items=(snap.messages||[]).filter(x=>!this.selected||x.from===this.selected||x.to===this.selected).slice(-6).reverse();this.messages.innerHTML=items.length?items.map(x=>'<article class="mesh-message"><span>'+this.escape(x.type)+'</span><b>'+this.escape(x.from)+(x.to?' → '+this.escape(x.to):'')+'</b><p>'+this.escape(x.summary)+'</p><small>'+((x.evidenceRefs||[]).length)+' evidence ref(s)</small></article>').join(''):'<div class="mesh-empty">SEM MENSAGENS COM EVIDÊNCIA</div>'}
    if(this.status){const active=(snap.nodes||[]).filter(x=>['executing','reviewing'].includes(x.state)).length;this.status.textContent=active?active+' AGENTE(S) ATIVO(S)':'SEM TRACE ATIVO'}
  }
  escape(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  show(){this.root.hidden=false;this.render();if(!this.timer)this.timer=setInterval(()=>this.render(),750)}
  hide(){this.root.hidden=true;if(this.timer){clearInterval(this.timer);this.timer=0}}
  destroy(){this.hide()}
}
