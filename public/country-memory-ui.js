'use strict';
const MemoryUI = {
  esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  deck(){return `<div class="deck-area" aria-hidden="true"><div class="deck-card"><svg class="deck-globe" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="40" cy="40" r="30"/><ellipse cx="40" cy="40" rx="13" ry="30"/><path d="M10 40h60M15 24h50M15 56h50M40 10v60"/></svg><span class="deck-title">Country<br>Memory</span><small>LOOK · REMEMBER</small></div></div>`;},
  progress(turn,total){return `<div class="round-progress" role="img" aria-label="${Math.min(turn,total)} of ${total} cards completed">${Array.from({length:total},(_,i)=>`<i class="${i<turn?'done':i===turn?'current':''}"></i>`).join('')}</div>`;},
  die(value=5,rolling=false){const positions={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]}[value]||[5];return `<div class="die pip-die ${rolling?'rolling':''}" role="img" aria-label="Die shows ${value}">${Array.from({length:9},(_,i)=>`<i class="pip ${positions.includes(i+1)?'':'empty'}"></i>`).join('')}</div>`;},
  review(card){return `<button class="review-card" aria-label="Look again at ${this.esc(card.name)}" data-review><img src="${this.esc(card.art)}" alt="${this.esc(card.name)} picture from this round"><span>${this.esc(card.name)} · Look again ↗</span></button>`;},
  openReview(card,answer){document.getElementById('card-review')?.remove();const d=document.createElement('dialog');d.id='card-review';d.className='card-review';d.innerHTML=`<div class="review-heading"><h2>${this.esc(card.name)}</h2><button autofocus aria-label="Close picture">Close ×</button></div><img src="${this.esc(card.art)}" alt="${this.esc(card.name)} picture from this round"><p>The answer was <strong>${this.esc(answer)}</strong>.</p>`;document.body.append(d);d.querySelector('button').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d)d.close();});d.addEventListener('close',()=>d.remove());d.showModal();},
  timer(el,seconds){if(!el)return;el.textContent=seconds;el.style.setProperty('--remaining',Math.min(1,seconds/30));el.setAttribute('aria-label',seconds+' seconds remaining');}
};
// Keep the answer controls above mobile on-screen keyboards.
function fitMemoryViewport(){const input=document.querySelector('.answer-form input');const typing=!!input&&(document.activeElement===input||document.body.classList.contains('typing-answer'));document.body.classList.toggle('typing-answer',typing);document.body.style.setProperty('--app-height',typing&&window.visualViewport?window.visualViewport.height+'px':'100dvh');}
window.visualViewport?.addEventListener('resize',fitMemoryViewport);
document.addEventListener('focusin',fitMemoryViewport);
document.addEventListener('focusout',()=>setTimeout(fitMemoryViewport,0));
