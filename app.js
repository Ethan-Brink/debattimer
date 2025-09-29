// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAvKntZfvLlCRnfAZQY8pgb6FNDYsUQFEc",
  authDomain: "debattimer.firebaseapp.com",
  databaseURL: "https://debattimer-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "debattimer",
  storageBucket: "debattimer.firebasestorage.app",
  messagingSenderId: "100205945923",
  appId: "1:100205945923:web:cd27861b3b4c359c98a0f6",
  measurementId: "G-XZ4LNJW1L3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();


if (!firebaseConfig.apiKey) {
  alert("Sit asseblief jou Firebase config in app.js (vervang die placeholder).");
}

window.addEventListener('load', () => {
  joinRoom(roomInput.value.trim() || 'debate1');
});

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
  duration: parseInt(durationInput.value || 5) * 60, // seconds
  running: false,
  startTs: null,
  pauseRemaining: null,
  color: 'default'
};

let flashTriggered = { '4:50': false, '4:30': false, '4:00': false };

function joinRoom(id) {
  roomId = id;
  roomRef = db.ref('rooms/' + roomId);

  // Listen for room updates
  roomRef.on('value', snapshot => {
    const val = snapshot.val();
    if (!val) return;

    // Sync timer fields if present
    if (val.timer) {
      const t = val.timer;
      if (t.duration) localState.duration = t.duration;
      if (typeof t.running === 'boolean') localState.running = t.running;
      localState.startTs = t.startTs || null;
      localState.pauseRemaining = t.pauseRemaining || null;
    }

    // Sync color
    if (val.color) {
      setColorUI(val.color, false);
    }
  });

  // ensure room object exists
  roomRef.child('meta').update({ lastSeen: Date.now() }).catch(()=>{});
  // update UI
  durationInput.value = Math.round(localState.duration / 60);
}

joinBtn.addEventListener('click', () => {
  const id = roomInput.value.trim() || 'debate1';
  joinRoom(id);
});

startBtn.addEventListener('click', () => {
  if (localState.running) return;
  const now = Date.now();
  let startTs = now;

  // Update local state immediately
  localState.running = true;
  localState.startTs = startTs;
  localState.pauseRemaining = null;

  roomRef.child('timer').set({
    running: true,
    startTs: startTs,
    duration: localState.duration,
    pauseRemaining: null
  });
});


stopBtn.addEventListener('click', () => {
  // Stop: compute remaining and set running=false + pauseRemaining
  const remaining = getRemainingSeconds();
  roomRef.child('timer').update({
    running: false,
    pauseRemaining: remaining,
    startTs: null
  });
});

resetBtn.addEventListener('click', () => {
  // Reset to full duration and stop
  const dur = (parseInt(durationInput.value || 5) || 5) * 60;
  localState.duration = dur;
  roomRef.child('timer').set({
    running: false,
    startTs: null,
    duration: dur,
    pauseRemaining: dur
  });
  // also clear flashes
  resetFlashes();
});

durationInput.addEventListener('change', () => {
  const dur = (parseInt(durationInput.value || 5) || 5) * 60;
  localState.duration = dur;
  // update DB so others see change
  roomRef.child('timer/duration').set(dur);
  roomRef.child('timer/pauseRemaining').set(dur);
});

colorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const c = btn.getAttribute('data-color');
    // write to DB
    roomRef.update({ color: c });
  });
});

function setColorUI(colorName, writeToDb = true) {
  // remove bg classes
  screen.classList.remove('bg-red','bg-blue','bg-green','bg-yellow','bg-default','flash-purple','flash-pink','flash-black');
  switch(colorName){
    case 'red': screen.classList.add('bg-red'); break;
    case 'blue': screen.classList.add('bg-blue'); break;
    case 'green': screen.classList.add('bg-green'); break;
    case 'yellow': screen.classList.add('bg-yellow'); break;
    case 'flash-purple': screen.classList.add('flash-purple'); break;
    case 'flash-pink': screen.classList.add('flash-pink'); break;
    case 'flash-black': screen.classList.add('flash-black'); break;
    default: screen.classList.add('bg-default'); break;
  }
  if (writeToDb && ['red','blue','green','yellow'].includes(colorName)) {
    roomRef.update({ color: colorName });
  }
}

function getRemainingSeconds() {
  // determine remaining seconds from localState + remote startTs
  // If running: remaining = duration - (now - startTs)/1000
  // If paused: use pauseRemaining
  // If neither: default to duration
  // read from DB quickly:
  return computedRemaining();
}

function computedRemaining() {
  // read latest snapshot (we trust localState which is updated by DB listener)
  // We'll compute based on localState
  if (localState.running && localState.startTs) {
    const elapsed = Math.floor((Date.now() - localState.startTs) / 1000);
    const rem = Math.max(0, localState.duration - elapsed);
    return rem;
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

// animation / flashing logic for special times
function maybeTriggerFlashes(rem) {
  // We assume the timer is a countdown from duration. The user requested flashes at:
  // 4:50, 4:30, 4:00 (remaining). We'll trigger once each per cycle.
  const thresholds = [
    { label:'4:50', seconds: 4*60 + 50, class:'flash-black' },
    { label:'4:30', seconds: 4*60 + 30, class:'flash-pink' },
    { label:'4:00', seconds: 4*60 + 0,  class:'flash-purple' }
  ];
  thresholds.forEach(t => {
    if (rem === t.seconds && !flashTriggered[t.label]) {
      flashTriggered[t.label] = true;
      // set flash in DB so both clients flash
      roomRef.child('flash').set({type: t.class, ts: Date.now()});
      // Also remove flash key after short time
      setTimeout(()=> {
        // do not erase immediately in DB to avoid race; just let clients ignore after animation
      }, 3000);
    }
  });
}

function resetFlashes() {
  flashTriggered = { '4:50': false, '4:30': false, '4:00': false };
  roomRef.child('flash').remove().catch(()=>{});
}

// Listen for flash events so every client does same animation
roomRef.child('flash').on('value', snap => {
  const val = snap.val();
  if (!val || !val.type) return;
  // apply flash class
  const type = val.type;
  // remove any old flash classes
  screen.classList.remove('flash-purple','flash-pink','flash-black');
  screen.classList.add(type);
  // remove after a short while, fallback 3s
  setTimeout(() => {
    screen.classList.remove(type);
    // after flash ends, reapply color from DB to keep consistency
    roomRef.child('color').once('value').then(s => {
      const c = s.val() || 'default';
      setColorUI(c, false);
    }).catch(()=>{});
  }, 3000);
});

///// DB listener for timer + color /////
roomRef.child('timer').on('value', snap => {
  const t = snap.val();
  if (!t) return;
  if (t.duration) localState.duration = t.duration;
  if (typeof t.running === 'boolean') localState.running = t.running;
  localState.startTs = t.startTs || null;
  localState.pauseRemaining = t.pauseRemaining || null;

  // If stopped, reset flash triggers so next run can trigger again
  if (!localState.running) {
    // keep pauseRemaining as given
  }
});

roomRef.child('color').on('value', snap => {
  const c = snap.val() || 'default';
  setColorUI(c, false);
});

setInterval(() => {
  const rem = getRemainingSeconds();
  timerDisplay.textContent = formatTime(rem);
  if (localState.running) maybeTriggerFlashes(rem);
}, 1000);
