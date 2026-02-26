let mode = 0;
let iframe;
let videoWidth = 560;
let videoHeight = 315;
let playNumberSoundOnNextQueueUpdate = false;

let cnv;

// count er nu kø-position (1,2,3,...). Hvis ikke forbundet endnu: null
let count = null;

let agreeButton, disagreeButton;
let container;
let mode2Initialized = false;

let mode3Initialized = false;
let slideshowIntervalId = null;

const YT_ID = "M6LoRZsHMSs";
const YT_PLAY_URL =
  `https://www.youtube.com/embed/${YT_ID}` +
  `?loop=1&playlist=${YT_ID}` +
  `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;

const YT_STOP_URL = "about:blank";

let images = [
  "img/img1.png",
  "img/img2.png",
  "img/img3.png",
  "img/img4.png",
  "img/img5.png",
  "img/img6.png",
  "img/img7.png",
  "img/img8.png",
];

/* ---------------- Queue (WebSocket) ---------------- */

let queueSocket = null;
let queueInfo = { id: null, position: null, size: null, active: false };
let queueAutoAdvanced = false;
let serverPosition = null;  // 1,2,3... fra serveren
let displayPosition = null; // 0,1,2... til UI/lyd

// Skift denne hvis din server kører et andet sted
const WS_URL =
  (window.location.protocol === "https:" ? "wss://" : "ws://") +
  window.location.host;

function safeQueueSend(obj) {
  if (queueSocket && queueSocket.readyState === WebSocket.OPEN) {
    queueSocket.send(JSON.stringify(obj));
  }
}

function connectQueue() {
  // Undgå dobbelt connection
  if (
    queueSocket &&
    (queueSocket.readyState === WebSocket.OPEN ||
      queueSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  queueAutoAdvanced = false;

  // Nulstil info ved ny session i køen
  queueInfo = { id: null, position: null, size: null, active: false };
  count = null;

queueSocket = new WebSocket(WS_URL);

queueSocket.addEventListener("message", (event) => {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch (e) {
    return;
  }

  if (msg.type === "welcome") {
    queueInfo.id = msg.id;
  }

  if (msg.type === "queue_update") {
    queueInfo.position = msg.position;
    queueInfo.active = msg.active;
    
    serverPosition = msg.position;
    displayPosition = msg.position - 1;
    count = displayPosition;

    if (mode === 1 && msg.active === true && !queueAutoAdvanced) {
      queueAutoAdvanced = true;

      // du er forrest, gå videre
      frameRate(60);
      setMode(2);
    }
    if (mode === 1 && playNumberSoundOnNextQueueUpdate) {
      playNumberSoundOnNextQueueUpdate = false;
      playCountSoundPauseYT();
      lastSoundTime = millis(); // så 10 sek timeren ikke spiller igen med det samme
    }
  }
});

// Hvis forbindelsen dør mens man står i køen, kan man vælge at reconnecte automatisk.
  // Her gør vi et forsøg efter kort tid, men kun hvis man stadig er i mode 1.
  queueSocket.addEventListener("close", () => {
    if (mode === 1) {
      setTimeout(() => {
        if (mode === 1) connectQueue();
      }, 1000);
    }
  });

  queueSocket.addEventListener("error", () => {
    // close handler tager sig af reconnect-logik
  });
}

function disconnectQueue() {
  if (!queueSocket) return;

  try {
    safeQueueSend({ type: "leave" });
  } catch (e) {}

  try {
    queueSocket.close();
  } catch (e) {}

  queueSocket = null;
  queueInfo = { id: null, position: null, size: null, active: false };
  count = null;
}

// Best effort når siden forlades.
// Serveren bør stadig rydde op via "close" og heartbeat, hvis dette ikke når frem.
window.addEventListener("beforeunload", () => {
  try {
    safeQueueSend({ type: "leave" });
  } catch (e) {}
});

/* ---------------- Audio preload ---------------- */

function preload() {
  song = loadSound("sound/sad.mp3");
  one = loadSound("sound/1.mp3");
  two = loadSound("sound/2.mp3");
  three = loadSound("sound/3.mp3");
  four = loadSound("sound/4.mp3");
  five = loadSound("sound/5.mp3");
  six = loadSound("sound/6.mp3");
  seven = loadSound("sound/7.mp3");
  eight = loadSound("sound/8.mp3");
  nine = loadSound("sound/9.mp3");
  tak = loadSound("sound/tak.mp3");
}

let lastSoundTime = 0;
let lastSoundTime2 = 0;

let currentIndex = 0;
let imgElement;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function changeImage() {
  if (!imgElement) return;

  imgElement.attribute("src", images[currentIndex]);
  currentIndex++;

  if (currentIndex >= images.length) {
    shuffle(images);
    currentIndex = 0;
  }
}

/* ---------------- p5 setup/draw ---------------- */

function setup() {
  cnv = createCanvas(windowWidth, windowHeight);
  cnv.elt.tabIndex = "0";
  cnv.elt.focus();

  iframe = createElement("iframe");
  iframe.attribute("width", videoWidth);
  iframe.attribute("height", videoHeight);
  iframe.attribute("title", "YouTube video player");
  iframe.attribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  );
  iframe.attribute("allowfullscreen", "");
  iframe.style("border", "0");
  iframe.style("z-index", "10");

  iframe.position(width / 2 - videoWidth / 2, height / 2 - videoHeight / 2);
  iframe.hide();
  iframe.attribute("src", YT_STOP_URL);

  frameRate(60);
}

function draw() {
  if (mode === 0) {
    stopVideo();

    background(200);
    textAlign(CENTER, CENTER);
    let baseSize = 50;
    let pulse = sin(frameCount * 0.07);
    textSize(baseSize + pulse);
    fill(0);
    noStroke();
    text("Tryk SPACE for at komme i kø til at være ked af det", width / 2, height / 3);
 } else if (mode === 1) {
  playVideo();

  // Flicker: skift baggrund hvert 5. frame
  if (frameCount % 20 === 0) {
    background(random(255), random(255), random(255));
  }

  textAlign(CENTER, CENTER);
  textSize(32);
  fill(0);
  noStroke();

  if (count === null) {
    text("Forbinder til køen...", width / 2, height / 5);
  } else {
    text(`Du er nummer ${count} i køen til at være ked af det!`, width / 2, height / 5);
  }

  // Hver 10. sekund: afspil nummerlyd (vi trigger via flag og næste queue_update)
  if (millis() - lastSoundTime >= 10000) {
    playNumberSoundOnNextQueueUpdate = true;
    lastSoundTime = millis();
  }

  // Hver 15. sekund: afspil "tak"
  if (millis() - lastSoundTime2 >= 15000) {
    playTakPauseYT();
    lastSoundTime2 = millis();
  }
  } else if (mode === 2) {
    stopVideo();

    background(200);
    textSize(32);
    textAlign(CENTER);
    fill(0);
    text(
      "Du er nu forrest i køen. Læs og tag stilling til nedenstående for at komme videre",
      width / 2,
      height / 10
    );

    if (!mode2Initialized) {
      Mode2UI();
      mode2Initialized = true;
    }
  } else if (mode === 3) {
    stopVideo();

    background(200, 200, 200);

    if (!mode3Initialized) {
      cleanupMode2UI();

      imgElement = select("#slideshow");
      imgElement.show();
      imgElement.style("display", "block");
      imgElement.style("position", "fixed");
      imgElement.style("inset", "0");
      imgElement.style("width", "100vw");
      imgElement.style("height", "100vh");
      imgElement.style("object-fit", "contain");
      imgElement.style("z-index", "9999");

      imgElement = select("#slideshow");
      if (imgElement) {
        shuffle(images);
        changeImage();
        if (slideshowIntervalId) clearInterval(slideshowIntervalId);
        slideshowIntervalId = setInterval(changeImage, 3000);
      }

      getAudioContext().resume();
      if (!song.isPlaying()) {
        song.loop();
        song.setVolume(1);
      }

      mode3Initialized = true;
    }
  }

  // debug
  noStroke();
  fill(255);
  textSize(16);
  //text(`mode: ${mode}`, 80, 40);
}

/* ---------------- Mode changes ---------------- */

function setMode(newMode) {
  if (mode === newMode) return;

  // Hvis man forlader mode 2, fjern UI
  if (mode === 2 && newMode !== 2) {
    cleanupMode2UI();
  }

  const prevMode = mode;
  mode = newMode;

  // Kø-logik: vi er kun i kø i mode 1
  if (mode === 1) {
    connectQueue();

    playVideo();

  // Kickstart audio/video ASAP
  try { getAudioContext().resume(); } catch (e) {}
  resumeYouTube();

  playNumberSoundOnNextQueueUpdate = true;

  lastSoundTime = millis();
  lastSoundTime2 = millis();
  } else {
    // Hvis vi forlader mode 1, så er vi ikke i kø længere
    // (mode 1 -> mode 2 håndteres også af auto-advance, men dette er ekstra sikkerhed)
    if (prevMode === 1) {
      // Reset frameRate, ellers kan man hænge på 3 fps
      frameRate(60);
    }
  }

  if (mode === 2) stopVideo();

  if (mode === 3) {
    stopVideo();
    // mode 3 init kører én gang i draw via mode3Initialized
  }
}

/* ---------------- Video controls ---------------- */

function playVideo() {
  if (iframe.attribute("src") !== YT_PLAY_URL) {
    iframe.attribute("src", YT_PLAY_URL);
  }
  iframe.show();
}

function stopVideo() {
  iframe.hide();
  if (iframe.attribute("src") !== YT_STOP_URL) {
    iframe.attribute("src", YT_STOP_URL);
  }
}

/* ---------------- UI ---------------- */

function Mode2UI() {
  container = createDiv();
  container.style("width", "60%");
  container.style("height", "70%");
  container.style("overflow", "auto");
  container.style("position", "absolute");
  container.style("top", "50%");
  container.style("left", "50%");
  container.style("transform", "translate(-50%, -50%)");

  const legendIframe = createElement("iframe");
  legendIframe.attribute("src", "Legendedesign.html");
  legendIframe.style("width", "950%");
  legendIframe.style("height", "85%");
  legendIframe.style("border", "0");
  container.child(legendIframe);

  agreeButton = createButton("Jeg er enig");
  agreeButton.style("position", "absolute");
  agreeButton.style("font-size", "20px");
  agreeButton.style("bottom", "0px");
  agreeButton.style("left", "22.5%");
  agreeButton.style("padding", "15px 50px");
  agreeButton.style("background-color", "#A9A9A9");
  agreeButton.style("color", "white");
  agreeButton.style("border", "none");
  agreeButton.style("border-radius", "5px");
  agreeButton.mousePressed(onAgree);

  disagreeButton = createButton("Jeg er uenig");
  disagreeButton.style("position", "absolute");
  disagreeButton.style("font-size", "20px");
  disagreeButton.style("bottom", "0px");
  disagreeButton.style("right", "27.5%");
  disagreeButton.style("padding", "15px 50px");
  disagreeButton.style("background-color", "#0496C7");
  disagreeButton.style("color", "white");
  disagreeButton.style("border", "none");
  disagreeButton.style("border-radius", "5px");
  disagreeButton.mousePressed(onDisagree);

  container.child(agreeButton);
  container.child(disagreeButton);
}

function cleanupMode2UI() {
  if (container) {
    container.remove();
    container = null;
  }
  agreeButton = null;
  disagreeButton = null;
  mode2Initialized = false;
}

/* ---------------- Input ---------------- */

function keyPressed() {
  if (mode === 0 && key === " ") {
    setMode(1);
  }
  // Mode 1 -> Mode 2 er nu kun via køsystemet (auto-advance)
}

function touchStarted() {
  if (mode === 0) {
    getAudioContext().resume(); // vigtigt for iOS
    setMode(1);
  }
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  iframe.position(width / 2 - videoWidth / 2, height / 2 - videoHeight / 2);
}

/* ---------------- Button handlers ---------------- */

function onAgree() {
  console.log("I Agree");
  setMode(3);
}

function onDisagree() {
  console.log("I Disagree");
// Flyt brugeren bagerst i køen
  safeQueueSend({ type: "requeue" });

  // Nulstil auto-advance, så man kan få adgang igen når man bliver nr. 1 senere
  queueAutoAdvanced = false;
  count = null;
  playNumberSoundOnNextQueueUpdate = true;

  // Tilbage til køskærmen
  setMode(1);
}

/* ---------------- Sound helpers ---------------- */

function playCountSound() {
  if (count === 1) {
    one.play();
  } else if (count === 2) {
    two.play();
  } else if (count === 3) {
    three.play();
  } else if (count === 4) {
    four.play();
  } else if (count === 5) {
    five.play();
  } else if (count === 6) {
    six.play();
  } else if (count === 7) {
    seven.play();
  } else if (count === 8) {
    eight.play();
  } else if (count >= 9) {
    nine.play();
  }
}

function ytCommand(func) {
  if (!iframe || !iframe.elt || !iframe.elt.contentWindow) return;

  iframe.elt.contentWindow.postMessage(
    JSON.stringify({ event: "command", func, args: [] }),
    "*"
  );
}

function pauseYouTube() {
  ytCommand("pauseVideo");
}

function resumeYouTube() {
  ytCommand("playVideo");
}

function getSoundForCount() {
  // Hvis vi ikke har en position endnu, spil ingenting
  if (count === null || count === undefined) return null;

  if (count === 1) return one;
  if (count === 2) return two;
  if (count === 3) return three;
  if (count === 4) return four;
  if (count === 5) return five;
  if (count === 6) return six;
  if (count === 7) return seven;
  if (count === 8) return eight;
  return nine; // count >= 9
}

function playCountSoundPauseYT() {
  const s = getSoundForCount();
  if (!s) return;

  // hvis den allerede spiller, stack ikke lyde
  if (s.isPlaying && s.isPlaying()) return;

  getAudioContext().resume();

  pauseYouTube();

  s.onended(() => {
    // Kun resume hvis vi stadig er i mode 1
    if (mode === 1) resumeYouTube();
  });

  s.play();
}

function playTakPauseYT() {
  if (!tak) return;

  if (tak.isPlaying && tak.isPlaying()) return;

  getAudioContext().resume();

  pauseYouTube();

  tak.onended(() => {
    if (mode === 1) resumeYouTube();
  });

  tak.play();
}
