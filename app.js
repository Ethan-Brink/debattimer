// Firebase konfigurasie
const firebaseConfig = {
  apiKey: "AIzaSyAvKntZfvLlCRnfAZQY8pgb6FNDYsUQFEc",
  authDomain: "debattimer.firebaseapp.com",
  databaseURL: "https://debattimer-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "debattimer",
  storageBucket: "debattimer.appspot.com",
  messagingSenderId: "100205945923",
  appId: "1:100205945923:web:cd27861b3b4c359c98a0f6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// DOM elemente
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const durationInput = document.getElementById('durationInput');
const timerDisplay = document.getElementById('timerDisplay');
const screen = document.getElementById('screen');
const colorBtns = document.querySelectorAll('.color-btn');

let roomId = roomInput.value || 'debate1';
let roomRef = db.ref('rooms/' + roomId);

let localState = {
  duration: parseInt(durationInput.value || 5) * 60,
  running: false,
  startTs: null,
  pauseRemaining: null,
  color: 'default'
};

let flashTriggered = { '4:50': false, '4:30': false, '4:00': false };

function joinRoom(id) {
  roomId = id;
  roomRef = db.ref('rooms/' + roomId);

  roomRef.on('value', snapshot => {
    const val = snapshot.val();
    if (!val) return;

    if (val.timer) {
      const t = val.timer;
      localState.duration = t.duration || localState.duration;
      localState.running = t.running || false;
      localState.startTs = t.startTs || null;
      localState.pauseRemaining = t.pauseRemaining || null;
    }

    if (val.color) {
      setColorUI(val.color, false);
    }
  });

  roomRef.child('meta').update({ lastSeen: Date.now() }).catch(() => {});
  durationInput.value = Math.round(localState.duration / 60);
}

joinBtn.addEventListener('click', () => {
  const id = roomInput.value.trim() || 'debate1';
  joinRoom(id);
});

startBtn.addEventListener('click', () => {
  if (localState.running) return;
  const now = Date.now();
  localState.running = true;
  localState.startTs = now;
  localState.pauseRemaining = null;

  roomRef.child('timer').set({
    running: true,
    startTs: now,
    duration: localState.duration,
    pauseRemaining: null
  });
});

stopBtn.addEventListener('click', () => {
  const remaining = getRemainingSeconds();
  localState.running = false;
  localState.pauseRemaining = remaining;
  localState.startTs = null;

  roomRef.child('timer').update({
    running: false,
    pauseRemaining: remaining,
    startTs: null
  });
});

resetBtn.addEventListener('click', () => {
  const dur = (parseInt(durationInput.value || 5) || 5) * 60;
  localState.duration = dur;
  localState.running = false;
  localState.startTs = null;
  localState.pauseRemaining = dur;

  roomRef.child('timer').set({
    running: false,
    startTs: null,
    duration: dur,
    pauseRemaining: dur
  });

  resetFlashes();
});

durationInput.addEventListener('change', () => {
  const dur = (parseInt(durationInput.value || 5) || 5) * 60;
  localState.duration = dur;
  roomRef.child('timer/duration').set(dur);
  roomRef.child('timer/pauseRemaining').set(dur);
});

colorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const c = btn.getAttribute('data-color');
    roomRef.update({ color: c });
  });
});

function setColorUI(colorName, writeToDb = true) {
  screen.classList.remove('bg-red','bg-blue','bg-green','bg-yellow','bg-default','flash-purple','flash-pink','flash-black');
  screen.classList.add(`bg-${colorName}`);
  if (writeToDb && ['red','blue','green','yellow'].includes(colorName)) {
    roomRef.update({ color: colorName });
  }
}

function getRemainingSeconds() {
  if (localState.running && localState.startTs) {
    const elapsed = Math.floor((Date.now() - localState.startTs) / 1000);
    return Math.max(0, localState.duration - elapsed);
  } else if (localState.pauseRemaining != null) {
    return Math.max(0, Math.floor(localState.pauseRemaining));
  } else {
    return Math.max(0, Math.floor(localState.duration));
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2,'0');
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

function maybeTriggerFlashes(rem) {
  const thresholds = [
    { label:'4:50', seconds: 4*60 + 50, class:'flash-black' },
    { label:'4:30', seconds: 4*60 + 30, class:'flash-pink' },
    { label:'4:00', seconds: 4*60 + 0,  class:'flash-purple' }
  ];
  thresholds.forEach(t => {
    if (rem === t.seconds && !flashTriggered[t.label]) {
      flashTriggered[t.label] = true;
      roomRef.child('flash').set({type: t.class, ts: Date.now()});
    }
  });
}

function resetFlashes() {
  flashTriggered = { '4:50': false, '4:30': false, '4:00': false };
  roomRef.child('flash').remove().catch(() => {});
}

roomRef.child('flash').on('value', snap => {
  const val = snap.val();
  if (!val || !val.type) return;
  const type = val.type;
  screen.classList.remove('flash-purple','flash-pink','flash-black');
  screen.classList.add(type);
  setTimeout(() => {
    screen.classList.remove(type);
    roomRef.child('color').once('value').then(s => {
      const c = s.val() || 'default';
      setColorUI(c, false);
    }).catch(() => {});
  }, 3000);
});

setInterval(() => {
  const rem = getRemainingSeconds();
  timerDisplay.textContent = formatTime(rem);
  if (localState.running) maybeTriggerFlashes(rem);
}, 1000);