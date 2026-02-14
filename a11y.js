/* a11y.js — Matemágica v19
   - VLibras (online) com botão flutuante padrão do widget
   - Não quebra offline: só injeta quando navigator.onLine e script carregar
*/
(function(){
  'use strict';

  const KEY = 'matemagica_a11y_v1';
  const defaults = { vlibrasEnabled: true };
  function load(){
    try{ return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch(e){ return Object.assign({}, defaults); }
  }
  function save(state){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
  }
  let state = load();

  function ensureVRoot(){
    let root = document.getElementById('vlibras-root');
    if (!root){
      root = document.createElement('div');
      root.id = 'vlibras-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function clearVRoot(){
    const root = document.getElementById('vlibras-root');
    if (root) root.innerHTML = '';
  }

  function injectWidget(){
    if (!state.vlibrasEnabled) return;
    if (!navigator.onLine) return;
    if (document.getElementById('vlibras-plugin-js')) return; // já carregou

    const root = ensureVRoot();
    root.innerHTML = `
      <div vw class="enabled">
        <div vw-access-button class="active"></div>
        <div vw-plugin-wrapper>
          <div class="vw-plugin-top-wrapper"></div>
        </div>
      </div>
    `;

    const s = document.createElement('script');
    s.id = 'vlibras-plugin-js';
    s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    s.async = true;
    s.onload = function(){
      try{
        if (window.VLibras && window.VLibras.Widget){
          new window.VLibras.Widget('https://vlibras.gov.br/app');
        }
      }catch(e){}
    };
    s.onerror = function(){
      // falhou online (rede/blocked). Não quebra o app.
      try{ clearVRoot(); }catch(e){}
    };
    document.body.appendChild(s);
  }

  function removeWidget(){
    clearVRoot();
    const s = document.getElementById('vlibras-plugin-js');
    if (s) s.remove();
  }

  function setEnabled(on){
    state.vlibrasEnabled = !!on;
    save(state);
    if (state.vlibrasEnabled) injectWidget();
    else removeWidget();
    window.dispatchEvent(new CustomEvent('matemagica:a11y', { detail: { ...state } }));
  }

  // Expor API mínima
  window.MatemagicaA11y = {
    getState: ()=>({ ...state }),
    setVlibrasEnabled: (on)=>setEnabled(!!on),
  };

  // Boot: injeta se habilitado e online
  function boot(){
    if (state.vlibrasEnabled) injectWidget();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Quando voltar a internet, tenta injetar
  window.addEventListener('online', ()=>{ if (state.vlibrasEnabled) injectWidget(); });

  // Se outra aba mudar config
  window.addEventListener('storage', (e)=>{
    if (e.key !== KEY) return;
    state = load();
    if (state.vlibrasEnabled) injectWidget(); else removeWidget();
  });
})();
