/* Optional desktop experience. Mobile behavior is intentionally untouched. */
(function(){
  const desktopQuery=window.matchMedia('(min-width: 901px) and (pointer: fine)');
  if(!desktopQuery.matches)return;

  const game=document.getElementById('gameArea');
  const toggle=document.getElementById('countryDesktopToggle');
  const label=document.getElementById('countryDesktopToggleText');
  if(!game||!toggle)return;

  const STORAGE_KEY='countriesDesktopLayout';
  function savedPreference(){
    const value=localStorage.getItem(STORAGE_KEY);
    if(value===null)return true; // laptops default to the purpose-built layout
    return value==='1';
  }
  function apply(enabled){
    game.classList.toggle('desktop-layout',enabled);
    toggle.checked=enabled;
    if(label)label.textContent=enabled?'Desktop layout':'Phone layout';
    localStorage.setItem(STORAGE_KEY,enabled?'1':'0');
    requestAnimationFrame(()=>{
      if(typeof layoutAllCountryLabels==='function')layoutAllCountryLabels();
    });
  }
  toggle.addEventListener('change',()=>apply(toggle.checked));
  apply(savedPreference());
})();