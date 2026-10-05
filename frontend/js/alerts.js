/**
 * alerts.js - GridPulz Emergency Alert Logic
 * Handles: Web Audio beeping, modal acknowledgement,
 * emergency reroute simulation sequence, and backend reroute command.
 */

// Backend URL configured in api-config.js

let audioCtx = null;
let beepInterval = null;
let audioStarted = false;
let rerouteRunning = false;

function startAlarmBeep() {
  if (audioStarted) return;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio API not supported:', e);
    return;
  }

  audioStarted = true;

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const playBeepPattern = () => {
    if (!audioCtx || audioCtx.state === 'closed') return;

    const schedule = [
      { freq: 1200, start: 0, duration: 0.12 },
      { freq: 900, start: 0.14, duration: 0.12 },
      { freq: 1200, start: 0.28, duration: 0.12 },
      { freq: 900, start: 0.42, duration: 0.12 },
    ];

    const now = audioCtx.currentTime;

    schedule.forEach(({ freq, start, duration }) => {
      try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + start);

        gainNode.gain.setValueAtTime(0, now + start);
        gainNode.gain.linearRampToValueAtTime(0.4, now + start + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + start + duration);

        osc.start(now + start);
        osc.stop(now + start + duration + 0.05);
      } catch (err) {
        console.warn('Alarm tone scheduling skipped:', err);
      }
    });
  };

  playBeepPattern();
  beepInterval = setInterval(playBeepPattern, 800);
}

function stopAlarmBeep() {
  clearInterval(beepInterval);
  beepInterval = null;

  if (audioCtx) {
    try {
      audioCtx.close();
    } catch {
      // noop
    }
    audioCtx = null;
  }

  audioStarted = false;
}

function startClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toTimeString().split(' ')[0];
  };
  tick();
  setInterval(tick, 1000);
}

function logIncident(message, color) {
  const log = document.getElementById('incident-log');
  if (!log) return;

  const now = new Date().toTimeString().split(' ')[0];
  const c = color || '#8B949E';

  const entry = document.createElement('div');
  entry.className = 'flex gap-2 items-start';
  entry.innerHTML = `<span style="color:${c}" class="shrink-0">${now}</span><span>${message}</span>`;
  log.prepend(entry);
}

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const trigger = params.get('trigger') || '';
  const load = parseFloat(params.get('load')) || null;
  return { trigger, load };
}

function showOverloadModal(load) {
  const modal = document.getElementById('overload-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  const loadEl = document.getElementById('modal-load-val');
  if (loadEl) loadEl.textContent = load !== null ? load.toFixed(1) + '%' : '--';

  const heading = document.getElementById('modal-heading');
  if (heading) {
    setInterval(() => {
      heading.style.animation = 'pulseText 0.6s ease-in-out infinite, shakeX 0.5s ease-in-out';
      setTimeout(() => {
        heading.style.animation = 'pulseText 0.6s ease-in-out infinite';
      }, 600);
    }, 3000);
  }
}

function hideOverloadModal() {
  const modal = document.getElementById('overload-modal');
  if (!modal) return;

  modal.style.transition = 'opacity 0.4s ease';
  modal.style.opacity = '0';
  setTimeout(() => {
    modal.style.display = 'none';
    modal.style.opacity = '1';
  }, 400);
}

function acknowledgeWarning() {
  stopAlarmBeep();
  hideOverloadModal();

  const unacked = document.getElementById('status-panel-unacked');
  const acked = document.getElementById('status-panel-acked');
  if (unacked) unacked.classList.add('hidden');
  if (acked) acked.classList.remove('hidden');

  const rerouteBtn = document.getElementById('reroute-btn');
  if (rerouteBtn) {
    rerouteBtn.disabled = false;
    rerouteBtn.textContent = 'Execute Emergency Reroute';
    rerouteBtn.style.cssText = 'background: linear-gradient(135deg, rgba(255,68,68,0.15), rgba(255,100,0,0.1)); border: 1.5px solid rgba(255,68,68,0.6); color: #FF4444; cursor: pointer;';
  }

  const navTag = document.getElementById('nav-status-tag');
  if (navTag) {
    navTag.textContent = 'ACKNOWLEDGED';
    navTag.style.background = 'rgba(255,165,0,0.15)';
    navTag.style.color = '#FFA500';
    navTag.style.border = '1px solid rgba(255,165,0,0.3)';
  }

  logIncident('Alert acknowledged by operator. Emergency controls unlocked.', '#FFA500');
}

window.acknowledgeWarning = acknowledgeWarning;

function completeStep(stepId) {
  const step = document.getElementById(stepId);
  if (!step) return;

  step.style.background = 'rgba(204,255,0,0.05)';
  step.style.borderLeft = '2px solid #CCFF00';

  const icon = step.querySelector('.step-icon');
  if (icon) {
    icon.style.borderColor = '#CCFF00';
    icon.style.background = 'rgba(204,255,0,0.1)';
    const stepNum = icon.querySelector('.step-num');
    if (stepNum) {
      stepNum.textContent = 'OK';
      stepNum.style.color = '#CCFF00';
      stepNum.style.fontSize = '10px';
    }
  }

  const check = step.querySelector('.step-check');
  if (check) check.style.opacity = '1';
  step.classList.add('visible');
}

function setStepActive(stepId) {
  const step = document.getElementById(stepId);
  if (!step) return;
  step.style.borderLeft = '2px solid #FFA500';
  step.style.background = 'rgba(255,165,0,0.04)';
  step.classList.add('visible');
}

function getOperatorEmail() {
  const fromStorage = localStorage.getItem('gridpulz_operator_email') || '';
  return String(fromStorage).trim().toLowerCase();
}

async function executeBackendReroute(predictedLoadPercent) {
  const operatorEmail = getOperatorEmail() || 'operator@gridpulz.local';
  const predictedLoadKw = Number(((predictedLoadPercent / 100) * 180).toFixed(1));

  const response = await fetch(`${BACKEND_BASE_URL}/api/emergency-reroute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operator_email: operatorEmail,
      predicted_load_kw: predictedLoadKw,
      load_reduction_percent: 50,
      duration_seconds: 60,
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend reroute failed: HTTP ${response.status}`);
  }

  return response.json();
}

async function executeReroute() {
  if (rerouteRunning) return;
  rerouteRunning = true;

  const btn = document.getElementById('reroute-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Executing Reroute...';
    btn.style.opacity = '0.6';
    btn.style.cursor = 'not-allowed';
  }

  const runningEl = document.getElementById('reroute-running');
  const statusTextEl = document.getElementById('reroute-status-text');
  const step2Detail = document.getElementById('step-2-detail');
  const step3Detail = document.getElementById('step-3-detail');

  if (runningEl) runningEl.classList.remove('hidden');
  logIncident('Emergency reroute sequence initiated.', '#FF4444');

  setStepActive('step-1');
  if (statusTextEl) statusTextEl.textContent = 'Locking Station: No new vehicles permitted.';
  logIncident('Locking station - new vehicle intake suspended.', '#FFA500');

  setTimeout(() => {
    completeStep('step-1');
    logIncident('Station locked. 0 new sessions allowed.', '#CCFF00');

    setStepActive('step-2');
    if (statusTextEl) statusTextEl.textContent = 'Scanning for nearest forward-direction stations...';
    logIncident('Scanning grid topology for alternative nodes...', '#FFA500');

    setTimeout(() => {
      if (step2Detail) {
        step2Detail.textContent = '3 eligible stations found. Best match: Station Alpha (2.4 km).';
      }
      completeStep('step-2');
      logIncident('Station Alpha identified - 2.4 km, 6 free slots available.', '#CCFF00');

      setStepActive('step-3');
      if (statusTextEl) statusTextEl.textContent = 'Slot found at Station Alpha. Rerouting incoming user.';
      if (step3Detail) step3Detail.textContent = 'Slot found at Station Alpha. Rerouting incoming user.';
      logIncident('Reserving slot at Station Alpha...', '#FFA500');

      setTimeout(async () => {
        try {
          const loadPctText = document.getElementById('info-load');
          const predictedLoadPercent = parseFloat((loadPctText && loadPctText.textContent || '0').replace('%', '')) || 0;
          await executeBackendReroute(predictedLoadPercent);
          completeStep('step-3');
          if (step3Detail) step3Detail.textContent = 'Forward reroute complete. Station lock active for 60s.';
          logIncident('Backend applied 50% load reduction for 60s.', '#CCFF00');
          showSuccessBanner();
          logIncident('Reroute successful - load shedding initiated.', '#CCFF00');
        } catch (error) {
          rerouteRunning = false;
          if (runningEl) runningEl.classList.add('hidden');
          if (statusTextEl) statusTextEl.textContent = 'Reroute failed. Please retry.';
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Retry Emergency Reroute';
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
          }
          logIncident(`Backend reroute failed: ${String(error.message || error)}`, '#FF4444');
        }
      }, 2200);
    }, 1800);
  }, 1800);
}

window.executeReroute = executeReroute;

function showSuccessBanner() {
  const banner = document.getElementById('success-banner');
  if (!banner) return;
  banner.style.display = 'block';
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const navTag = document.getElementById('nav-status-tag');
  if (navTag) {
    navTag.textContent = 'RESOLVED';
    navTag.style.background = 'rgba(204,255,0,0.15)';
    navTag.style.color = '#CCFF00';
    navTag.style.border = '1px solid rgba(204,255,0,0.3)';
  }

  const badge = document.getElementById('alert-severity-badge');
  if (badge) {
    badge.textContent = 'RESOLVED';
    badge.style.background = 'rgba(204,255,0,0.15)';
    badge.style.color = '#CCFF00';
    badge.style.border = '1px solid rgba(204,255,0,0.3)';
  }

  const runningEl = document.getElementById('reroute-running');
  if (runningEl) runningEl.classList.add('hidden');
}

function updateStationDisplay() {
  const stationNameEl = document.getElementById('sidebar-station-name');
  const alertStationNameEl = document.getElementById('alert-station-name');
  const operatorEmail = localStorage.getItem('gridpulz_operator_email') || '';
  
  if (stationNameEl) stationNameEl.textContent = operatorEmail || 'Station';
  if (alertStationNameEl) alertStationNameEl.textContent = operatorEmail || 'GridPulz Node 04';
}

function populateAlertInfo(load) {
  const now = new Date();

  const timeEl = document.getElementById('info-time');
  if (timeEl) timeEl.textContent = now.toTimeString().split(' ')[0];

  const dateEl = document.getElementById('info-date');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-IN');

  const loadEl = document.getElementById('info-load');
  if (loadEl) loadEl.textContent = load !== null ? load.toFixed(1) + '%' : '--';

  const triggerEl = document.getElementById('info-trigger');
  if (triggerEl) triggerEl.textContent = 'OVERLOAD';
}

document.addEventListener('DOMContentLoaded', () => {
  startClock();
  updateStationDisplay();

  const { trigger, load } = getUrlParams();
  if (trigger === 'overload') {
    populateAlertInfo(load);
    showOverloadModal(load);

    logIncident(`CRITICAL: Overload predicted at ${load !== null ? load.toFixed(1) : '--'}% by XGBoost v2.4`, '#FF4444');
    logIncident('Alert page loaded - awaiting operator acknowledgement.', '#FFA500');

    const tryAutoPlay = () => {
      startAlarmBeep();
      if (audioCtx && audioCtx.state === 'suspended') {
        const ackBtn = document.getElementById('ack-btn');
        if (ackBtn) {
          const onFirstClick = () => {
            if (audioCtx && audioCtx.state === 'suspended') {
              audioCtx.resume();
            }
            ackBtn.removeEventListener('mousedown', onFirstClick);
          };
          ackBtn.addEventListener('mousedown', onFirstClick);
        }
      }
    };

    setTimeout(tryAutoPlay, 200);
  } else {
    logIncident('Alerts page loaded. No active critical alert.', '#888888');
  }
});
