'use strict';
// Practice uses the published deck and the same study timings. It has no socket
// connection and cannot occupy a player seat or change the multiplayer score.
const app=document.getElementById('app');let deck=[],round=0,score=0,phase='loading-deck',card=null,die=0,deadline=0,alarm=null,answer='',lastCorrect=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const back=()=>MemoryUI.deck();
function change(next,ms=0){clearTimeout(alarm);phase=next;deadline=ms?Date.now()+ms:0;render();if(ms)alarm=setTimeout(()=>change(next==='intro'?'deck':next==='countdown'?'study':next==='study'?'fade':'roll',next==='countdown'?30000:next==='study'?650:0),ms);}
function shuffleQuestions(list){for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
function start(){round=0;score=0;deck=deck.map(c=>{if(!c.pictureQuestions)return c;const pool=[...c.pictureQuestions];for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return {...c,questions:shuffleQuestions([...pool.slice(0,4),...c.questions.filter(q=>q.kind==='fact')])};});for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}change('intro',2200);}
document.getElementById('restart').onclick=()=>{if(deck.length)start();};
function render(){
 let html='';const question=card?.questions[die-1],correct=question?String(card.country[question.field]):'';
 if(phase==='loading-deck')html='<h1>Getting the deck ready…</h1>';
 else if(phase==='error')html='<h1>Couldn’t load the deck.</h1><p class="muted">Check your connection and try again.</p><button id="retry" class="primary">Try again</button>';
 else if(phase==='intro')html=`<span class="kicker">No opponent needed</span>${back()}<h1>Take a good look.</h1><p class="muted">Six cards. Thirty seconds each.<br>Check your answer and mark your score.</p>`;
 else if(phase==='deck')html=`<span class="kicker">Your practice table</span>${back()}<h1>Your card is waiting.</h1><p class="muted">Draw a country and try the full game flow.</p><button class="gold wide" id="draw">Draw a country card</button>`;
 else if(phase==='loading-picture')html=`${back()}<h2>Preparing your card…</h2><p class="muted">The timer starts after the picture loads.</p><button id="picture-retry" hidden>Retry picture</button>`;
 else if(phase==='countdown')html='<span class="kicker">Eyes on the card</span><div class="count" id="count">3</div><h2>Make it count.</h2>';
 else if(phase==='study'){const c=card.country;html=`<div class="study-head"><h2>${esc(c.name)}</h2><span class="timer" id="count">30</span></div><div class="art-box"><img src="${esc(c.art)}" alt="${esc(c.name)} study picture"></div><div class="captions">${(c.captions||[['Capital',c.capital],['Food',c.food],['Animal',c.animal],['Did you know?',c.funFact]]).map(([k,v])=>`<div class="caption"><b>${k}:</b> ${esc(v)}</div>`).join('')}</div><button class="skip-timer" id="skip">Skip timer · practice only</button>`;}
 else if(phase==='fade'&&app.querySelector('.study'))html=app.querySelector('.study').innerHTML;
 else if(phase==='fade')html=`<div class="fade-card">${back()}</div><h2>Card down.</h2>`;
 else if(phase==='roll')html=`<span class="kicker">Your memory. Your roll.</span>${MemoryUI.die(5)}<h2>Let the die decide.</h2><button class="gold wide" id="roll">Roll the die</button>`;
 else if(phase==='question')html=`<span class="kicker">Question ${die} of 6</span>${MemoryUI.die(die,true)}<p class="question-text">${esc(question.text)}</p><p class="muted">Say your answer aloud or write it below.</p><form class="answer-form"><input aria-label="Your answer" maxlength="180" placeholder="Your answer (optional)"><button class="primary">Check answer</button></form>`;
 else if(phase==='reveal')html=`<span class="kicker">Question ${die}</span><p class="question-text">${esc(question.text)}</p>${answer?`<p>Your answer: ${esc(answer)}</p>`:''}<div class="answer-box"><span class="kicker">Correct answer</span><p><strong>${esc(correct)}</strong></p></div><p class="muted">How did you do?</p><div class="row wide"><button class="primary" data-mark="yes">I got it · +1</button><button data-mark="no">I missed it</button></div>`;
 else if(phase==='result')html=`<span class="kicker">${lastCorrect?'Correct · +1 point':'Not this time'}</span><h1 class="round-title">${lastCorrect?'Well remembered.':'One to remember.'}</h1>${MemoryUI.review(card.country)}<p>The answer was <strong>${esc(correct)}</strong>.</p><button class="primary wide" id="next">${round===5?'See practice score':'Next card'}</button>`;
 else if(phase==='over')html=`<span class="kicker">Practice complete</span><h1>${score} out of 6</h1><p class="muted">${score===6?'Every detail remembered. Ready to play Ariel?':'Try another six cards or invite Ariel to a match.'}</p><button class="gold wide" id="again">Practise again</button><a class="practice-link" href="/country-memory.html">Play Louie versus Ariel</a>`;
 app.innerHTML=`<div class="hud"><span>Solo practice</span><span>Card ${Math.min(round+1,6)} / 6</span><span>Score <b>${score}</b></span></div>${MemoryUI.progress(phase==='over'?6:round,6)}<section class="screen ${['study','fade'].includes(phase)?'study':'centre'} ${phase==='intro'?'intro':phase==='fade'?'fade-card':''}">${html}</section>`;
 const on=(id,fn)=>{const e=document.getElementById(id);if(e)e.onclick=fn;};
 on('retry',load);on('draw',()=>{card=deck[round];die=0;answer='';change('loading-picture');const image=new Image();const ready=()=>{image.onload=()=>{if(phase==='loading-picture')change('countdown',3000);};image.onerror=()=>{const b=document.getElementById('picture-retry');if(b){b.hidden=false;b.onclick=ready;}};image.src=card.country.art;};ready();});
 on('skip',()=>change('fade',650));on('roll',()=>{die=1+Math.floor(Math.random()*6);change('question');});
 const form=app.querySelector('form');if(form)form.onsubmit=e=>{e.preventDefault();answer=form.querySelector('input').value.trim();change('reveal');};
 app.querySelectorAll('[data-mark]').forEach(b=>b.onclick=()=>{lastCorrect=b.dataset.mark==='yes';if(lastCorrect)score++;change('result');});on('next',()=>{round++;change(round===6?'over':'deck');});on('again',start);app.querySelector('[data-review]')?.addEventListener('click',()=>MemoryUI.openReview(card.country,correct));tick();
}
function tick(){const e=document.getElementById('count');if(e&&deadline){const n=Math.max(0,Math.ceil((deadline-Date.now())/1000));MemoryUI.timer(e,n);e.classList.toggle('urgent',phase==='study'&&n<=5);}}
async function load(){change('loading-deck');try{const r=await fetch('/api/country-memory/practice');if(!r.ok)throw Error();deck=await r.json();if(deck.length<6)throw Error();start();}catch{change('error');}}
setInterval(tick,150);render();load();
