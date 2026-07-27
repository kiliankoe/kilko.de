// Ported from kilian.io (jQuery + konami.js) to vanilla JS.
(function () {
  var postscriptum = document.getElementById("postscriptum");
  if (!postscriptum) return;

  setTimeout(function () {
    postscriptum.hidden = false;
  }, 10000);

  function randomColor() {
    var color = "#";
    for (var i = 0; i < 6; i++) {
      color += "0123456789ABCDEF"[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  var sequence = [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
    "b", "a",
  ];
  var triggered = false;

  // Compare against a sliding buffer of the last inputs (à la konami-js)
  // so overshooting, e.g. an extra up, doesn't silently kill the attempt.
  var keys = [];
  document.addEventListener("keydown", function (event) {
    if (triggered) return;
    keys.push(event.key);
    if (keys.length > sequence.length) keys.shift();
    if (keys.join(" ") === sequence.join(" ")) trigger();
  });

  // Touch support à la konami-js: swipe the code, then tap twice for B A.
  var gestures = [
    "up", "up", "down", "down",
    "left", "right", "left", "right",
    "tap", "tap",
  ];
  var swipes = [];
  var startX, startY, endX, endY;

  function readGesture() {
    var dx = endX - startX;
    var dy = endY - startY;
    // Below this the finger barely moved — count it as a tap
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return "tap";
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  }

  // client coordinates, not page: they track the physical finger even while
  // the swipe scrolls the page underneath it
  document.addEventListener("touchstart", function (event) {
    var touch = event.changedTouches[0];
    startX = endX = touch.clientX;
    startY = endY = touch.clientY;
  }, { passive: true });

  document.addEventListener("touchmove", function (event) {
    var touch = event.changedTouches[0];
    endX = touch.clientX;
    endY = touch.clientY;
  }, { passive: true });

  document.addEventListener("touchend", function () {
    if (triggered) return;
    swipes.push(readGesture());
    if (swipes.length > gestures.length) swipes.shift();
    if (swipes.join(" ") === gestures.join(" ")) trigger();
  });

  function trigger() {
    triggered = true;

    postscriptum.hidden = false;
    postscriptum.textContent = "Nice!";
    document.documentElement.classList.add("konami-mode");
    new Audio("/files/hey.mp3").play();

    // iOS WebKit cancels CSS/WAAPI animations on any element whose inherited
    // style keeps churning (the color interval below hits every img via
    // body), so the spin is driven manually with inline transforms instead.
    var spinStart = Date.now();
    function spinImages() {
      var angle = ((Date.now() - spinStart) / 2000) * 360 % 360;
      document.querySelectorAll("img").forEach(function (img) {
        img.style.transform = "rotate(" + angle + "deg)";
      });
      requestAnimationFrame(spinImages);
    }
    requestAnimationFrame(spinImages);

    setInterval(function () {
      document.body.style.backgroundColor = randomColor();
      document.body.style.color = randomColor();
      document.querySelectorAll("a").forEach(function (a) {
        a.style.color = randomColor();
      });
      document.querySelectorAll(".feed-item, .link-card").forEach(function (card) {
        card.style.backgroundColor = randomColor();
      });
      document.querySelectorAll("p").forEach(function (p) {
        p.style.fontSize = Math.random() * 0.5 + 16 + "px";
      });
    }, 100);

    var banner = document.createElement("article");
    banner.className = "center";
    banner.innerHTML = "<h2>KONAMI MODE</h2>";
    var section = document.querySelector("section");
    section.insertBefore(banner, section.firstChild);
  }
})();
