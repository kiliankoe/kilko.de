// Computed client-side so the warning stays accurate without a rebuild.
(function () {
  document.querySelectorAll(".age-warning[data-published]").forEach(function (el) {
    var published = new Date(el.dataset.published);
    var months = (Date.now() - published.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (months < 12) return;
    var diff =
      months >= 24
        ? Math.floor(months / 12) + " years"
        : Math.floor(months) + " months";
    var dateText = published.toLocaleDateString("en", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    el.textContent =
      "Please be aware that this post was written on " + dateText +
      ", which is over " + diff + " ago now. The post may be quite " +
      "out of date, in regards to the content and my views on it 🙃";
    el.hidden = false;
  });
})();
