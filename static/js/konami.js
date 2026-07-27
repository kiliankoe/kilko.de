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
  var progress = 0;
  var triggered = false;

  document.addEventListener("keydown", function (event) {
    if (triggered) return;
    progress = event.key === sequence[progress] ? progress + 1 : 0;
    if (progress < sequence.length) return;
    trigger();
  });

  // Touch support à la konami-js: swipe the code, then tap twice for B A.
  var gestures = [
    "up", "up", "down", "down",
    "left", "right", "left", "right",
    "tap", "tap",
  ];
  var gestureProgress = 0;
  var startX, startY, endX, endY;

  function readGesture() {
    var dx = endX - startX;
    var dy = endY - startY;
    // Below this the finger barely moved — count it as a tap
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return "tap";
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  }

  document.addEventListener("touchstart", function (event) {
    var touch = event.changedTouches[0];
    startX = endX = touch.pageX;
    startY = endY = touch.pageY;
  }, { passive: true });

  document.addEventListener("touchmove", function (event) {
    var touch = event.changedTouches[0];
    endX = touch.pageX;
    endY = touch.pageY;
  }, { passive: true });

  document.addEventListener("touchend", function () {
    if (triggered) return;
    gestureProgress = readGesture() === gestures[gestureProgress] ? gestureProgress + 1 : 0;
    if (gestureProgress < gestures.length) return;
    trigger();
  });

  function trigger() {
    triggered = true;

    postscriptum.hidden = false;
    postscriptum.textContent = "Nice!";
    document.body.style.fontFamily = "Comic Sans MS, Marker Felt, fantasy";
    new Audio("/files/hey.mp3").play();

    document.querySelectorAll("img").forEach(function (img) {
      img.style.animation = "spin 2s linear infinite";
    });

    setInterval(function () {
      document.body.style.backgroundColor = randomColor();
      document.body.style.color = randomColor();
      document.querySelectorAll("a").forEach(function (a) {
        a.style.color = randomColor();
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
