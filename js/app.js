/*
===============================================================================
SERIDOPLAST - ALMOXARIFADO INTERNO V6.9
===============================================================================

Este arquivo concentra a lógica do sistema original.

Mapa rápido:
- Configuração e conexão com Supabase
- Estado local da aplicação
- Navegação entre telas
- Cadastro/edição de materiais
- Movimentações de estoque
- Dashboard e indicadores
- Autenticação e sessão
- Controle de usuários e permissões
- Realtime / sincronização

IMPORTANTE:
A lógica abaixo foi restaurada diretamente do HTML original para preservar o
funcionamento. Evite alterar SUPABASE_URL/SUPABASE_KEY sem saber qual projeto
está sendo usado.
===============================================================================
*/

const SUPABASE_URL='https://pwvycpozttrqrvpklhib.supabase.co';
const SUPABASE_KEY='sb_publishable_y18Eh6bX8U06BQUd0WZwRA_11nhKfg-';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let db={materiais:[],mov:[],setores:[],emprestimos:[]};
let empFiltro='ABERTO';
let cur=null;
let users=[];
let realtimeChannel=null;

const save=()=>renderAll();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const today=()=>new Date().toISOString().slice(0,10);
function nextMov(){let n=(db.seq||0)+1;db.seq=n;return 'MOV-'+String(n).padStart(6,'0')}
function agora(){return new Date().toLocaleString('pt-BR')}
const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR');
function saldo(id){
 const mov=db.mov.filter(x=>x.materialId===id).reduce((a,x)=>a+((x.tipo==='ENTRADA'||x.tipo==='DEVOLUCAO')?x.qtd:x.tipo==='SAIDA'?-x.qtd:x.qtd),0);
 const emprestado=db.emprestimos.filter(x=>x.materialId===id&&x.status==='ABERTO').reduce((a,x)=>a+x.qtd,0);
 return mov-emprestado;
}
function mat(id){return db.materiais.find(x=>x.id===id)}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.getElementById(b.dataset.view).classList.add('active');let h=document.getElementById('spHero');if(h)h.style.display=b.dataset.view==='dashboard'?'block':'none';renderAll()});
function openMaterial(id=''){let m=id?mat(id):null;editId.value=m?.id||'';codigo.value=m?.codigo||'';descricao.value=m?.descricao||'';categoria.value=m?.categoria||'';unidade.value=m?.unidade||'UN';localizacao.value=m?.localizacao||'';minimo.value=m?.minimo??0;obs.value=m?.obs||m?.observacao||'';modalTitle.textContent=m?'Editar material':'Novo material';modal.classList.add('open')}
function closeModal(){modal.classList.remove('open')}
materialForm.onsubmit=async e=>{
 e.preventDefault();
 const id=editId.value||null;
 const obj={codigo:codigo.value.trim(),descricao:descricao.value.trim(),categoria:categoria.value.trim()||null,unidade:unidade.value,localizacao:localizacao.value.trim()||null,minimo:+minimo.value||0,observacao:obs.value.trim()||null};
 let r;
 if(id) r=await sb.from('materiais').update(obj).eq('id',id);
 else r=await sb.from('materiais').insert({...obj,criado_por:cur.id});
 if(r.error){alert('Não foi possível salvar: '+r.error.message);return}
 closeModal();await loadData();
};
async function delMaterial(id){
 if(db.mov.some(x=>x.materialId===id))return alert('Este material possui movimentações e não pode ser excluído.');
 if(!confirm('Excluir este material?'))return;
 const r=await sb.from('materiais').delete().eq('id',id);
 if(r.error)return alert('Não foi possível excluir: '+r.error.message);
 await loadData();
}
function options(){return '<option value="">Selecione...</option>'+db.materiais.map(m=>`<option value="${m.id}">${esc(m.codigo)} - ${esc(m.descricao)} (saldo: ${saldo(m.id)})</option>`).join('')}
function renderForms(){
entradaForm.innerHTML=`<form class="formgrid" onsubmit="entrada(event)"><div class="field"><label>Material *</label><select name="material" required>${options()}</select></div><div class="field"><label>Quantidade *</label><input name="qtd" type="number" min="0.001" step="0.001" required></div><div class="field"><label>Data *</label><input name="data" type="date" value="${today()}" required></div><div class="field"><label>Fornecedor / Origem</label><input name="origem"></div><div class="field"><label>NF / Documento</label><input name="doc"></div><div class="field"><label>Responsável</label><input name="responsavel" value="${esc(cur?.nome||'')}"></div><div class="field wide"><label>Observação</label><textarea name="obs"></textarea></div><div class="wide"><button class="btn primary">Registrar entrada</button></div></form>`;
saidaForm.innerHTML=`<form class="formgrid" onsubmit="saida(event)"><div class="field"><label>Material *</label><select name="material" required>${options()}</select></div><div class="field"><label>Quantidade *</label><input name="qtd" type="number" min="0.001" step="0.001" required></div><div class="field"><label>Data *</label><input name="data" type="date" value="${today()}" required></div><div class="field"><label>Setor / Centro de custo *</label><input name="setor" list="listaSetores" required><datalist id="listaSetores">${db.setores.map(s=>`<option>${esc(s)}</option>`).join('')}</datalist></div><div class="field"><label>Funcionário que retirou *</label><input name="recebeu" required placeholder="Nome de quem levou o material"></div><div class="field"><label>Responsável pelo almoxarifado *</label><input name="responsavel" value="${esc(cur?.nome||'')}" required></div><div class="field wide"><label>Motivo / Observação</label><textarea name="obs"></textarea></div><div class="wide"><button class="btn primary">CONFIRMAR SAÍDA</button></div></form>`;
devolucaoForm.innerHTML=`<form class="formgrid" onsubmit="devolucao(event)"><div class="field"><label>Material *</label><select name="material" required>${options()}</select></div><div class="field"><label>Quantidade devolvida *</label><input name="qtd" type="number" min="0.001" step="0.001" required></div><div class="field"><label>Data *</label><input name="data" type="date" value="${today()}" required></div><div class="field"><label>Setor que devolveu *</label><input name="setor" required></div><div class="field"><label>Funcionário</label><input name="recebeu"></div><div class="field"><label>Responsável pelo recebimento *</label><input name="responsavel" value="${esc(cur?.nome||'')}" required></div><div class="field wide"><label>Observação</label><textarea name="obs"></textarea></div><div class="wide"><button class="btn primary">CONFIRMAR DEVOLUÇÃO</button></div></form>`}
async function entrada(e){
 e.preventDefault();let f=e.target,q=+f.qtd.value;
 const r=await sb.from('movimentacoes').insert({tipo:'ENTRADA',material_id:f.material.value,quantidade:q,data_movimento:f.data.value,origem:f.origem.value||null,documento:f.doc.value||null,responsavel:f.responsavel.value||null,observacao:f.obs.value||null,usuario_id:cur.id});
 if(r.error)return alert('Erro ao registrar entrada: '+r.error.message);f.reset();await loadData();alert('Entrada registrada.');
}
async function saida(e){
 e.preventDefault();let f=e.target,q=+f.qtd.value,id=f.material.value;
 if(q>saldo(id))return alert('Quantidade maior que o estoque disponível.');
 const r=await sb.from('movimentacoes').insert({tipo:'SAIDA',material_id:id,quantidade:q,data_movimento:f.data.value,setor:f.setor.value||null,recebeu:f.recebeu.value||null,responsavel:f.responsavel.value||null,observacao:f.obs.value||null,usuario_id:cur.id});
 if(r.error)return alert('Erro ao registrar saída: '+r.error.message);f.reset();await loadData();alert('Saída registrada.');
}
async function devolucao(e){
 e.preventDefault();let f=e.target,q=+f.qtd.value;
 const r=await sb.from('movimentacoes').insert({tipo:'DEVOLUCAO',material_id:f.material.value,quantidade:q,data_movimento:f.data.value,setor:f.setor.value||null,recebeu:f.recebeu.value||null,responsavel:f.responsavel.value||null,observacao:f.obs.value||null,usuario_id:cur.id});
 if(r.error)return alert('Erro ao registrar devolução: '+r.error.message);f.reset();await loadData();alert('Devolução registrada com sucesso.');
}
function renderEmprestimoForm(){
 const el=document.getElementById('emprestimoForm');if(!el)return;
 el.innerHTML=`<form class="formgrid" onsubmit="registrarEmprestimo(event)">
 <div class="field"><label>Material *</label><select name="material" required>${options()}</select></div>
 <div class="field"><label>Quantidade *</label><input name="qtd" type="number" min="0.001" step="0.001" required></div>
 <div class="field"><label>Funcionário *</label><input name="funcionario" required></div>
 <div class="field"><label>Setor *</label><input name="setor" list="listaSetoresEmp" required><datalist id="listaSetoresEmp">${db.setores.map(s=>`<option>${esc(s)}</option>`).join('')}</datalist></div>
 <div class="field"><label>Data da retirada *</label><input name="data" type="date" value="${today()}" required></div>
 <div class="field"><label>Previsão de devolução</label><input name="previsao" type="date"></div>
 <div class="field wide"><label>Observação</label><textarea name="obs"></textarea></div>
 <div class="wide"><button class="btn primary">Registrar empréstimo</button></div></form>`;
}
async function registrarEmprestimo(e){
 e.preventDefault();const f=e.target,id=f.material.value,q=Number(f.qtd.value);
 if(q<=0)return alert('Informe uma quantidade válida.');
 if(q>saldo(id))return alert('Quantidade maior que o estoque disponível.');
 const obj={material_id:id,quantidade:q,funcionario:f.funcionario.value.trim(),setor:f.setor.value,data_retirada:f.data.value,previsao_devolucao:f.previsao.value||null,observacao:f.obs.value.trim()||null,status:'ABERTO',criado_por:cur.id};
 const r=await sb.from('emprestimos').insert(obj);
 if(r.error)return alert('Erro ao registrar empréstimo: '+r.error.message);
 f.reset();await loadData();alert('Empréstimo registrado com sucesso.');
}
async function devolverEmprestimo(id){
 const e=db.emprestimos.find(x=>x.id===id);if(!e)return;
 if(!confirm(`Confirmar devolução de ${e.qtd} ${mat(e.materialId)?.unidade||''} de "${mat(e.materialId)?.descricao||'material'}" por ${e.funcionario}?`))return;
 const r=await sb.from('emprestimos').update({status:'DEVOLVIDO',data_devolucao:today(),recebido_por:cur.id}).eq('id',id).eq('status','ABERTO');
 if(r.error)return alert('Erro ao registrar devolução: '+r.error.message);
 await loadData();alert('Devolução do empréstimo registrada.');
}
function renderEmprestimos(){
 renderEmprestimoForm();
 const el=document.getElementById('tblEmprestimos');if(!el)return;
 const hoje=today();
 const abertos=db.emprestimos.filter(x=>x.status==='ABERTO');
 const atrasados=abertos.filter(x=>x.previsao&&x.previsao<hoje);
 const ea=document.getElementById('empAbertos'),er=document.getElementById('empAtrasados');
 if(ea)ea.textContent=abertos.length;if(er)er.textContent=atrasados.length;
 let arr=[...db.emprestimos].sort((a,b)=>(b.dataRetirada+b.criadoEm).localeCompare(a.dataRetirada+a.criadoEm));
 if(empFiltro==='ABERTO')arr=arr.filter(x=>x.status==='ABERTO');
 el.innerHTML=arr.length?`<table><thead><tr><th>Material</th><th>Qtd.</th><th>Funcionário</th><th>Setor</th><th>Retirada</th><th>Previsão</th><th>Status</th><th>Ação</th></tr></thead><tbody>${arr.map(x=>{
   const atraso=x.status==='ABERTO'&&x.previsao&&x.previsao<hoje;
   const status=x.status==='DEVOLVIDO'?'Devolvido':atraso?'Atrasado':'Em aberto';
   const cls=x.status==='DEVOLVIDO'?'':atraso?'zero':'low';
   return `<tr><td><b>${esc(mat(x.materialId)?.descricao||'Material removido')}</b></td><td>${x.qtd}</td><td>${esc(x.funcionario)}</td><td>${esc(x.setor)}</td><td>${fmt(x.dataRetirada)}</td><td>${x.previsao?fmt(x.previsao):'-'}</td><td><span class="badge ${cls}">${status}</span></td><td>${x.status==='ABERTO'?`<button class="btn primary" onclick="devolverEmprestimo('${x.id}')">Devolver</button>`:`${x.dataDevolucao?fmt(x.dataDevolucao):'-'}`}</td></tr>`;
 }).join('')}</tbody></table>`:'<div class="notice">Nenhum empréstimo encontrado.</div>';
}
function renderMateriais(){let q=(busca?.value||'').toLowerCase(),arr=db.materiais.filter(m=>(m.codigo+' '+m.descricao).toLowerCase().includes(q));tblMateriais.innerHTML=arr.length?`<table><thead><tr><th>Código</th><th>Material</th><th>Categoria</th><th>Local</th><th>Saldo</th><th>Mínimo</th><th>Ações</th></tr></thead><tbody>${arr.map(m=>{let s=saldo(m.id),c=s===0?'zero':s<=m.minimo?'low':'';return `<tr><td>${esc(m.codigo)}</td><td><b>${esc(m.descricao)}</b><br><span class="label">${esc(m.unidade)}</span></td><td>${esc(m.categoria)}</td><td>${esc(m.localizacao)}</td><td><span class="badge ${c}">${s}</span></td><td>${m.minimo}</td><td><button class="btn secondary" onclick="openMaterial('${m.id}')">Editar</button> <button class="btn danger" onclick="delMaterial('${m.id}')">Excluir</button></td></tr>`}).join('')}</tbody></table>`:'<div class="notice">Nenhum material cadastrado.</div>'}
function renderMov(){let a=[...db.mov].sort((x,y)=>(y.data+y.id).localeCompare(x.data+x.id));tblMov.innerHTML=a.length?`<table><thead><tr><th>Movimentação</th><th>Data</th><th>Tipo</th><th>Material</th><th>Qtd.</th><th>Destino/Origem</th><th>Responsável</th></tr></thead><tbody>${a.map(x=>`<tr><td><b>${esc(x.numero||'-')}</b></td><td>${fmt(x.data)}</td><td><span class="badge ${x.tipo==='SAIDA'?'low':''}">${x.tipo}</span></td><td>${esc(mat(x.materialId)?.descricao||'Material removido')}</td><td>${x.tipo==='SAIDA'?'-':(x.tipo==='ENTRADA'||x.tipo==='DEVOLUCAO')?'+':''}${x.qtd}</td><td>${esc(x.setor||x.origem||'-')}</td><td>${esc(x.recebeu||x.responsavel||'-')}</td></tr>`).join('')}</tbody></table>`:'<div class="notice">Ainda não existem movimentações.</div>'}
function renderInv(){tblInv.innerHTML=db.materiais.length?`<table><thead><tr><th>Material</th><th>Saldo sistema</th><th>Qtd. física</th><th></th></tr></thead><tbody>${db.materiais.map(m=>`<tr><td>${esc(m.codigo)} - ${esc(m.descricao)}</td><td>${saldo(m.id)}</td><td><input id="inv_${m.id}" type="number" min="0" step="0.001" style="max-width:130px"></td><td><button class="btn primary" onclick="ajustar('${m.id}')">Conferir</button></td></tr>`).join('')}</tbody></table>`:'<div class="notice">Cadastre materiais primeiro.</div>'}
async function ajustar(id){
 let el=document.getElementById('inv_'+id);if(el.value==='')return alert('Informe a quantidade física.');
 let fis=+el.value,at=saldo(id),dif=fis-at;if(dif===0)return alert('Estoque correto. Nenhum ajuste necessário.');
 const r=await sb.from('movimentacoes').insert({tipo:'AJUSTE',material_id:id,quantidade:dif,data_movimento:today(),responsavel:cur?.nome||'Inventário',observacao:`Ajuste de ${at} para ${fis}`,usuario_id:cur.id});
 if(r.error)return alert('Erro ao registrar ajuste: '+r.error.message);await loadData();alert('Ajuste registrado.');
}
function go(v){document.querySelector('[data-view='+v+']').click()}
function renderDash(){
 const ss=db.materiais.map(m=>saldo(m.id));
 mMateriais.textContent=db.materiais.length;
 mEstoque.textContent=ss.reduce((a,b)=>a+b,0);
 mBaixo.textContent=db.materiais.filter(m=>{const s=saldo(m.id);return s>0&&s<=m.minimo}).length;
 mMov.textContent=db.materiais.filter(m=>saldo(m.id)===0).length;
 const tl={ENTRADA:['Entrada','in'],SAIDA:['Saída','out'],DEVOLUCAO:['Devolução','ret'],AJUSTE:['Ajuste','adj']};
 const a=db.mov.map((x,i)=>[x,i]).sort((p,q)=>q[0].data.localeCompare(p[0].data)||q[1]-p[1]).slice(0,6).map(p=>p[0]);
 ultimas.innerHTML=a.length?`<div class="mv-wrap"><table class="mv"><thead><tr><th>Data/Hora</th><th>Tipo</th><th>Material</th><th>Quantidade</th><th>Usuário</th><th>Setor</th><th>Observação</th><th></th></tr></thead><tbody>${a.map(x=>{const t=tl[x.tipo]||[x.tipo,'adj'];return `<tr><td>${x.hora?esc(x.hora.replace(',','').slice(0,16)):fmt(x.data)}</td><td><span class="tg ${t[1]}">${t[0]}</span></td><td>${esc(mat(x.materialId)?.descricao||'Material removido')}</td><td>${x.qtd}</td><td>${esc(x.responsavel||'—')}</td><td>${esc(x.setor||x.origem||'—')}</td><td>${esc(x.obs||'—')}</td><td class="dots">⋮</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">Sem movimentações.</div>';
 const lows=db.materiais.map(m=>({m,s:saldo(m.id)})).filter(o=>o.s<=o.m.minimo).sort((x,y)=>x.s-y.s);
 alertas.innerHTML=lows.length?`<div class="al-list">${lows.map(({m,s})=>{const z=s===0;return `<div class="al ${z?'':'low'}"><div class="th"><svg class="ico"><use href="#i-box"/></svg></div><div><h4>${esc(m.descricao.toUpperCase())}<span class="pill">${z?'Sem estoque':'Estoque baixo'}</span></h4><p>Estoque atual: <b>${s} ${esc(m.unidade)}</b></p><p>Estoque mínimo: <b>${m.minimo} ${esc(m.unidade)}</b></p><div class="msg"><svg class="ico"><use href="#${z?'i-alerttri':'i-cart'}"/></svg>${z?'Reposição necessária.':'Comprar '+(m.minimo-s)+' unidades.'}</div></div></div>`}).join('')}</div>`:'<div class="empty">Nenhum alerta de estoque.</div>';
 const bc=document.getElementById('bellCount');if(bc){bc.textContent=lows.length;bc.style.display=lows.length?'grid':'none'}
}
function renderEstoque(){const el=document.getElementById('tblEstoque');if(!el)return;el.innerHTML=db.materiais.length?`<table><thead><tr><th>Código</th><th>Material</th><th>Local</th><th>Saldo</th><th>Mínimo</th></tr></thead><tbody>${db.materiais.map(m=>{const s=saldo(m.id),c=s===0?'zero':s<=m.minimo?'low':'';return `<tr><td>${esc(m.codigo)}</td><td><b>${esc(m.descricao)}</b></td><td>${esc(m.localizacao)}</td><td><span class="badge ${c}">${s} ${esc(m.unidade)}</span></td><td>${m.minimo}</td></tr>`}).join('')}</tbody></table>`:'<div class="notice">Nenhum material cadastrado.</div>'}
function renderReports(){let ent=db.mov.filter(x=>x.tipo==='ENTRADA').reduce((a,x)=>a+x.qtd,0),sai=db.mov.filter(x=>x.tipo==='SAIDA').reduce((a,x)=>a+x.qtd,0);rEnt.textContent=ent;rSai.textContent=sai;rZero.textContent=db.materiais.filter(m=>saldo(m.id)===0).length;rLow.textContent=db.materiais.filter(m=>saldo(m.id)>0&&saldo(m.id)<=m.minimo).length;let map={};db.mov.filter(x=>x.tipo==='SAIDA').forEach(x=>map[x.setor||'Não informado']=(map[x.setor||'Não informado']||0)+x.qtd);setores.innerHTML=Object.keys(map).length?`<table><thead><tr><th>Setor</th><th>Quantidade retirada</th></tr></thead><tbody>${Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table>`:'<span class="label">Sem saídas registradas.</span>'}
function exportar(){let b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='backup_almox_control_'+today()+'.json';a.click();URL.revokeObjectURL(a.href)}
function importar(){alert('Na versão Online, a importação direta de backup está desativada para proteger o banco compartilhado.');}
function limpar(){alert('Na versão Online, os dados compartilhados não podem ser apagados pelo navegador.');}
function renderAll(){renderForms();renderMateriais();renderMov();renderInv();renderDash();renderReports();renderV53();renderEstoque();renderEmprestimos();renderUsers();updateProfessionalUI()}
function updateHeaderClock(){
 const now=new Date();
 const date=document.getElementById('spDate'), clock=document.getElementById('spClock');
 if(date){let t=now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});date.textContent=t.charAt(0).toUpperCase()+t.slice(1)}
 if(clock) clock.textContent=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();globalSearch.focus()}});
setInterval(updateHeaderClock,1000);
function renderV53(){
 let saidas={};
 db.mov.filter(x=>x.tipo==='SAIDA').forEach(x=>saidas[x.materialId]=(saidas[x.materialId]||0)+Number(x.qtd||0));
 let ranking=db.materiais.map(m=>({m,q:saidas[m.id]||0})).filter(x=>x.q>0).sort((a,b)=>b.q-a.q).slice(0,3);
 let max=Math.max(1,...ranking.map(x=>x.q));
 const nc=['#d6000b','#f5a300','#ffc400'],bc=['#d6000b','#f5c400','#d6000b'];
 let el=document.getElementById('spRanking');
 if(el)el.innerHTML=ranking.length?ranking.map((x,i)=>`<div class="rk"><span class="n" style="background:${nc[i]}">${i+1}</span><div><div class="l"><span>${esc(x.m.descricao.toUpperCase())}</span><span>${x.q} un.</span></div><div class="bar"><i style="width:${Math.max(8,x.q/max*100)}%;background:${bc[i]}"></i></div></div></div>`).join(''):'<div class="empty">Sem saídas registradas.</div>';
 let sd=db.materiais.map(m=>({s:saldo(m.id),min:m.minimo}));
 let zero=sd.filter(o=>o.s===0).length,low=sd.filter(o=>o.s>0&&o.s<=o.min).length,normal=sd.filter(o=>o.s>o.min).length,total=sd.length;
 let st=document.getElementById('spTotal');if(st)st.textContent=sd.reduce((a,o)=>a+o.s,0);
 let it=n=>n===1?'item':'itens';
 let lg=document.getElementById('spLegend');if(lg)lg.innerHTML=`<div><i style="background:#10a85f"></i>Em estoque<em>${normal} ${it(normal)}</em></div><div><i style="background:#ffd000"></i>Estoque baixo<em>${low} ${it(low)}</em></div><div><i style="background:#e30613"></i>Sem estoque<em>${zero} ${it(zero)}</em></div>`;
 let d=document.getElementById('spDonut');
 if(d)d.style.background=total?`conic-gradient(#10a85f 0 ${normal/total*100}%,#ffd000 ${normal/total*100}% ${(normal+low)/total*100}%,#e30613 ${(normal+low)/total*100}% 100%)`:'#e9edf2';
}

function updateProfessionalUI(){
 let d=document.getElementById('dashDate');
 if(d)d.textContent='SERIDOPLAST • CD Cruzeta • '+new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
 document.title='SERIDOPLAST | Almoxarifado Interno';
}

/* ===== Supabase Online: autenticação, dados e tempo real ===== */
const byId=id=>document.getElementById(id);
const isAdmin=()=>!!cur&&cur.perfil==='ADMIN';
function showErr(id,msg){const e=byId(id);if(!e)return;e.textContent=msg;e.classList.toggle('on',!!msg)}
function showAuth(){
 byId('authLogo').src=document.querySelector('.brand img').src;
 byId('setupForm').style.display='none';
 byId('loginForm').style.display='block';
 const title=byId('loginForm').querySelector('h2'); if(title) title.textContent='Entrar no sistema';
 const lab=byId('loginForm').querySelector('label'); if(lab) lab.textContent='Login';
 byId('au_login').type='text';byId('au_login').placeholder='Ex.: hutson';
 showErr('loginErr','');
 setTimeout(()=>byId('au_login').focus(),30);
}
function applyUser(){
 byId('uName').textContent=(cur.nome||cur.email||'Usuário').split(' ')[0];
 byId('uRole').textContent=cur.perfil==='ADMIN'?'Administrador':'Operador';
 document.querySelectorAll('[data-admin]').forEach(b=>b.style.display=isAdmin()?'':'none');
}
async function loadData(){
 const [rm,rv,rs,re]=await Promise.all([
   sb.from('materiais').select('*').eq('ativo',true).order('descricao'),
   sb.from('movimentacoes').select('*').order('criado_em',{ascending:false}),
   sb.from('setores').select('*').eq('ativo',true).order('nome'),
   sb.from('emprestimos').select('*').order('criado_em',{ascending:false})
 ]);
 const err=rm.error||rv.error||rs.error||re.error;
 if(err){console.error(err);alert('Falha ao carregar dados do servidor: '+err.message);return}
 db.materiais=(rm.data||[]).map(m=>({...m,obs:m.observacao||''}));
 db.mov=(rv.data||[]).map(x=>({id:x.id,numero:'MOV-'+String(x.numero).padStart(6,'0'),hora:new Date(x.criado_em).toLocaleString('pt-BR'),tipo:x.tipo,materialId:x.material_id,qtd:Number(x.quantidade),data:x.data_movimento,setor:x.setor||'',origem:x.origem||'',doc:x.documento||'',recebeu:x.recebeu||'',responsavel:x.responsavel||'',obs:x.observacao||''}));
 db.setores=(rs.data||[]).map(x=>x.nome);
 db.emprestimos=(re.data||[]).map(x=>({id:x.id,materialId:x.material_id,qtd:Number(x.quantidade),funcionario:x.funcionario,setor:x.setor||'',dataRetirada:x.data_retirada,previsao:x.previsao_devolucao||'',status:x.status,dataDevolucao:x.data_devolucao||'',observacao:x.observacao||'',criadoEm:x.criado_em||''}));
 renderAll();
}
async function loadProfile(user){
 const r=await sb.from('perfis').select('*').eq('id',user.id).single();
 if(r.error)throw r.error;
 cur={id:user.id,email:user.email,nome:r.data.nome||user.email,perfil:r.data.perfil,ativo:r.data.ativo};
 if(!cur.ativo)throw new Error('Usuário desativado.');
}
async function startOnline(user){
 await loadProfile(user);
 document.body.classList.remove('locked');applyUser();await loadData();go('dashboard');subscribeRealtime();
}
async function doLogin(e){
 e.preventDefault();showErr('loginErr','');
 const login=byId('au_login').value.trim().toLowerCase(),password=byId('au_pass').value;
 if(!/^[a-z0-9._-]{3,}$/.test(login)){showErr('loginErr','Informe um login válido.');return}
 const resolved=await sb.rpc('resolver_login',{p_login:login});
 if(resolved.error||!resolved.data){showErr('loginErr','Login ou senha incorretos.');return}
 const {data,error}=await sb.auth.signInWithPassword({email:resolved.data,password});
 if(error){showErr('loginErr','Login ou senha incorretos.');return}
 byId('au_pass').value='';
 try{await startOnline(data.user)}catch(err){await sb.auth.signOut();showErr('loginErr',err.message||'Acesso não autorizado.')}
}
async function logout(){cur=null;if(realtimeChannel){await sb.removeChannel(realtimeChannel);realtimeChannel=null}await sb.auth.signOut();document.body.classList.add('locked');showAuth();}
function subscribeRealtime(){
 if(realtimeChannel)sb.removeChannel(realtimeChannel);
 realtimeChannel=sb.channel('almox-online')
 .on('postgres_changes',{event:'*',schema:'public',table:'materiais'},()=>loadData())
 .on('postgres_changes',{event:'*',schema:'public',table:'movimentacoes'},()=>loadData())
 .on('postgres_changes',{event:'*',schema:'public',table:'setores'},()=>loadData())
 .on('postgres_changes',{event:'*',schema:'public',table:'emprestimos'},()=>loadData())
 .subscribe();
}
async function renderUsers(){
 const el=byId('tblUsers');if(!el)return;
 const bt=byId('btnNewUser');if(bt){bt.style.display=isAdmin()?'':'none';bt.onclick=()=>openUser('')}
 if(!isAdmin()){el.innerHTML='<div class="notice">Acesso restrito a administradores.</div>';return}
 const r=await sb.from('perfis').select('*').order('nome');
 if(r.error){el.innerHTML='<div class="notice">Erro ao carregar usuários: '+esc(r.error.message)+'</div>';return}
 users=r.data||[];
 el.innerHTML=`<table><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Status</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>${users.map(u=>`
 <tr>
  <td><b>${esc(u.nome)}</b>${u.id===cur.id?' <span class="badge">Você</span>':''}</td>
  <td><b>${esc(u.login||'—')}</b></td>
  <td><span class="badge">${esc(u.perfil)}</span></td>
  <td><span class="badge ${u.ativo?'':'zero'}">${u.ativo?'Ativo':'Bloqueado'}</span></td>
  <td>${u.criado_em?new Date(u.criado_em).toLocaleDateString('pt-BR'):'—'}</td>
  <td>${u.id===cur.id
    ?`<button class="btn secondary" onclick="openUser('${u.id}')">Editar</button>
      <button class="btn secondary" onclick="changeMyPassword()">Alterar minha senha</button>
      <span class="label" style="margin-left:6px">Usuário atual</span>`
    :`<button class="btn secondary" onclick="openUser('${u.id}')">Editar</button>
      <button class="btn ${u.ativo?'danger':'primary'}" onclick="toggleUserActive('${u.id}',${u.ativo})">${u.ativo?'Bloquear':'Ativar'}</button>
      <button class="btn secondary" onclick="resetUserPassword('${u.id}','${esc(u.nome).replace(/'/g,"&#39;")}')">Redefinir senha</button>
      <button class="btn danger" onclick="deleteUser('${u.id}','${esc(u.nome).replace(/'/g,"&#39;")}')">Excluir</button>`}
  </td>
 </tr>`).join('')}</tbody></table>`;
}
function openUser(id=''){
 if(!isAdmin())return alert('Somente administradores podem gerenciar usuários.');
 const u=id?users.find(x=>x.id===id):null;
 byId('um_id').value=u?.id||'';
 byId('um_nome').value=u?.nome||'';
 byId('um_login').value=u?.login||'';
 byId('um_login').type='text';
 byId('um_login').placeholder='Ex.: hutson';
 byId('um_login').disabled=false;
 byId('um_perfil').value=u?.perfil||'OPERADOR';
 byId('um_perfil').disabled=!!u && u.id===cur.id;
 byId('um_pw').value='';byId('um_pw2').value='';
 byId('umTitle').textContent=u?'Editar nome e permissão':'Novo usuário';
 const loginLabel=byId('um_login').closest('label')||byId('um_login').parentElement;
 byId('umPwLabel').textContent=u?'Senha':'Senha inicial *';
 byId('umPwHint').textContent=u?'A senha é gerenciada pelo próprio usuário/Supabase. Aqui você pode alterar nome e permissão.':'Mínimo de 6 caracteres.';
 byId('um_pw').closest('label')?.style && (byId('um_pw').closest('label').style.display=u?'none':'');
 byId('um_pw2').closest('label')?.style && (byId('um_pw2').closest('label').style.display=u?'none':'');
 showErr('umErr','');byId('userModal').classList.add('open');
 setTimeout(()=>byId('um_nome').focus(),30);
}
function closeUser(){byId('userModal').classList.remove('open')}
byId('umForm').onsubmit=async e=>{
 e.preventDefault();if(!isAdmin())return;
 showErr('umErr','');
 const id=byId('um_id').value;
 const nome=byId('um_nome').value.trim();
 const login=byId('um_login').value.trim().toLowerCase();
 let perfil=byId('um_perfil').value;
 const pw=byId('um_pw').value,pw2=byId('um_pw2').value;
 if(id && id===cur.id) perfil='ADMIN';
 if(!nome)return showErr('umErr','Informe o nome do usuário.');
 if(id){
   if(!/^[a-z0-9._-]{3,}$/.test(login))return showErr('umErr','Login: mínimo 3 caracteres; use letras, números, ponto, hífen ou _.');
   const r=await sb.functions.invoke('criar-usuario',{body:{acao:'editar',user_id:id,nome,login,perfil}});
   if(r.error){
     let msg=r.error.message||'Falha ao editar usuário.';
     try{if(r.error.context){const b=await r.error.context.json();if(b?.error)msg=b.error}}catch(_){}
     return showErr('umErr','Não foi possível editar o usuário: '+msg);
   }
   if(!r.data?.ok)return showErr('umErr','Não foi possível editar o usuário: '+(r.data?.error||'erro desconhecido'));
   if(id===cur.id){
     cur.nome=nome;cur.login=login;cur.perfil='ADMIN';
     applyUserUI();
   }
   closeUser();await renderUsers();
   alert('Usuário atualizado com sucesso.');
   return;
 }
 if(!/^[a-z0-9._-]{3,}$/.test(login))return showErr('umErr','Login: mínimo 3 caracteres; use letras, números, ponto, hífen ou _.');
 const exists=await sb.from('perfis').select('id').eq('login',login).maybeSingle();
 if(exists.data)return showErr('umErr','Este login já está em uso.');
 if(pw.length<6)return showErr('umErr','A senha precisa ter pelo menos 6 caracteres.');
 if(pw!==pw2)return showErr('umErr','As senhas não conferem.');
 const created=await sb.functions.invoke('criar-usuario',{body:{nome,login,password:pw,perfil}});
 if(created.error){
   let msg=created.error.message||'Falha ao chamar o serviço de usuários.';
   try{
     if(created.error.context){
       const body=await created.error.context.json();
       if(body?.error)msg=body.error;
     }
   }catch(_){}
   return showErr('umErr','Não foi possível criar o usuário: '+msg);
 }
 if(!created.data?.ok)return showErr('umErr','Não foi possível criar o usuário: '+(created.data?.error||'erro desconhecido'));
 closeUser();await renderUsers();
 alert('Usuário criado com sucesso.');
};
async function changeMyPassword(){
 const senha=prompt('Digite sua NOVA senha (mínimo 6 caracteres):');
 if(senha===null)return;
 if(senha.length<6)return alert('A senha deve ter pelo menos 6 caracteres.');
 const confirma=prompt('Digite novamente a nova senha:');
 if(confirma===null)return;
 if(senha!==confirma)return alert('As senhas não conferem.');
 const {error}=await sb.auth.updateUser({password:senha});
 if(error)return alert('Não foi possível alterar a senha: '+error.message);
 alert('Sua senha foi alterada com sucesso.');
}
async function resetUserPassword(id,nome){
 if(!isAdmin())return alert('Somente administradores podem redefinir senhas.');
 if(id===cur.id)return changeMyPassword();
 const senha=prompt(`Nova senha para "${nome}" (mínimo 6 caracteres):`);
 if(senha===null)return;
 if(senha.length<6)return alert('A senha deve ter pelo menos 6 caracteres.');
 const confirma=prompt('Confirme a nova senha:');
 if(confirma===null)return;
 if(senha!==confirma)return alert('As senhas não conferem.');
 if(!confirm(`Confirma a redefinição da senha de "${nome}"?`))return;
 const r=await sb.functions.invoke('criar-usuario',{body:{acao:'redefinir_senha',user_id:id,password:senha}});
 if(r.error){
   let msg=r.error.message||'Falha ao redefinir a senha.';
   try{if(r.error.context){const b=await r.error.context.json();if(b?.error)msg=b.error}}catch(_){}
   return alert('Não foi possível redefinir a senha: '+msg);
 }
 if(!r.data?.ok)return alert('Não foi possível redefinir a senha: '+(r.data?.error||'erro desconhecido'));
 alert('Senha redefinida com sucesso.');
}
async function deleteUser(id,nome){
 if(!isAdmin())return alert('Somente administradores podem excluir usuários.');
 if(id===cur.id)return alert('Você não pode excluir sua própria conta.');
 if(!confirm(`Excluir definitivamente o usuário "${nome}"?\n\nO acesso dele será removido. Esta ação não pode ser desfeita.`))return;
 const r=await sb.functions.invoke('criar-usuario',{body:{acao:'excluir',user_id:id}});
 if(r.error){
   let msg=r.error.message||'Falha ao excluir.';
   try{if(r.error.context){const b=await r.error.context.json();if(b?.error)msg=b.error}}catch(_){}
   return alert('Não foi possível excluir o usuário: '+msg);
 }
 if(!r.data?.ok)return alert('Não foi possível excluir o usuário: '+(r.data?.error||'erro desconhecido'));
 await renderUsers();
 alert('Usuário excluído com sucesso.');
}
async function toggleUserActive(id,ativo){
 if(!isAdmin())return;
 const acao=ativo?'bloquear':'ativar';
 if(!confirm('Deseja '+acao+' este usuário?'))return;
 const r=await sb.from('perfis').update({ativo:!ativo}).eq('id',id);
 if(r.error)return alert('Erro: '+r.error.message);
 await renderUsers();
}
async function toggleRole(id,perfil){
 if(!isAdmin())return;
 const novo=perfil==='ADMIN'?'OPERADOR':'ADMIN';
 const r=await sb.from('perfis').update({perfil:novo}).eq('id',id);
 if(r.error)return alert('Erro: '+r.error.message);await renderUsers();
}
function setRole(){}
function delUser(){alert('Use o botão Bloquear para impedir o acesso sem apagar o histórico do usuário.');}
byId('nav').addEventListener('click',e=>{const b=e.target.closest('button');if(b&&b.dataset.view==='usuarios'&&!isAdmin()){e.stopPropagation();alert('Somente administradores podem acessar Usuários.')}},true);
(async function initOnline(){
 const {data}=await sb.auth.getSession();
 if(data.session?.user){try{await startOnline(data.session.user)}catch(e){console.error(e);showAuth()}}
 else showAuth();
})();
updateHeaderClock();
