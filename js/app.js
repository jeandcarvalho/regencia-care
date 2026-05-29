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
  },
  deletePatientHistory(patientId) {
    const all = JSON.parse(localStorage.getItem('rc_history') || '{}');
    delete all[patientId];
    localStorage.setItem('rc_history', JSON.stringify(all));
  }
};

// ── State ────────────────────────────────────────────────────────────────────

let activePatientId = null;
let filterStatus    = 'internado';

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
  const list     = document.getElementById('patient-list');

  const filtered = filterStatus === 'todos'
    ? patients
    : patients.filter(p => (p.status || 'internado') === 'internado');

  document.getElementById('btn-filter-internados').classList.toggle('active', filterStatus === 'internado');
  document.getElementById('btn-filter-todos').classList.toggle('active', filterStatus === 'todos');

  if (filtered.length === 0) {
    const msg = patients.length === 0
      ? 'Nenhum paciente cadastrado ainda.'
      : 'Nenhum paciente internado no momento.';
    list.innerHTML = `<p class="empty-state">${msg}</p>`;
    return;
  }

  list.innerHTML = filtered.map(p => {
    const status = p.status || 'internado';
    return `
      <div class="patient-card${status === 'alta' ? ' patient-card--alta' : ''}"
           role="button" tabindex="0"
           onclick="openPatient('${esc(p.id)}')"
           onkeydown="if(event.key==='Enter')openPatient('${esc(p.id)}')">
        <div class="patient-card-info">
          <div class="patient-name">${esc(p.name)}</div>
          <div class="patient-bed">Leito ${esc(p.bed)}</div>
        </div>
        <div class="patient-card-right">
          <span class="status-badge status-${esc(status)}">
            ${status === 'internado' ? 'Internado' : 'Alta'}
          </span>
          <span class="chevron" aria-hidden="true">›</span>
        </div>
      </div>`;
  }).join('');
}

function handleAddPatient(e) {
  e.preventDefault();
  const name = fieldVal('new-name').trim();
  const bed  = fieldVal('new-bed').trim();
  if (!name || !bed) return;

  const patients = DB.getPatients();
  patients.push({ id: crypto.randomUUID(), name, bed, status: 'internado', createdAt: new Date().toISOString() });
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

  closeEditPanel();
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

// ── Edit patient panel ───────────────────────────────────────────────────────

function openEditPanel() {
  const patient = DB.getPatients().find(p => p.id === activePatientId);
  if (!patient) return;

  document.getElementById('edit-name').value   = patient.name;
  document.getElementById('edit-bed').value    = patient.bed;
  document.getElementById('edit-status').value = patient.status || 'internado';

  document.getElementById('edit-patient-panel').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('edit-name').focus();
}

function closeEditPanel() {
  document.getElementById('edit-patient-panel').classList.add('hidden');
}

function handleEditPatient(e) {
  e.preventDefault();
  const name   = document.getElementById('edit-name').value.trim();
  const bed    = document.getElementById('edit-bed').value.trim();
  const status = document.getElementById('edit-status').value;
  if (!name || !bed) return;

  const patients = DB.getPatients().map(p =>
    p.id === activePatientId ? { ...p, name, bed, status } : p
  );
  DB.savePatients(patients);

  document.getElementById('patient-header-name').textContent = name;
  document.getElementById('patient-header-bed').textContent  = `Leito ${bed}`;
  closeEditPanel();
}

function deletePatient() {
  const patient = DB.getPatients().find(p => p.id === activePatientId);
  if (!patient) return;
  if (!confirm(`Excluir "${patient.name}"?\nTodo o histórico será apagado permanentemente.`)) return;

  DB.savePatients(DB.getPatients().filter(p => p.id !== activePatientId));
  DB.deletePatientHistory(activePatientId);

  activePatientId = null;
  renderPatients();
  showScreen('screen-home');
}

// ── Auto-alerts (todos os sinais vitais) ─────────────────────────────────────

function detectAlerts(vitals) {
  const alerts = [];

  // PA — aceita "120/80" ou "120x80"
  const paMatch = (vitals.pa || '').match(/^(\d+)[\/x](\d+)/i);
  if (paMatch) {
    const sis = parseInt(paMatch[1]);
    const dia = parseInt(paMatch[2]);
    if (sis >= 140 || dia >= 90) alerts.push('hipertensao');
    if (sis < 90)                alerts.push('hipotensao');
  }

  // FC
  const fc = parseFloat(vitals.fc);
  if (vitals.fc !== '' && !isNaN(fc)) {
    if (fc > 100)      alerts.push('taquicardia');
    else if (fc < 60)  alerts.push('bradicardia');
  }

  // FR
  const fr = parseFloat(vitals.fr);
  if (vitals.fr !== '' && !isNaN(fr)) {
    if (fr > 20)      alerts.push('taquipneia');
    else if (fr < 12) alerts.push('bradipneia');
  }

  // Temperatura
  const temp = parseFloat(vitals.temp);
  if (vitals.temp !== '' && !isNaN(temp)) {
    if (temp >= 39)        alerts.push('febre_alta');
    else if (temp > 37.8)  alerts.push('febre');
    else if (temp < 35)    alerts.push('hipotermia');
  }

  // SpO2
  const spo2 = parseFloat(vitals.spo2);
  if (vitals.spo2 !== '' && !isNaN(spo2)) {
    if (spo2 < 90)      alerts.push('dessaturacao_grave');
    else if (spo2 < 95) alerts.push('dessaturacao');
  }

  // Glicemia
  const g = parseFloat(vitals.glicemia);
  if (vitals.glicemia !== '' && !isNaN(g)) {
    if (g < 70)        alerts.push('hipoglicemia');
    else if (g > 180)  alerts.push('hiperglicemia');
  }

  // Dor
  const d = parseFloat(vitals.dor);
  if (vitals.dor !== '' && !isNaN(d) && d >= 7) alerts.push('dor');

  return alerts;
}

const ALERT_LABELS = {
  hipertensao:        '⚠️ Hipertensão',
  hipotensao:         '⚠️ Hipotensão',
  taquicardia:        '⚠️ Taquicardia',
  bradicardia:        '⚠️ Bradicardia',
  taquipneia:         '⚠️ Taquipneia',
  bradipneia:         '⚠️ Bradipneia',
  febre:              '⚠️ Febre',
  febre_alta:         '⚠️ Febre alta',
  hipotermia:         '⚠️ Hipotermia',
  dessaturacao:       '⚠️ Dessaturação de O₂',
  dessaturacao_grave: '⚠️ Dessaturação grave',
  hipoglicemia:       '⚠️ Hipoglicemia',
  hiperglicemia:      '⚠️ Hiperglicemia',
  dor:                '⚠️ Dor intensa',
};

function checkAlerts() {
  const vitals = {
    pa:       fieldVal('v-pa').trim(),
    fc:       fieldVal('v-fc'),
    fr:       fieldVal('v-fr'),
    temp:     fieldVal('v-temp'),
    spo2:     fieldVal('v-spo2'),
    glicemia: fieldVal('v-glicemia'),
    dor:      fieldVal('v-dor'),
  };
  const alerts       = detectAlerts(vitals);
  const alertsArea   = document.getElementById('alerts-area');
  const condutaGroup = document.getElementById('conduta-group');

  alertsArea.innerHTML = '';

  if (alerts.length > 0) {
    alertsArea.innerHTML = alerts
      .map(a => `<div class="alert alert-warning">${ALERT_LABELS[a]}</div>`)
      .join('');
    condutaGroup.classList.remove('hidden');
  } else {
    const hasInput = Object.values(vitals).some(v => v !== '');
    if (hasInput) alertsArea.innerHTML = '<div class="alert alert-ok">✔️ Sem alterações</div>';
    condutaGroup.classList.add('hidden');
  }
}

// ── Evolução note builder ────────────────────────────────────────────────────

function buildEvolucao(patientName, vitals, alerts, conduta) {
  const condutaText = conduta ? ` Conduta: ${conduta}.` : '';

  if (alerts.length === 0) {
    return `Paciente ${patientName} estável, sem alterações.`;
  }

  const descMap = {
    hipertensao:        `hipertensão (PA ${vitals.pa})`,
    hipotensao:         `hipotensão (PA ${vitals.pa})`,
    taquicardia:        `taquicardia (FC ${vitals.fc} bpm)`,
    bradicardia:        `bradicardia (FC ${vitals.fc} bpm)`,
    taquipneia:         `taquipneia (FR ${vitals.fr} irpm)`,
    bradipneia:         `bradipneia (FR ${vitals.fr} irpm)`,
    febre:              `febre (Temp ${vitals.temp} °C)`,
    febre_alta:         `febre alta (Temp ${vitals.temp} °C)`,
    hipotermia:         `hipotermia (Temp ${vitals.temp} °C)`,
    dessaturacao:       `dessaturação de O₂ (SpO2 ${vitals.spo2}%)`,
    dessaturacao_grave: `dessaturação grave (SpO2 ${vitals.spo2}%)`,
    hipoglicemia:       `hipoglicemia (Glicemia ${vitals.glicemia} mg/dL)`,
    hiperglicemia:      `hiperglicemia (Glicemia ${vitals.glicemia} mg/dL)`,
    dor:                `dor intensa (${vitals.dor}/10)`,
  };

  const parts = alerts.map(a => descMap[a]).filter(Boolean);
  return `Paciente ${patientName} apresentou ${parts.join(', ')}.${condutaText}`;
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

  const alerts  = detectAlerts(vitals);
  const conduta = fieldVal('v-conduta').trim();

  if (alerts.length > 0 && !conduta) {
    document.getElementById('conduta-error').classList.remove('hidden');
    document.getElementById('v-conduta').focus();
    return;
  }
  document.getElementById('conduta-error').classList.add('hidden');

  const patient  = DB.getPatients().find(p => p.id === activePatientId);
  const evolucao = buildEvolucao(patient.name, vitals, alerts, conduta);
  const entry    = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), vitals, alerts, conduta, evolucao };

  const history = DB.getHistory(activePatientId);
  history.unshift(entry);
  DB.saveHistory(activePatientId, history);

  resetVitalsForm();

  const banner = document.getElementById('save-success');
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 3000);

  renderHistory(activePatientId);
}

// ── Copy evolução ────────────────────────────────────────────────────────────

function copyEvolucao(entryId) {
  const history = DB.getHistory(activePatientId);
  const entry   = history.find(e => e.id === entryId);
  if (!entry) return;

  const btn = document.querySelector(`[data-copy-id="${entryId}"]`);

  const onDone = () => {
    if (!btn) return;
    btn.textContent = '✔️ Copiado!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📋 Copiar evolução';
      btn.classList.remove('copied');
    }, 2000);
  };

  if (navigator.clipboard) {
    navigator.clipboard.writeText(entry.evolucao).then(onDone);
  } else {
    const ta = document.createElement('textarea');
    ta.value = entry.evolucao;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    onDone();
  }
}

// ── History ──────────────────────────────────────────────────────────────────

function renderHistory(patientId) {
  const history   = DB.getHistory(patientId);
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
        <button class="btn-copy"
                data-copy-id="${esc(entry.id)}"
                onclick="copyEvolucao('${esc(entry.id)}')">
          📋 Copiar evolução
        </button>
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
  // Home
  document.getElementById('add-patient-form').addEventListener('submit', handleAddPatient);
  document.getElementById('btn-filter-internados').addEventListener('click', () => { filterStatus = 'internado'; renderPatients(); });
  document.getElementById('btn-filter-todos').addEventListener('click',      () => { filterStatus = 'todos';     renderPatients(); });

  // Patient screen nav
  document.getElementById('btn-back').addEventListener('click', () => {
    activePatientId = null;
    renderPatients();
    showScreen('screen-home');
  });

  // Edit / delete
  document.getElementById('btn-edit-patient').addEventListener('click',    openEditPanel);
  document.getElementById('btn-delete-patient').addEventListener('click',   deletePatient);
  document.getElementById('edit-patient-form').addEventListener('submit',   handleEditPatient);
  document.getElementById('btn-cancel-edit').addEventListener('click',      closeEditPanel);

  // Vitals
  document.getElementById('vitals-form').addEventListener('submit', handleSaveVitals);
  ['v-pa', 'v-fc', 'v-fr', 'v-temp', 'v-spo2', 'v-glicemia', 'v-dor'].forEach(id =>
    document.getElementById(id).addEventListener('input', checkAlerts)
  );

  registerSW();
  renderPatients();
  showScreen('screen-home');
});
