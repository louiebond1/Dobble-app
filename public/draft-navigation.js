(() => {
  const back = document.getElementById("nav-back");
  if (!back) return;
  back.addEventListener("click", () => {
    const active = page === "game" && room && !["lobby", "results"].includes(room.status);
    if (active && !window.confirm("Return to Draft Night home? Your current game may continue without you.")) return;
    window.location.assign("/draft-night.html?home=1");
  });
})();
