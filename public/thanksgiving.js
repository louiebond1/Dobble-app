(() => {
  const key = 'favethings:game-theme';
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const classicColor = meta?.content;
  const symbols = [["🦃","Runaway turkey"],
    ["🥧","Pumpkin pie"],
    ["🌽","Corn on the cob"],
    ["🥔","Potato"],
    ["🍠","Sweet potato"],
    ["🎃","Pumpkin"],
    ["🍁","Maple leaf"],
    ["🍂","Autumn leaves"],
    ["🥐","Crescent roll"],
    ["🍞","Stuffing bread"],
    ["🧈","Butter"],
    ["🥕","Carrots"],
    ["🍎","Red apple"],
    ["🍐","Pear"],
    ["🍇","Grapes"],
    ["🫐","Blueberries"],
    ["🍒","Cherries"],
    ["🌰","Chestnut"],
    ["🥜","Peanuts"],
    ["🍄","Mushroom"],
    ["🥦","Broccoli"],
    ["🧅","Onion"],
    ["🧄","Garlic"],
    ["🫛","Green beans"],
    ["🥬","Greens"],
    ["🥗","Salad"],
    ["🥘","Casserole"],
    ["🥣","Gravy bowl"],
    ["🍯","Honey"],
    ["🧂","Salt"],
    ["🌶️","Chilli"],
    ["🧀","Cheese"],
    ["🍪","Cookie"],
    ["🍨","Ice cream"],
    ["🧁","Cupcake"],
    ["🍰","Cake"],
    ["🍩","Doughnut"],
    ["☕","Hot chocolate"],
    ["🧃","Apple juice"],
    ["🫖","Teapot"],
    ["🥂","Toast"],
    ["🍽️","Dinner plate"],
    ["🥄","Serving spoon"],
    ["🔔","Dinner bell"],
    ["🕯️","Candle"],
    ["🧺","Harvest basket"],
    ["👨‍🍳","Chef"],
    ["🧤","Oven mitt"],
    ["⏲️","Kitchen timer"],
    ["🏈","Football"],
    ["🏆","Turkey trophy"],
    ["🎈","Parade balloon"],
    ["🥁","Parade drum"],
    ["🛋️","Nap couch"],
    ["🧣","Scarf"],
    ["🐿️","Squirrel"],
    ["🦊","Fox"]];
  let choice;
  try { choice = localStorage.getItem(key); } catch {}

  function inSeason() {
    const now = new Date();
    const year = now.getFullYear();
    const first = new Date(year, 10, 1);
    const thursday = 22 + (4 - first.getDay() + 7) % 7;
    return now >= new Date(year, 10, thursday - 1) && now < new Date(year, 10, thursday + 4);
  }

  function paint() {
    const festive = choice ? choice === 'thanksgiving' : inSeason();
    root.classList.toggle('thanksgiving', festive);
    if (meta) meta.content = festive ? '#66213a' : classicColor;
    const button = document.querySelector('.feast-switch');
    if (button) button.setAttribute('aria-pressed', String(festive));
  }

  paint();
  window.thanksgivingSymbol = id => symbols[id];
  document.addEventListener('DOMContentLoaded', () => {
    paint();
    document.querySelector('.feast-switch')?.addEventListener('click', () => {
      choice = root.classList.contains('thanksgiving') ? 'classic' : 'thanksgiving';
      try { localStorage.setItem(key, choice); } catch {}
      paint();
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      try { choice = localStorage.getItem(key); } catch {}
      paint();
    }
  });
})();
