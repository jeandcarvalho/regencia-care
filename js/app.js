'use strict';

// ── Data layer (localStorage) ────────────────────────────────────────────────

const DB = {
  getPatients() {
    return JSON.parse(localStorage.getItem('rc_patients') || '[]');
  },
  savePatients(patients) {
    localStorage.setItem('rc_patients', JSON.stringify(patients));
  },
  getHistory(patientId) {
    const all = JSON.parse(localStorage.getItem('rc_history') || '{}');
    return all[patientId] || [];
  },
  saveHistory(patientId, entries) {
    const all = JSON.parse(localStorage.getItem('rc_history') || '{}');
    all[patientId] = entries;
    localStorage.setItem('rc_history', JSON.stringify(all));
  }
};

// ── State ────────────────────────────────────────────────────────────────────

let activePatientId = null;

// ── Navigation ───────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ── Utilities ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} às ${time}`;
}

function fieldVal(id) {
  return document.getElementById(id).value;
}

// ── Home screen: patient list ────────────────────────────────────────────────

function renderPatients() {
  const patients = DB.getPatients();
  const list = document.getElementById('patient-list');

  if (patients.length === 0) {
    list.innerHTML = '<p class="empty-state">Nenhum paciente cadastrado ainda.</p>';
    return;
  }

  list.innerHTML = patients.map(p => `
    <div class="patient-card"
         role="button" tabindex="0"
         onclick="openPatient('${esc(p.id)}')"
         onkeydown="if(event.key==='Enter')openPatient('${esc(p.id)}')">
      <div>
        <div class="patient-name">${esc(p.name)}</div>
        <div class="patient-bed">Leito ${esc(p.bed)}</div>
      </div>
      <span class="chevron" aria-hidden="true">›</span>
    </div>
  `).join('');
}

function handleAddPatient(e) {
  e.preventDefault();
  const name = fieldVal('new-name').trim();
  const bed  = fieldVal('new-bed').trim();
  if (!name || !bed) return;

  const patients = DB.getPatients();
  patients.push({
    id: crypto.randomUUID(),
    name,
    bed,
    createdAt: new Date().toISOString()
  });
  DB.savePatients(patients);

  document.getElementById('add-patient-form').reset();
  renderPatients();
}

// ── Patient screen ───────────────────────────────────────────────────────────

function openPatient(id) {
  const patient = DB.getPatients().find(p => p.id === id);
  if (!patient) return;

  activePatientId = id;

  document.getElementById('patient-header-name').textContent = patient.name;
  document.getElementById('patient-header-bed').textContent  = `Leito ${patient.bed}`;

  resetVitalsForm();
  renderHistory(id);
  showScreen('screen-patient');
}

function resetVitalsForm() {
  document.getElementById('vitals-form').reset();
  document.getElementById('alerts-area').innerHTML = '';
  document.getElementById('conduta-group').classList.add('hidden');
  document.getElementById('conduta-error').classList.add('hidden');
  document.getElementById('save-success').classList.add('hidden');
}

// ── Auto-alerts ──────────────────────────────────────────────────────────────

function detectAlerts(glicemia, dor) {
  const alerts = [];
  const g = parseFloat(glicemia);
  const d = parseFloat(dor);

  if (glicemia !== '' && !isNaN(g)) {
    if (g < 70)   alerts.push('hipoglicemia');
    else if (g > 180) alerts.push('hiperglicemia');
  }
  if (dor !== '' && !isNaN(d) && d >= 7) {
    alerts.push('dor');
  }
  return alerts;
}

const ALERT_LABELS = {
  hipoglicemia:  '⚠️ Hipoglicemia',
  hiperglicemia: '⚠️ Hiperglicemia',
  dor:           '⚠️ Dor intensa'
};

function checkAlerts() {
  const glicemia = fieldVal('v-glicemia');
  const dor      = fieldVal('v-dor');
  const alerts   = detectAlerts(glicemia, dor);

  const alertsArea   = document.getElementById('alerts-area');
  const condutaGroup = document.getElementById('conduta-group');

  alertsArea.innerHTML = '';

  if (alerts.length > 0) {
    alertsArea.innerHTML = alerts
      .map(a => `<div class="alert alert-warning">${ALERT_LABELS[a]}</div>`)
      .join('');
    condutaGroup.classList.remove('hidden');
  } else {
    const hasInput = glicemia !== '' || dor !== '';
    if (hasInput) {
      alertsArea.innerHTML = '<div class="alert alert-ok">✔️ Sem alterações</div>';
    }
    condutaGroup.classList.add('hidden');
  }
}

// ── Evolução note builder ────────────────────────────────────────────────────

function buildEvolucao(patientName, vitals, alerts, conduta) {
  if (alerts.length === 0) {
    return `Paciente ${patientName} estável, sem alterações.`;
  }

  return alerts.map(a => {
    if (a === 'hipoglicemia')
      return `Paciente ${patientName} apresentou hipoglicemia (${vitals.glicemia} mg/dL). Conduta: ${conduta}.`;
    if (a === 'hiperglicemia')
      return `Paciente ${patientName} apresentou hiperglicemia (${vitals.glicemia} mg/dL). Conduta: ${conduta}.`;
    if (a === 'dor')
      return `Paciente ${patientName} relatou dor intensa (${vitals.dor}/10). Conduta: ${conduta}.`;
    return '';
  }).filter(Boolean).join(' ');
}

// ── Save vitals ──────────────────────────────────────────────────────────────

function handleSaveVitals(e) {
  e.preventDefault();

  const vitals = {
    pa:       fieldVal('v-pa').trim(),
    fc:       fieldVal('v-fc'),
    fr:       fieldVal('v-fr'),
    temp:     fieldVal('v-temp'),
    spo2:     fieldVal('v-spo2'),
    glicemia: fieldVal('v-glicemia'),
    dor:      fieldVal('v-dor'),
  };

  const alerts  = detectAlerts(vitals.glicemia, vitals.dor);
  const conduta = fieldVal('v-conduta').trim();

  // Conduta is required when there are alerts
  if (alerts.length > 0 && !conduta) {
    document.getElementById('conduta-error').classList.remove('hidden');
    document.getElementById('v-conduta').focus();
    return;
  }
  document.getElementById('conduta-error').classList.add('hidden');

  const patient = DB.getPatients().find(p => p.id === activePatientId);
  const evolucao = buildEvolucao(patient.name, vitals, alerts, conduta);

  const entry = {
    id:        crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    vitals,
    alerts,
    conduta,
    evolucao
  };

  const history = DB.getHistory(activePatientId);
  history.unshift(entry); // newest first
  DB.saveHistory(activePatientId, history);

  resetVitalsForm();

  const successBanner = document.getElementById('save-success');
  successBanner.classList.remove('hidden');
  setTimeout(() => successBanner.classList.add('hidden'), 3000);

  renderHistory(activePatientId);
}

// ── History ──────────────────────────────────────────────────────────────────

function renderHistory(patientId) {
  const history  = DB.getHistory(patientId);
  const container = document.getElementById('history-list');

  if (history.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum registro salvo ainda.</p>';
    return;
  }

  container.innerHTML = history.map(entry => `
    <div class="history-entry">
      <div class="history-entry-header"
           role="button" tabindex="0"
           onclick="toggleHistoryEntry('${esc(entry.id)}')"
           onkeydown="if(event.key==='Enter')toggleHistoryEntry('${esc(entry.id)}')">
        <div class="history-meta">
          <span class="history-date">${formatDateTime(entry.timestamp)}</span>
          ${entry.alerts.length > 0
            ? '<span class="badge-alert">⚠️ Alerta registrado</span>'
            : '<span class="badge-ok">✔️ Sem alterações</span>'}
        </div>
        <span class="chevron" aria-hidden="true">›</span>
      </div>
      <div class="history-detail hidden" id="hentry-${esc(entry.id)}">
        <p class="evolucao-text">${esc(entry.evolucao)}</p>
        ${buildVitalsTable(entry.vitals)}
      </div>
    </div>
  `).join('');
}

function toggleHistoryEntry(id) {
  const el = document.getElementById(`hentry-${id}`);
  if (el) el.classList.toggle('hidden');
}

function buildVitalsTable(vitals) {
  const rows = [
    ['PA',       vitals.pa       || null],
    ['FC',       vitals.fc       ? vitals.fc       + ' bpm'   : null],
    ['FR',       vitals.fr       ? vitals.fr       + ' irpm'  : null],
    ['Temp',     vitals.temp     ? vitals.temp     + ' °C'    : null],
    ['SpO2',     vitals.spo2     ? vitals.spo2     + '%'      : null],
    ['Glicemia', vitals.glicemia ? vitals.glicemia + ' mg/dL' : null],
    ['Dor',      vitals.dor !== '' && vitals.dor != null ? vitals.dor + '/10' : null],
  ].filter(([, v]) => v !== null && v !== '');

  if (rows.length === 0) return '';

  return `<table class="vitals-table">
    <tbody>
      ${rows.map(([k, v]) => `
        <tr>
          <td class="vt-label">${esc(k)}</td>
          <td class="vt-val">${esc(v)}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// ── Service worker registration ──────────────────────────────────────────────

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-patient-form').addEventListener('submit', handleAddPatient);
  document.getElementById('vitals-form').addEventListener('submit', handleSaveVitals);
  document.getElementById('v-glicemia').addEventListener('input', checkAlerts);
  document.getElementById('v-dor').addEventListener('input', checkAlerts);

  document.getElementById('btn-back').addEventListener('click', () => {
    activePatientId = null;
    renderPatients();
    showScreen('screen-home');
  });

  registerSW();
  renderPatients();
  showScreen('screen-home');
});
