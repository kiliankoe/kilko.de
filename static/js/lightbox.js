// Click an image on a detail page to view it large; click again or press
// Escape to close.
(function () {
  var overlay = null;

  function close() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function open(src, alt) {
    close();
    overlay = document.createElement("div");
    overlay.className = "lightbox";
    var img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    overlay.appendChild(img);
    overlay.addEventListener("click", close);
    document.body.appendChild(overlay);
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") close();
  });

  document
    .querySelectorAll(".feed-item-media img, .review-image, .media-info > img")
    .forEach(function (img) {
      img.classList.add("lightbox-target");
      img.addEventListener("click", function () {
        open(img.src, img.alt);
      });
    });
})();
