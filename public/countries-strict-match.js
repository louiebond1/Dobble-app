/* Strict answer validation for Countries.
   Keep exact normalized country/alias matches from countries.js, but disable
   Levenshtein/predictive matching so incomplete or substantially misspelled
   guesses do not auto-resolve (e.g. 'irela', 'zaia', 'swaili'). */
(function(){
  if (typeof fuzzyMatchCountry === 'function') {
    fuzzyMatchCountry = function(){ return null; };
  }
})();
