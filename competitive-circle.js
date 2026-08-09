/**
 * Competitive Circle Simulator – Complete Web Engine
 * Version 1.0
 * 
 * Required HTML elements:
 *   <canvas id="board" width="700" height="700"></canvas>
 *   Sidebar with controls (see the example HTML below)
 * 
 * All distances are in pixels on a 700×700 canvas.
 * The circle radius is 300 px; thermal zones are at 20% and 80% of the radius.
 */

// ==================== GAME STATE ====================
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const CENTER = { x: W/2, y: H/2 };
const RADIUS = 300;
const DEATH_PCT = 0.8, POWER_PCT = 0.2;

let marbles = [];           // {id, team, x, y, r:14, label, stickers:{vuln, profit, mdi, sm, anchor, defended}, resType, mdiTimer, customColor}
let arrows = [];            // {fromId, toId, type:'solid'|'dashed'}
let forceArrows = [];       // {fromX, fromY, toX, toY, type, color, label}
let selectedMarble = null;
let arrowMode = false, arrowFrom = null;
let forceArrowMode = null;  // 'cg-self','cg-comp','narrative','regulatory','loyalty','talent','custom'
let forceArrowColor = '#8b5cf6';
let forceStart = null;
let nextId = 1;
let gameLog = [];
let currentTurn = 1;
let simulationPhase = "placement";

// SFF intensities (0‑3)
let sff = {
  at: 3,
  cgSelf: 2, cgComp: 2,
  loyalty: 2, regWind: 1, narrative: 2,
  oiSelf: 2, oiComp: 2,
  shareholder: 2, talent: 2
};

// Adversary archetype profile (14 ordinal dimensions, 1‑5)
let adversaryProfile = {
  aggressiveness: 2, responseSpeed: 2, riskTolerance: 2, focusOfAttack: 3,
  predictability: 4, emotionality: 1, strategicHorizon: 4, organizationalAgility: 1,
  collaborativeTendency: 2, responseToThreat: 3, adaptability: 2, transparency: 2,
  resourceConservation: 4, learningOrientation: 2
};

let adversaryDelayCounter = 0;
let showStickers = true;
let showArrows = true;
let showForceArrows = true;

// ==================== CANVAS DRAWING ====================
function draw() {
  ctx.clearRect(0, 0, W, H);
  // Circle
  ctx.beginPath(); ctx.arc(CENTER.x, CENTER.y, RADIUS, 0, Math.PI*2);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.stroke();
  // Death zone
  ctx.beginPath(); ctx.arc(CENTER.x, CENTER.y, RADIUS*DEATH_PCT, 0, Math.PI*2);
  ctx.setLineDash([8,8]); ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  // Power zone
  ctx.beginPath(); ctx.arc(CENTER.x, CENTER.y, RADIUS*POWER_PCT, 0, Math.PI*2);
  ctx.strokeStyle = 'blue'; ctx.lineWidth = 2; ctx.stroke();

  // Force arrows (behind marbles)
  if (showForceArrows) {
    forceArrows.forEach(fa => {
      ctx.beginPath(); ctx.moveTo(fa.fromX, fa.fromY); ctx.lineTo(fa.toX, fa.toY);
      ctx.strokeStyle = fa.color; ctx.setLineDash([6,4]); ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
      let angle = Math.atan2(fa.toY - fa.fromY, fa.toX - fa.fromX);
      let hx = fa.toX - Math.cos(angle)*12, hy = fa.toY - Math.sin(angle)*12;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.lineTo(hx - 8*Math.cos(angle - Math.PI/6), hy - 8*Math.sin(angle - Math.PI/6));
      ctx.lineTo(hx - 8*Math.cos(angle + Math.PI/6), hy - 8*Math.sin(angle + Math.PI/6));
      ctx.closePath(); ctx.fillStyle = fa.color; ctx.fill();
      if (fa.label) {
        ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = fa.color;
        let mx = (fa.fromX + fa.toX)/2, my = (fa.fromY + fa.toY)/2;
        ctx.fillText(fa.label, mx+6, my-6);
      }
    });
  }

  // Dependency arrows
  if (showArrows) {
    arrows.forEach(a => {
      let from = marbles.find(m => m.id === a.fromId), to = marbles.find(m => m.id === a.toId);
      if (!from || !to) return;
      const color = a.type === 'dashed' ? '#e11d48' : '#059669';
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = color; ctx.setLineDash(a.type === 'dashed' ? [6,4] : []); ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
      let angle = Math.atan2(to.y - from.y, to.x - from.x);
      let hx = to.x - Math.cos(angle)*(to.r+3), hy = to.y - Math.sin(angle)*(to.r+3);
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.lineTo(hx - 10*Math.cos(angle - Math.PI/6), hy - 10*Math.sin(angle - Math.PI/6));
      ctx.lineTo(hx - 10*Math.cos(angle + Math.PI/6), hy - 10*Math.sin(angle + Math.PI/6));
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    });
  }

  // Marbles
  marbles.forEach(m => {
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI*2);
    ctx.fillStyle = m.customColor || (m.team === 'player' ? '#2563eb' : '#dc2626');
    ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.stroke();
    if (showStickers) {
      if (m.stickers.vuln === 'high') { ctx.beginPath(); ctx.arc(m.x, m.y, m.r+3, 0, Math.PI*2); ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.stroke(); }
      if (m.stickers.vuln === 'low') { ctx.beginPath(); ctx.arc(m.x, m.y, m.r+3, 0, Math.PI*2); ctx.strokeStyle = 'blue'; ctx.lineWidth = 2; ctx.stroke(); }
      if (m.stickers.profit) { ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, Math.PI*2); ctx.fillStyle = {loss:'red', break:'yellow', profit:'green'}[m.stickers.profit]||'black'; ctx.fill(); }
      if (m.stickers.mdi) { ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(m.stickers.mdi.toUpperCase(), m.x+m.r+4, m.y-4); }
      if (m.mdiTimer > 0) { ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#dc2626'; ctx.fillText('⏳'+m.mdiTimer, m.x+m.r+4, m.y+10); }
      if (m.stickers.defended) { ctx.font = '16px sans-serif'; ctx.fillText('🛡️', m.x-8, m.y-16); }
      if (m.stickers.sm) { drawStar(m.x, m.y-m.r-4, 5, 8, 4, 'gold'); }
      if (m.stickers.anchor) { drawStar(m.x+m.r+4, m.y, 5, 8, 4, 'silver'); }
      if (m.resType === 'network') { ctx.beginPath(); ctx.arc(m.x, m.y, m.r+5, 0, Math.PI*2); ctx.setLineDash([3,3]); ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
      else if (m.resType === 'capability') { ctx.beginPath(); ctx.arc(m.x, m.y, m.r+2, 0, Math.PI*2); ctx.fillStyle = 'rgba(168,85,247,0.15)'; ctx.fill(); }
      else if (m.resType === 'brand') { ctx.beginPath(); ctx.arc(m.x, m.y, m.r+6, 0, Math.PI*2); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (m.label) { ctx.font = '10px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(m.label, m.x-10, m.y-m.r-8); }
    if (selectedMarble && selectedMarble.id === m.id) { ctx.beginPath(); ctx.arc(m.x, m.y, m.r+5, 0, Math.PI*2); ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.stroke(); }
  });

  // Center‑of‑gravity markers
  const playerMarbles = marbles.filter(m => m.team === 'player');
  if (playerMarbles.length) {
    let cgx = playerMarbles.reduce((s,m) => s+m.x,0)/playerMarbles.length;
    let cgy = playerMarbles.reduce((s,m) => s+m.y,0)/playerMarbles.length;
    ctx.beginPath(); ctx.arc(cgx, cgy, 6, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(37,99,235,0.3)'; ctx.fill();
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1; ctx.stroke();
  }
  const advMarbles = marbles.filter(m => m.team === 'adversary');
  if (advMarbles.length) {
    let cgx = advMarbles.reduce((s,m) => s+m.x,0)/advMarbles.length;
    let cgy = advMarbles.reduce((s,m) => s+m.y,0)/advMarbles.length;
    ctx.beginPath(); ctx.arc(cgx, cgy, 6, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(220,38,38,0.3)'; ctx.fill();
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1; ctx.stroke();
  }

  updateConfigurationDisplay();
  updateSFFDisplay();
  updateTurnDisplay();
}

function drawStar(cx, cy, spikes, outerR, innerR, color) {
  let rot = Math.PI/2*3, step = Math.PI/spikes;
  ctx.beginPath();
  for (let i=0; i<spikes; i++) {
    ctx.lineTo(cx+Math.cos(rot)*outerR, cy+Math.sin(rot)*outerR);
    rot += step;
    ctx.lineTo(cx+Math.cos(rot)*innerR, cy+Math.sin(rot)*innerR);
    rot += step;
  }
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5; ctx.stroke();
}

// ==================== HELPERS ====================
function dist(x1, y1, x2, y2) { return Math.hypot(x1-x2, y1-y2); }
function zoneOfMarble(m) { let d = dist(m.x, m.y, CENTER.x, CENTER.y); return d <= RADIUS*POWER_PCT ? 'Power' : d <= RADIUS*DEATH_PCT ? 'Maneuver' : 'Death'; }
function findMarble(id) { return marbles.find(m => m.id === id); }
function findMarbleAt(x, y) { for (let i=marbles.length-1; i>=0; i--) { let m=marbles[i]; if (dist(m.x,m.y,x,y)<=m.r+5) return m; } return null; }

// ==================== INTERACTION ====================
canvas.addEventListener('mousedown', e => {
  let rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
  if (forceArrowMode) {
    forceStart = {x: mx, y: my};
    document.getElementById('forceStatus').textContent = 'Dragging... release to place arrow.';
    draw();
    return;
  }
  if (arrowMode) {
    let m = findMarbleAt(mx, my);
    if (m) {
      if (!arrowFrom) { arrowFrom = m.id; selectedMarble = m; draw(); }
      else {
        arrows.push({fromId: arrowFrom, toId: m.id, type: document.getElementById('arrowType').value});
        arrowFrom = null; arrowMode = false;
        document.getElementById('arrowBtn').textContent = 'Draw Arrow (Solid)';
        document.getElementById('arrowBtn').style.background = '#2563eb';
        selectedMarble = null; draw();
      }
    }
    return;
  }
  let clicked = findMarbleAt(mx, my);
  if (clicked) {
    selectedMarble = clicked; draw();
    let onMove = ev => {
      let rx = ev.clientX - rect.left, ry = ev.clientY - rect.top;
      if (dist(rx, ry, CENTER.x, CENTER.y) <= RADIUS - clicked.r) {
        clicked.x = rx; clicked.y = ry;
      }
      draw();
    };
    let onUp = () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
  } else { selectedMarble = null; draw(); }
});

canvas.addEventListener('mouseup', e => {
  if (forceArrowMode && forceStart) {
    let rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (dist(mx, my, forceStart.x, forceStart.y) > 5) {
      const labelMap = {
        'cg-self':'Center Gravity (Self)', 'cg-comp':'Center Gravity (Comp)',
        'narrative':'Narrative Tension', 'regulatory':'Regulatory Wind',
        'loyalty':'Loyalty Friction', 'talent':'Talent Field', 'custom':'Custom Force'
      };
      forceArrows.push({
        fromX: forceStart.x, fromY: forceStart.y,
        toX: mx, toY: my,
        type: forceArrowMode,
        color: forceArrowColor,
        label: labelMap[forceArrowMode] || 'Force'
      });
    }
    forceStart = null; forceArrowMode = null;
    document.getElementById('forceStatus').textContent = '';
    draw();
  }
});

// ==================== UI HELPERS ====================
function updateShooterTargetLists() {
  let shooterSel = document.getElementById('shooterSelect'), targetSel = document.getElementById('targetSelect');
  shooterSel.innerHTML = '<option value="">-- select marble --</option>';
  targetSel.innerHTML = '<option value="">-- none (reposition) --</option>';
  marbles.forEach(m => {
    let opt = `<option value="${m.id}">${m.label||'Marble '+m.id} (${m.team})</option>`;
    shooterSel.innerHTML += opt; targetSel.innerHTML += opt;
  });
}

function updateLog() {
  let logDiv = document.getElementById('log');
  logDiv.innerHTML = gameLog.slice(-10).map(e =>
    `<div class="log-entry"><b>Turn ${e.turn}:</b> ${e.result}<br><i style="color:#475569;">${e.translation||''}</i> ${e.details||''}</div>`
  ).join('');
}

function updateConfigurationDisplay() {
  const cfg = detectConfiguration();
  const disp = document.getElementById('config-display');
  if (disp) disp.innerText = `Configuration: ${cfg}`;
}

function updateTurnDisplay() {
  document.getElementById('turnDisplay').innerText = currentTurn;
  document.getElementById('phaseDisplay').innerText = simulationPhase;
}

function updateSFFDisplay() {
  let el = document.getElementById('sff-summary');
  if (!el) return;
  el.innerHTML = `CG (Ply:${sff.cgSelf} Adv:${sff.cgComp}) Loyalty:${sff.loyalty} RegWind:${sff.regWind} Narr:${sff.narrative} OI (Ply:${sff.oiSelf} Adv:${sff.oiComp}) Share:${sff.shareholder} Talent:${sff.talent}`;
}

// ==================== MARBLE MANAGEMENT ====================
function addMarble(team) {
  let angle = Math.random()*Math.PI*2, d = RADIUS*0.4 + Math.random()*RADIUS*0.4;
  let x = CENTER.x + Math.cos(angle)*d, y = CENTER.y + Math.sin(angle)*d;
  marbles.push({
    id: nextId++, team, x, y, r:14, label:'', stickers:{},
    mdiTimer:0, resType:'asset', customColor:null
  });
  selectedMarble = null; draw(); updateShooterTargetLists();
}

function applyStickers() {
  if (!selectedMarble) { alert('Select a marble'); return; }
  let m = selectedMarble;
  m.stickers.vuln = document.getElementById('vuln').value || undefined;
  m.stickers.profit = document.getElementById('profit').value || undefined;
  m.stickers.mdi = document.getElementById('mdi').value || undefined;
  m.stickers.sm = document.getElementById('sm').checked;
  m.stickers.anchor = document.getElementById('anchor').checked;
  draw();
}

// ==================== SIMULATION ENGINE ====================
function getEffectiveMoveProbability(shooter, target, ip, ai) {
  let base = ip==='low' ? 0.4 : ip==='med' ? 0.65 : 0.85;
  let loyaltyMod = (sff.loyalty/3) * 0.3;
  let cgDefender = target.team === 'adversary' ? sff.cgComp : sff.cgSelf;
  let cgMod = (cgDefender/3) * 0.2;
  let aiMod = ai === 'tangential' ? -0.1 : 0;
  let prob = base - loyaltyMod - cgMod + aiMod;
  if (target.stickers.vuln === 'high') prob += 0.1;
  if (target.stickers.vuln === 'low') prob -= 0.15;
  return Math.max(0.1, Math.min(0.95, prob));
}

function resolveMove(shooter, target, ip, ai, intention, isPlayerMove = true) {
  let logEntry = {
    turn: gameLog.length+1, shooter: shooter.id, target: target ? target.id : null,
    ip, ai, intention, result:'', details:''
  };

  if (!target && intention === 'reposition') {
    const mdi = shooter.stickers.mdi;
    if (mdi==='high' && shooter.mdiTimer===0) { shooter.mdiTimer=3; logEntry.result='Repositioning started (High MDI).'; }
    else if (mdi==='med' && shooter.mdiTimer===0) { shooter.mdiTimer=2; logEntry.result='Repositioning started (Medium MDI).'; }
    else if (mdi==='low' || shooter.mdiTimer <= 1) {
      let ang = Math.atan2(CENTER.y - shooter.y, CENTER.x - shooter.x);
      let distM = ip==='low'?20 : ip==='med'?50 : 80;
      shooter.x += Math.cos(ang)*distM; shooter.y += Math.sin(ang)*distM;
      if (dist(shooter.x, shooter.y, CENTER.x, CENTER.y) > RADIUS - shooter.r) {
        marbles = marbles.filter(m => m.id !== shooter.id);
        logEntry.result = 'Shooter eliminated (exited circle)';
      } else { logEntry.result = 'Repositioned'; }
      shooter.mdiTimer = 0;
    } else {
      logEntry.result = `Repositioning in progress (${shooter.mdiTimer} turns remaining).`;
      shooter.mdiTimer--;
    }
  } else if (target) {
    let prob = getEffectiveMoveProbability(shooter, target, ip, ai);
    let success = Math.random() < prob;
    if (success) {
      marbles = marbles.filter(m => m.id !== target.id);
      logEntry.result = 'Target eliminated';
      arrows.filter(a => a.fromId === target.id).forEach(a => {
        let dep = findMarble(a.toId);
        if (dep) {
          let resistChance = (sff.loyalty/3)*0.5 + (dep.stickers.vuln==='low'?0.3:0);
          if (Math.random() > resistChance) {
            let d = dist(dep.x, dep.y, CENTER.x, CENTER.y);
            let ang = Math.atan2(dep.y - CENTER.y, dep.x - CENTER.x);
            let nd = d + 40;
            if (nd > RADIUS - dep.r) {
              marbles = marbles.filter(m => m.id !== dep.id);
              logEntry.details += `Cascade: ${dep.label||'Marble '+dep.id} eliminated. `;
            } else {
              dep.x = CENTER.x + Math.cos(ang)*nd; dep.y = CENTER.y + Math.sin(ang)*nd;
              logEntry.details += `Cascade: ${dep.label||'Marble '+dep.id} displaced. `;
            }
          } else { logEntry.details += `Cascade resisted. `; }
        }
      });
      if (ip === 'high' && Math.random() < 0.6) { marbles = marbles.filter(m => m.id !== shooter.id); logEntry.details += 'Shooter also eliminated (high risk).'; }
    } else {
      logEntry.result = 'Target survived';
      if (ip === 'high' && Math.random() < 0.3) { marbles = marbles.filter(m => m.id !== shooter.id); logEntry.details = 'Shooter eliminated in failed attack.'; }
    }
  }

  gameLog.push(logEntry);
  logEntry.translation = translateOutcome(logEntry);
  updateLog(); draw(); updateShooterTargetLists(); updateConfigurationDisplay();
}

function translateOutcome(logEntry) {
  let trans = '';
  const ipMap = {low:'incremental', med:'significant', high:'radical'};
  const aiMap = {radial:'direct attack', tangential:'indirect maneuver'};
  if (!logEntry.target && logEntry.intention === 'reposition') {
    trans = 'Internal realignment.';
    if (logEntry.result.includes('eliminated')) trans += ' The repositioning failed catastrophically.';
  } else if (logEntry.target) {
    trans = `${ipMap[logEntry.ip]} ${aiMap[logEntry.ai]} against opponent asset. `;
    if (logEntry.result.includes('Target eliminated')) {
      trans += 'Opponent asset neutralized.';
      if (logEntry.details.includes('Cascade')) trans += ' Hidden dependencies triggered a chain reaction.';
      if (logEntry.details.includes('Shooter also eliminated')) trans += ' Pyrrhic victory – your resource was also lost.';
    } else if (logEntry.result.includes('Target survived')) {
      trans += 'The attack failed.';
      if (logEntry.details.includes('Shooter eliminated')) trans += ' Your resource was destroyed.';
    }
  }
  if (logEntry.result.includes('Status Quo')) trans = 'No action taken. Market drifted.';
  return trans;
}

function executePlayerMove() {
  let shooterId = parseInt(document.getElementById('shooterSelect').value);
  let targetId = document.getElementById('targetSelect').value ? parseInt(document.getElementById('targetSelect').value) : null;
  let ip = document.getElementById('ip').value, ai = document.getElementById('ai').value, intention = document.getElementById('intention').value;
  if (!shooterId) { alert('Select a shooter'); return; }
  let shooter = findMarble(shooterId); if (!shooter) return;
  let target = targetId ? findMarble(targetId) : null;
  resolveMove(shooter, target, ip, ai, intention, true);
  updateLog(); draw(); updateShooterTargetLists(); updateConfigurationDisplay();
}

function statusQuo() {
  gameLog.push({turn: currentTurn, result: 'Status Quo – no action taken.', details: 'Board drifts; Predatory Gravity applied.', translation: 'No strategic action taken. Market drifted.'});
  updateLog(); nextTurn();
}

function nextTurn() {
  currentTurn++;
  marbles.forEach(m => { if (m.mdiTimer>0) m.mdiTimer--; if (m.stickers.defended) m.stickers.defended = false; });
  applyPredatoryGravity();
  draw(); updateTurnDisplay();
}

// ==================== SFF DRIFT PROTOCOL (end of turn) ====================
function applyPredatoryGravity() {
  marbles.forEach(m => {
    if (m.team === 'player' && sff.cgComp === 3 && zoneOfMarble(m) !== 'Death') {
      let d = dist(m.x, m.y, CENTER.x, CENTER.y);
      let nd = d + 25;
      if (nd > RADIUS - m.r) {
        let counter = confirm(`Predatory Gravity threatens to eliminate "${m.label||'Marble '+m.id}". Counter-force?`);
        if (!counter) {
          marbles = marbles.filter(x => x.id !== m.id);
          gameLog.push({turn: currentTurn, result: `Predatory Gravity eliminated ${m.label||'Marble'}.`, translation: 'Eroded by incumbent scale.'});
        } else {
          gameLog.push({turn: currentTurn, result: `Predatory Gravity resisted on ${m.label||'Marble'}.`});
        }
        updateLog();
      } else {
        let ang = Math.atan2(m.y - CENTER.y, m.x - CENTER.x);
        m.x = CENTER.x + Math.cos(ang)*nd; m.y = CENTER.y + Math.sin(ang)*nd;
      }
    }
    if (m.team === 'adversary' && sff.cgSelf === 3 && zoneOfMarble(m) !== 'Death') {
      let d = dist(m.x, m.y, CENTER.x, CENTER.y);
      let nd = d + 25;
      if (nd > RADIUS - m.r) {
        marbles = marbles.filter(x => x.id !== m.id);
        gameLog.push({turn: currentTurn, result: `Predatory Gravity eliminated adversary ${m.label||'Marble'}.`});
      } else {
        let ang = Math.atan2(m.y - CENTER.y, m.x - CENTER.x);
        m.x = CENTER.x + Math.cos(ang)*nd; m.y = CENTER.y + Math.sin(ang)*nd;
      }
    }
  });
  draw();
}

// ==================== ADVERSARY CONTROL (human‑facilitated) ====================
function toggleAdversaryControl() {
  let controls = document.getElementById('adversaryControls');
  let indicator = document.getElementById('advControlIndicator');
  let btn = document.getElementById('advControlBtn');
  if (controls.style.display === 'none') {
    controls.style.display = 'block'; indicator.style.display = 'inline';
    btn.textContent = 'Deactivate Adversary Control';
    updateAdversaryLists(); suggestAdversaryMove();
  } else {
    controls.style.display = 'none'; indicator.style.display = 'none';
    btn.textContent = 'Activate Adversary Control';
  }
}

function updateAdversaryLists() {
  let shooterSel = document.getElementById('advShooterSelect'), targetSel = document.getElementById('advTargetSelect');
  shooterSel.innerHTML = '<option value="">-- select adversary marble --</option>';
  targetSel.innerHTML = '<option value="">-- none (reposition) --</option>';
  marbles.filter(m => m.team === 'adversary').forEach(m => {
    shooterSel.innerHTML += `<option value="${m.id}">${m.label||'Marble '+m.id}</option>`;
  });
  marbles.filter(m => m.team === 'player').forEach(m => {
    targetSel.innerHTML += `<option value="${m.id}">${m.label||'Marble '+m.id} (player)</option>`;
  });
}

function suggestAdversaryMove() {
  let own = marbles.filter(m => m.team === 'adversary'), player = marbles.filter(m => m.team === 'player');
  if (own.length===0 || player.length===0) return;
  const p = adversaryProfile;
  let shooters = own;
  if (p.organizationalAgility >= 4) { shooters = own.filter(m => m.stickers.mdi !== 'high'); if (shooters.length===0) shooters = own; }
  let shooter = shooters[Math.floor(Math.random()*shooters.length)];
  let targets = player;
  if (p.focusOfAttack >= 4) { targets = player.filter(m => m.stickers.sm || m.stickers.anchor); if (targets.length===0) targets = player; }
  else if (p.focusOfAttack <= 2) { targets = player.filter(m => zoneOfMarble(m)==='Death' || m.stickers.vuln==='high'); if (targets.length===0) targets = player; }
  let target = targets[Math.floor(Math.random()*targets.length)];
  let ip = p.riskTolerance >= 4 ? 'high' : p.riskTolerance <= 2 ? 'low' : 'med';
  let ai = (sff.narrative >= 3 && p.adaptability >= 3) ? 'tangential' : 'radial';
  document.getElementById('advShooterSelect').value = shooter.id;
  document.getElementById('advTargetSelect').value = target.id;
  document.getElementById('advIP').value = ip;
  document.getElementById('advAI').value = ai;
}

function executeAdversaryMove() {
  let shooterId = parseInt(document.getElementById('advShooterSelect').value);
  let targetId = document.getElementById('advTargetSelect').value ? parseInt(document.getElementById('advTargetSelect').value) : null;
  let ip = document.getElementById('advIP').value, ai = document.getElementById('advAI').value, intention = document.getElementById('advIntention').value;
  if (!shooterId) { alert('Select an adversary shooter'); return; }
  let shooter = findMarble(shooterId);
  if (!shooter || shooter.team !== 'adversary') { alert('Shooter must be an adversary marble'); return; }
  let target = targetId ? findMarble(targetId) : null;
  if (target && target.team !== 'player') { alert('Target must be a player marble'); return; }
  resolveMove(shooter, target, ip, ai, intention, false);
}

// ==================== ARCHETYPE MAKER ====================
const dimNames = ['Aggressiveness','Response Speed','Risk Tolerance','Focus of Attack','Predictability','Emotionality','Strategic Horizon','Organizational Agility','Collaborative Tendency','Response to Threat','Adaptability','Transparency','Resource Conservation','Learning Orientation'];
const dimKeys = ['aggressiveness','responseSpeed','riskTolerance','focusOfAttack','predictability','emotionality','strategicHorizon','organizationalAgility','collaborativeTendency','responseToThreat','adaptability','transparency','resourceConservation','learningOrientation'];

function buildArchetypeSliders() {
  let container = document.getElementById('archetypeSliders');
  container.innerHTML = '';
  dimKeys.forEach((key, i) => {
    let div = document.createElement('div'); div.className = 'dim-slider';
    let label = document.createElement('label'); label.textContent = dimNames[i];
    let slider = document.createElement('input'); slider.type='range'; slider.min=1; slider.max=5; slider.value = adversaryProfile[key]; slider.id = 'dim-'+i;
    let span = document.createElement('span'); span.textContent = slider.value;
    slider.addEventListener('input', ()=>{ span.textContent = slider.value; });
    div.appendChild(label); div.appendChild(slider); div.appendChild(span);
    container.appendChild(div);
  });
}

function saveArchetypeProfile() {
  dimKeys.forEach((key,i) => { adversaryProfile[key] = parseInt(document.getElementById('dim-'+i).value); });
  alert('Adversary profile updated!');
}

function loadPredefinedArchetype(type) {
  const profiles = {
    sleepy: {aggressiveness:2,responseSpeed:2,riskTolerance:2,focusOfAttack:3,predictability:4,emotionality:1,strategicHorizon:4,organizationalAgility:1,collaborativeTendency:2,responseToThreat:3,adaptability:2,transparency:2,resourceConservation:4,learningOrientation:2},
    impulsive: {aggressiveness:5,responseSpeed:5,riskTolerance:5,focusOfAttack:3,predictability:3,emotionality:3,strategicHorizon:2,organizationalAgility:3,collaborativeTendency:1,responseToThreat:5,adaptability:3,transparency:2,resourceConservation:1,learningOrientation:2},
    cold: {aggressiveness:3,responseSpeed:3,riskTolerance:2,focusOfAttack:3,predictability:5,emotionality:1,strategicHorizon:4,organizationalAgility:3,collaborativeTendency:2,responseToThreat:3,adaptability:3,transparency:3,resourceConservation:3,learningOrientation:4},
    custom: {}
  };
  let p = profiles[type] || {};
  if (type === 'custom') { for (let k of dimKeys) adversaryProfile[k] = 3; }
  else { Object.assign(adversaryProfile, p); }
  buildArchetypeSliders();
}

function exportProfile() {
  let json = JSON.stringify(adversaryProfile, null, 2);
  let blob = new Blob([json], {type:'application/json'});
  let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'adversary-profile.json'; a.click();
}
function importProfile() {
  let input = document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange = e => {
    let file = e.target.files[0];
    let reader = new FileReader();
    reader.onload = () => { adversaryProfile = JSON.parse(reader.result); buildArchetypeSliders(); };
    reader.readAsText(file);
  };
  input.click();
}

// ==================== CONFIGURATION DETECTION ====================
function detectConfiguration() {
  const player = marbles.filter(m => m.team === 'player'), adv = marbles.filter(m => m.team === 'adversary');
  if (player.length===0 || adv.length===0) return 'Unknown';
  const avgDist = arr => arr.reduce((s,m) => s + dist(m.x,m.y,CENTER.x,CENTER.y), 0)/arr.length;
  const pAvg = avgDist(player), aAvg = avgDist(adv);
  const stdDist = arr => {
    const avg = avgDist(arr);
    return Math.sqrt(arr.reduce((s,m) => s + Math.pow(dist(m.x,m.y,CENTER.x,CENTER.y)-avg,2), 0)/arr.length);
  };
  if (pAvg < RADIUS*0.3 && aAvg > RADIUS*0.6) return 'Concentrated Core (Player dominant)';
  if (aAvg < RADIUS*0.3 && pAvg > RADIUS*0.6) return 'Concentrated Core (Adversary dominant)';
  if (pAvg < RADIUS*0.5 && aAvg < RADIUS*0.5 && stdDist(player)<50 && stdDist(adv)<50) return 'Bipolar Confrontation';
  if (pAvg > RADIUS*0.7 && aAvg < RADIUS*0.4) return 'Perimeter Defense (Player Ring)';
  if (aAvg > RADIUS*0.7 && pAvg < RADIUS*0.4) return 'Perimeter Defense (Adversary Ring)';
  let inter = 0, cnt = 0;
  player.forEach(pm => adv.forEach(am => { inter += dist(pm.x,pm.y,am.x,am.y); cnt++; }));
  inter /= cnt;
  if (inter < 80) return 'Infiltration (Mixture)';
  if (Math.abs(player.length - adv.length) >= 3) return 'Critical Numerical Asymmetry';
  return 'Homogeneous Dispersion';
}

// ==================== DISSOLUTION ====================
function dissolveModel() {
  if (sff.regWind >= 3 || sff.narrative >= 3) {
    if (confirm('Dissolve the model and record the strategic question?')) {
      let q = prompt('What is the single most important thing to do/not do in the next 6 months?');
      gameLog.push({turn: currentTurn, result: 'Model dissolved. Strategic question: '+q});
      resetBoard(); simulationPhase = 'calibration';
      alert('Board cleared. You may now recalibrate.');
    }
  } else { alert('Conditions not met (RegWind or Narrative ≥ 3).'); }
}

function resetBoard() { marbles=[]; arrows=[]; forceArrows=[]; selectedMarble=null; gameLog=[]; draw(); updateShooterTargetLists(); updateLog(); updateConfigurationDisplay(); }

// ==================== EXPORT/IMPORT SESSION ====================
function exportState() {
  let state = {marbles, arrows, forceArrows, sff, adversaryProfile, gameLog};
  let json = JSON.stringify(state, null, 2);
  let blob = new Blob([json], {type:'application/json'});
  let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'competitive-circle-session.json'; a.click();
}
function importState() {
  let input = document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange = e => {
    let file = e.target.files[0];
    let reader = new FileReader();
    reader.onload = () => {
      let state = JSON.parse(reader.result);
      marbles = state.marbles || []; arrows = state.arrows || []; forceArrows = state.forceArrows || [];
      sff = state.sff || sff; adversaryProfile = state.adversaryProfile || adversaryProfile; gameLog = state.gameLog || [];
      draw(); updateShooterTargetLists(); updateLog(); buildArchetypeSliders();
    };
    reader.readAsText(file);
  };
  input.click();
}

// ==================== FORCE ARROW TOOLS ====================
function startForceArrow(type, defaultColor) {
  forceArrowMode = type;
  forceArrowColor = (type === 'custom') ? document.getElementById('forceCustomColor').value : defaultColor;
  document.getElementById('forceStatus').textContent = `Click & drag on canvas to draw: ${type}`;
}

function clearForceArrows() { forceArrows = []; draw(); }

// ==================== TAB SWITCHING ====================
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', function() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  this.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + this.dataset.tab).classList.add('active');
}));

// ==================== INITIALISATION ====================
buildArchetypeSliders();
draw();
updateShooterTargetLists();