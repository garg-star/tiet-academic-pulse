/**
 * @fileoverview Client-side UI controller for TIET AcademicPulse.
 * Handles DOM rendering, debounced filters/inputs, localStorage persistence,
 * JSON backup export/import, and WCAG 2.1 AA modal/keyboard interactions.
 */

import {
  GRADE_POINTS,
  SCHEMA_VERSION,
  STORAGE_KEY,
  VALID_GRADES,
  calculateAttendanceMetrics,
  calculateProjectedCGPA,
  createDemoState,
  filterSubjects,
  formatGPA,
  formatPercentage,
  summarizeAttendance,
  validateBackupPayload,
  validateCredits,
  validateGrade,
  validatePriorAcademics,
  validateSubjectInput,
} from './core.js';

/**
 * Maximum allowed backup JSON file size (1 MiB).
 * @type {number}
 */
const MAX_IMPORT_BYTES = 1024 * 1024;

/**
 * Default debounce delay in milliseconds for text and numeric filter inputs.
 * @type {number}
 */
const DEBOUNCE_DELAY_MS = 200;

/**
 * Application runtime state.
 * @type {{
 *   schemaVersion: number,
 *   priorCredits: number,
 *   priorCgpa: number,
 *   subjects: Array<{
 *     id: string,
 *     courseCode: string,
 *     name: string,
 *     attended: number,
 *     total: number,
 *     credits: number,
 *     grade: string
 *   }>
 * }}
 */
let appState = createDemoState();

/**
 * Active filter criteria for the subject grid.
 * @type {{ query: string, status: string }}
 */
const filterState = {
  query: '',
  status: 'all',
};

/**
 * Element that held focus before opening a modal dialog, used to restore focus on close.
 * @type {HTMLElement | null}
 */
let lastFocusedElement = null;

/**
 * Active toast auto-dismiss timer ID.
 * @type {number | null}
 */
let toastTimerId = null;

/**
 * Creates a debounced wrapper that delays invoking `fn` until `delayMs` milliseconds
 * have elapsed since the last call.
 *
 * @template {(...args: any[]) => void} T
 * @param {T} fn - Callback function to debounce.
 * @param {number} [delayMs=200] - Debounce delay in milliseconds.
 * @returns {(...args: Parameters<T>) => void} Debounced function wrapper.
 * @throws {TypeError} If `fn` is not a function.
 */
export function debounce(fn, delayMs = DEBOUNCE_DELAY_MS) {
  if (typeof fn !== 'function') {
    throw new TypeError('Debounce target must be a function.');
  }
  let timerId = null;
  return (...args) => {
    if (timerId !== null) {
      window.clearTimeout(timerId);
    }
    timerId = window.setTimeout(() => {
      timerId = null;
      fn(...args);
    }, delayMs);
  };
}

/**
 * Safely creates a DOM element with optional classes and text content.
 *
 * @param {string} tagName - HTML tag name.
 * @param {string} [className=''] - Space-separated CSS classes.
 * @param {string} [textContent=''] - Safe text content (never parsed as HTML).
 * @returns {HTMLElement} Created element.
 */
function createEl(tagName, className = '', textContent = '') {
  const el = document.createElement(tagName);
  if (className) {
    el.className = className;
  }
  if (textContent !== '') {
    el.textContent = textContent;
  }
  return el;
}

/**
 * Displays a global error alert banner.
 *
 * @param {string} message - User-facing error message.
 * @returns {void}
 */
function showGlobalError(message) {
  const banner = document.getElementById('global-error-banner');
  const text = document.getElementById('global-error-text');
  if (!banner || !text) return;
  text.textContent = message;
  banner.classList.remove('hidden');
}

/**
 * Hides the global error alert banner.
 *
 * @returns {void}
 */
function hideGlobalError() {
  const banner = document.getElementById('global-error-banner');
  const text = document.getElementById('global-error-text');
  if (!banner || !text) return;
  text.textContent = '';
  banner.classList.add('hidden');
}

/**
 * Displays a non-intrusive polite status toast notification.
 *
 * @param {string} message - Status text to announce.
 * @param {'info' | 'success' | 'error'} [variant='success'] - Visual tone.
 * @returns {void}
 */
function showToast(message, variant = 'success') {
  const region = document.getElementById('toast-region');
  if (!region) return;

  if (toastTimerId !== null) {
    window.clearTimeout(toastTimerId);
  }

  region.replaceChildren();
  const toneClass =
    variant === 'error'
      ? 'bg-rose-900 text-white border-rose-700'
      : variant === 'info'
        ? 'bg-slate-900 text-white border-slate-700'
        : 'bg-emerald-900 text-white border-emerald-700';

  const toast = createEl(
    'div',
    `pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${toneClass}`,
    message
  );
  region.appendChild(toast);

  toastTimerId = window.setTimeout(() => {
    region.replaceChildren();
    toastTimerId = null;
  }, 3200);
}

/**
 * Persists the current application state to `localStorage`.
 *
 * @returns {void}
 */
function saveState() {
  try {
    const serialized = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      priorCredits: appState.priorCredits,
      priorCgpa: appState.priorCgpa,
      subjects: appState.subjects,
    });
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    showGlobalError(`Unable to save locally: ${error instanceof Error ? error.message : 'Storage quota exceeded.'}`);
  }
}

/**
 * Loads and validates saved application state from `localStorage`, falling back
 * to the default Thapar University demo semester when absent or corrupted.
 *
 * @returns {void}
 */
function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      appState = createDemoState();
      saveState();
      return;
    }
    const parsed = JSON.parse(raw);
    appState = validateBackupPayload(parsed);
  } catch {
    appState = createDemoState();
    saveState();
    showGlobalError('Saved browser data was corrupted or incompatible and has been restored to the demo semester.');
  }
}

/**
 * Updates the summary KPI cards (`aria-live="polite"`) from current state.
 *
 * @returns {void}
 */
function renderKPIs() {
  const attendance = summarizeAttendance(appState.subjects);
  const gpa = calculateProjectedCGPA(appState.subjects, appState.priorCredits, appState.priorCgpa);

  const overallAttEl = document.getElementById('kpi-overall-attendance');
  const overallClassesEl = document.getElementById('kpi-overall-classes');
  const healthHeadlineEl = document.getElementById('kpi-health-headline');
  const healthDetailEl = document.getElementById('kpi-health-detail');
  const sgpaEl = document.getElementById('kpi-projected-sgpa');
  const semCreditsEl = document.getElementById('kpi-semester-credits');
  const cgpaEl = document.getElementById('kpi-projected-cgpa');
  const combinedCreditsEl = document.getElementById('kpi-combined-credits');

  if (overallAttEl) {
    overallAttEl.textContent = formatPercentage(attendance.overallPercentage);
    overallAttEl.className = `mt-2 text-3xl font-extrabold ${
      attendance.totalConducted === 0
        ? 'text-slate-900'
        : attendance.overallPercentage >= 80
          ? 'text-emerald-700'
          : attendance.overallPercentage >= 75
            ? 'text-amber-700'
            : 'text-rose-700'
    }`;
  }

  if (overallClassesEl) {
    overallClassesEl.textContent = `${attendance.totalAttended} / ${attendance.totalConducted} classes attended`;
  }

  if (healthHeadlineEl) {
    healthHeadlineEl.textContent = `${attendance.safeCount} Safe · ${attendance.riskCount} Risk`;
  }

  if (healthDetailEl) {
    healthDetailEl.textContent = `${attendance.borderlineCount} borderline (75–79.9%) · ${attendance.subjectCount} total`;
  }

  if (sgpaEl) {
    sgpaEl.textContent = formatGPA(gpa.sgpa);
  }

  if (semCreditsEl) {
    semCreditsEl.textContent = `Across ${gpa.semesterCredits.toFixed(1)} semester credits`;
  }

  if (cgpaEl) {
    cgpaEl.textContent = formatGPA(gpa.projectedCgpa);
  }

  if (combinedCreditsEl) {
    combinedCreditsEl.textContent = `Combined ${gpa.combinedCredits.toFixed(1)} total credits`;
  }
}

/**
 * Returns Tailwind badge styling tokens for an attendance status key.
 *
 * @param {'safe' | 'borderline' | 'risk' | 'neutral'} statusKey - Computed status identifier.
 * @returns {{ badgeClass: string, barClass: string, marginBoxClass: string }} Styling class groups.
 */
function getStatusStyles(statusKey) {
  switch (statusKey) {
    case 'safe':
      return {
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        barClass: 'bg-emerald-600',
        marginBoxClass: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
      };
    case 'borderline':
      return {
        badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
        barClass: 'bg-amber-500',
        marginBoxClass: 'bg-amber-50/70 border-amber-200 text-amber-950',
      };
    case 'risk':
      return {
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        barClass: 'bg-rose-600',
        marginBoxClass: 'bg-rose-50/80 border-rose-200 text-rose-900',
      };
    default:
      return {
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        barClass: 'bg-slate-400',
        marginBoxClass: 'bg-slate-50 border-slate-200 text-slate-700',
      };
  }
}

/**
 * Builds an accessible subject card DOM element using safe `textContent` bindings.
 *
 * @param {{
 *   id: string,
 *   courseCode: string,
 *   name: string,
 *   attended: number,
 *   total: number,
 *   credits: number,
 *   grade: string
 * }} subject - Validated subject record.
 * @returns {HTMLElement} Rendered `<article>` card element.
 */
function buildSubjectCard(subject) {
  const metrics = calculateAttendanceMetrics(subject.attended, subject.total);
  const styles = getStatusStyles(metrics.statusKey);

  const card = createEl(
    'article',
    'bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-4'
  );
  card.dataset.subjectId = subject.id;

  // Card Header: Course code, title, status badge, edit/delete actions
  const header = createEl('div', 'flex items-start justify-between gap-3');
  const titleWrap = createEl('div', 'min-w-0 flex-1');

  const metaRow = createEl('div', 'flex flex-wrap items-center gap-2 mb-1');
  const codeBadge = createEl(
    'span',
    'inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold tracking-wide text-indigo-800',
    subject.courseCode
  );
  const statusBadge = createEl(
    'span',
    `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles.badgeClass}`,
    metrics.statusKey === 'safe'
      ? 'Safe (>= 80%)'
      : metrics.statusKey === 'borderline'
        ? 'Borderline (75–79.9%)'
        : metrics.statusKey === 'risk'
          ? 'Detention Risk (< 75%)'
          : 'No Classes'
  );
  metaRow.append(codeBadge, statusBadge);

  const titleHeading = createEl('h3', 'text-base font-bold text-slate-900 truncate', subject.name);
  titleHeading.title = subject.name;
  titleWrap.append(metaRow, titleHeading);

  const actionsWrap = createEl('div', 'flex items-center gap-1 shrink-0');
  const editBtn = createEl(
    'button',
    'rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors',
    'Edit'
  );
  editBtn.type = 'button';
  editBtn.dataset.action = 'edit';
  editBtn.setAttribute('aria-label', `Edit ${subject.courseCode} ${subject.name}`);

  const deleteBtn = createEl(
    'button',
    'rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors',
    'Delete'
  );
  deleteBtn.type = 'button';
  deleteBtn.dataset.action = 'delete';
  deleteBtn.setAttribute('aria-label', `Delete Subject ${subject.courseCode} ${subject.name}`);

  actionsWrap.append(editBtn, deleteBtn);
  header.append(titleWrap, actionsWrap);

  // Attendance Progress & Margin Box
  const attendanceSection = createEl('div', 'space-y-2.5');
  const statsRow = createEl('div', 'flex items-baseline justify-between gap-2');
  const pctText = createEl('span', 'text-2xl font-extrabold text-slate-900', formatPercentage(metrics.percentage));
  const fracText = createEl(
    'span',
    'text-xs font-medium text-slate-600',
    `${subject.attended} / ${subject.total} classes`
  );
  statsRow.append(pctText, fracText);

  const progressTrack = createEl(
    'div',
    'relative h-2.5 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200/70'
  );
  const progressFill = createEl('div', `h-full rounded-full transition-all ${styles.barClass}`);
  progressFill.style.width = `${Math.min(100, Math.max(0, metrics.percentage)).toFixed(1)}%`;

  // 75% marker line
  const thresholdMarker = createEl('div', 'absolute top-0 bottom-0 w-0.5 bg-slate-800/70');
  thresholdMarker.style.left = '75%';
  thresholdMarker.title = '75% TIET Minimum Threshold';
  progressTrack.append(progressFill, thresholdMarker);

  const marginBox = createEl('div', `rounded-lg border px-3 py-2 text-xs font-medium ${styles.marginBoxClass}`);
  if (metrics.statusKey === 'neutral') {
    marginBox.textContent = 'Log your first class using +1 Attended or +1 Missed.';
  } else if (metrics.meetsRequirement) {
    marginBox.textContent =
      metrics.safeBunks === 0
        ? '0 safe bunks available — attending the next class is required to stay at >= 75%.'
        : `Safe Bunks Available: ${metrics.safeBunks} consecutive ${metrics.safeBunks === 1 ? 'class' : 'classes'} can be missed while staying >= 75%.`;
  } else {
    marginBox.textContent = `Recovery Needed: Attend ${metrics.recoveryClasses} consecutive ${metrics.recoveryClasses === 1 ? 'class' : 'classes'} to reach 75%.`;
  }

  attendanceSection.append(statsRow, progressTrack, marginBox);

  // Quick Stepper Buttons (+1 Attended / +1 Missed)
  const stepperRow = createEl('div', 'grid grid-cols-2 gap-2');
  const attendBtn = createEl(
    'button',
    'inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors',
    '+1 Attended'
  );
  attendBtn.type = 'button';
  attendBtn.dataset.action = 'attend';
  attendBtn.setAttribute('aria-label', `+1 Attended for ${subject.courseCode} ${subject.name}`);

  const missBtn = createEl(
    'button',
    'inline-flex items-center justify-center rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors',
    '+1 Missed'
  );
  missBtn.type = 'button';
  missBtn.dataset.action = 'miss';
  missBtn.setAttribute('aria-label', `+1 Missed for ${subject.courseCode} ${subject.name}`);

  stepperRow.append(attendBtn, missBtn);

  // Inline Credits & Expected Grade Controls (with explicit <label for="...">)
  const gpaRow = createEl('div', 'grid grid-cols-2 gap-3 pt-3 border-t border-slate-100');

  const creditsWrap = createEl('div');
  const creditsInputId = `credits-${subject.id}`;
  const creditsLabel = createEl('label', 'block text-xs font-semibold text-slate-600 mb-1', 'Credits');
  creditsLabel.htmlFor = creditsInputId;
  const creditsInput = createEl(
    'input',
    'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900'
  );
  creditsInput.type = 'number';
  creditsInput.id = creditsInputId;
  creditsInput.min = '0.5';
  creditsInput.max = '10';
  creditsInput.step = '0.5';
  creditsInput.value = String(subject.credits);
  creditsInput.dataset.action = 'credits';
  creditsWrap.append(creditsLabel, creditsInput);

  const gradeWrap = createEl('div');
  const gradeSelectId = `grade-${subject.id}`;
  const gradeLabel = createEl('label', 'block text-xs font-semibold text-slate-600 mb-1', 'Expected Grade');
  gradeLabel.htmlFor = gradeSelectId;
  const gradeSelect = createEl(
    'select',
    'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900'
  );
  gradeSelect.id = gradeSelectId;
  gradeSelect.dataset.action = 'grade';

  for (const gradeKey of VALID_GRADES) {
    const option = document.createElement('option');
    option.value = gradeKey;
    option.textContent = `${gradeKey} (${GRADE_POINTS[gradeKey]})`;
    if (gradeKey === subject.grade) {
      option.selected = true;
    }
    gradeSelect.appendChild(option);
  }
  gradeWrap.append(gradeLabel, gradeSelect);

  gpaRow.append(creditsWrap, gradeWrap);

  card.append(header, attendanceSection, stepperRow, gpaRow);
  return card;
}

/**
 * Renders the filtered subject cards and empty state.
 *
 * @returns {void}
 */
function renderSubjects() {
  const grid = document.getElementById('subjects-grid');
  const emptyState = document.getElementById('empty-subjects-state');
  const countCaption = document.getElementById('subjects-count-caption');
  if (!grid || !emptyState || !countCaption) return;

  const visibleSubjects = filterSubjects(appState.subjects, filterState.query, filterState.status);
  countCaption.textContent = `Showing ${visibleSubjects.length} of ${appState.subjects.length} ${appState.subjects.length === 1 ? 'subject' : 'subjects'}`;

  grid.replaceChildren();
  if (visibleSubjects.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  const fragment = document.createDocumentFragment();
  for (const subject of visibleSubjects) {
    fragment.appendChild(buildSubjectCard(subject));
  }
  grid.appendChild(fragment);
}

/**
 * Syncs prior academic input fields (`prev-credits-input`, `prev-cgpa-input`)
 * with the current `appState`.
 *
 * @returns {void}
 */
function syncPriorInputs() {
  const prevCreditsInput = document.getElementById('prev-credits-input');
  const prevCgpaInput = document.getElementById('prev-cgpa-input');
  if (prevCreditsInput) prevCreditsInput.value = String(appState.priorCredits);
  if (prevCgpaInput) prevCgpaInput.value = String(appState.priorCgpa);
}

/**
 * Performs a full UI re-render of KPIs and subject cards.
 *
 * @returns {void}
 */
function renderAll() {
  renderKPIs();
  renderSubjects();
}

/**
 * Opens the Add/Edit Subject modal dialog and sets focus appropriately.
 *
 * @param {string | null} [subjectId=null] - Existing subject ID to edit, or `null` to add new.
 * @returns {void}
 */
function openSubjectModal(subjectId = null) {
  const backdrop = document.getElementById('subject-modal-backdrop');
  const titleEl = document.getElementById('subject-modal-title');
  const idInput = document.getElementById('subject-form-id');
  const codeInput = document.getElementById('subject-code-input');
  const nameInput = document.getElementById('subject-name-input');
  const attendedInput = document.getElementById('subject-attended-input');
  const totalInput = document.getElementById('subject-total-input');
  const creditsInput = document.getElementById('subject-credits-input');
  const gradeSelect = document.getElementById('subject-grade-select');
  const errorBox = document.getElementById('subject-form-error');

  if (!backdrop || !titleEl || !idInput || !codeInput || !nameInput || !attendedInput || !totalInput || !creditsInput || !gradeSelect || !errorBox) {
    return;
  }

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  errorBox.classList.add('hidden');
  errorBox.textContent = '';

  if (subjectId) {
    const existing = appState.subjects.find((s) => s.id === subjectId);
    if (!existing) return;
    titleEl.textContent = `Edit ${existing.courseCode}`;
    idInput.value = existing.id;
    codeInput.value = existing.courseCode;
    nameInput.value = existing.name;
    attendedInput.value = String(existing.attended);
    totalInput.value = String(existing.total);
    creditsInput.value = String(existing.credits);
    gradeSelect.value = existing.grade;
  } else {
    titleEl.textContent = 'Add Subject';
    idInput.value = '';
    codeInput.value = '';
    nameInput.value = '';
    attendedInput.value = '0';
    totalInput.value = '0';
    creditsInput.value = '4.0';
    gradeSelect.value = 'A';
  }

  backdrop.classList.remove('hidden');
  codeInput.focus();
}

/**
 * Closes the Add/Edit Subject modal and restores previous keyboard focus.
 *
 * @returns {void}
 */
function closeSubjectModal() {
  const backdrop = document.getElementById('subject-modal-backdrop');
  if (!backdrop || backdrop.classList.contains('hidden')) return;
  backdrop.classList.add('hidden');
  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

/**
 * Opens the Reset Demo Semester confirmation modal.
 *
 * @returns {void}
 */
function openResetModal() {
  const backdrop = document.getElementById('reset-modal-backdrop');
  const cancelBtn = document.getElementById('btn-cancel-reset-modal');
  if (!backdrop) return;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  backdrop.classList.remove('hidden');
  if (cancelBtn) cancelBtn.focus();
}

/**
 * Closes the Reset Demo Semester confirmation modal and restores focus.
 *
 * @returns {void}
 */
function closeResetModal() {
  const backdrop = document.getElementById('reset-modal-backdrop');
  if (!backdrop || backdrop.classList.contains('hidden')) return;
  backdrop.classList.add('hidden');
  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

/**
 * Handles Add/Edit Subject form submission with strict validation.
 *
 * @param {SubmitEvent} event - Form submit event.
 * @returns {void}
 */
function handleSubjectFormSubmit(event) {
  event.preventDefault();

  const idInput = document.getElementById('subject-form-id');
  const codeInput = document.getElementById('subject-code-input');
  const nameInput = document.getElementById('subject-name-input');
  const attendedInput = document.getElementById('subject-attended-input');
  const totalInput = document.getElementById('subject-total-input');
  const creditsInput = document.getElementById('subject-credits-input');
  const gradeSelect = document.getElementById('subject-grade-select');
  const errorBox = document.getElementById('subject-form-error');

  if (!idInput || !codeInput || !nameInput || !attendedInput || !totalInput || !creditsInput || !gradeSelect || !errorBox) {
    return;
  }

  try {
    const existingId = idInput.value.trim();
    const validated = validateSubjectInput({
      id: existingId || undefined,
      courseCode: codeInput.value,
      name: nameInput.value,
      attended: Number(attendedInput.value),
      total: Number(totalInput.value),
      credits: Number(creditsInput.value),
      grade: gradeSelect.value,
    });

    if (existingId) {
      const idx = appState.subjects.findIndex((s) => s.id === existingId);
      if (idx !== -1) {
        appState.subjects[idx] = validated;
      }
      showToast(`Updated ${validated.courseCode} (${validated.name}).`);
    } else {
      appState.subjects.unshift(validated);
      showToast(`Added ${validated.courseCode} (${validated.name}).`);
    }

    hideGlobalError();
    saveState();
    renderAll();
    closeSubjectModal();
  } catch (error) {
    errorBox.textContent = error instanceof Error ? error.message : 'Invalid subject input.';
    errorBox.classList.remove('hidden');
  }
}

/**
 * Handles clicks inside the subjects grid via event delegation.
 *
 * @param {MouseEvent} event - Click event.
 * @returns {void}
 */
function handleGridClick(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest('button[data-action]') : null;
  if (!(target instanceof HTMLButtonElement)) return;

  const card = target.closest('[data-subject-id]');
  if (!(card instanceof HTMLElement)) return;
  const subjectId = card.dataset.subjectId;
  const idx = appState.subjects.findIndex((s) => s.id === subjectId);
  if (idx === -1) return;

  const subject = appState.subjects[idx];
  const action = target.dataset.action;

  if (action === 'attend') {
    subject.attended += 1;
    subject.total += 1;
    saveState();
    renderAll();
    showToast(`Marked +1 Attended for ${subject.courseCode}.`);
  } else if (action === 'miss') {
    subject.total += 1;
    saveState();
    renderAll();
    showToast(`Marked +1 Missed for ${subject.courseCode}.`, 'info');
  } else if (action === 'edit') {
    openSubjectModal(subject.id);
  } else if (action === 'delete') {
    appState.subjects.splice(idx, 1);
    saveState();
    renderAll();
    showToast(`Removed ${subject.courseCode}.`, 'info');
  }
}

/**
 * Handles inline grade selection changes inside the subjects grid.
 *
 * @param {Event} event - Change event.
 * @returns {void}
 */
function handleGridChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || target.dataset.action !== 'grade') return;

  const card = target.closest('[data-subject-id]');
  if (!(card instanceof HTMLElement)) return;
  const subject = appState.subjects.find((s) => s.id === card.dataset.subjectId);
  if (!subject) return;

  try {
    subject.grade = validateGrade(target.value);
    hideGlobalError();
    saveState();
    renderKPIs();
    showToast(`Updated ${subject.courseCode} expected grade to ${subject.grade}.`);
  } catch (error) {
    showGlobalError(error instanceof Error ? error.message : 'Invalid grade selected.');
    target.value = subject.grade;
  }
}

/**
 * Handles debounced inline credit edits inside the subjects grid.
 *
 * @param {Event} event - Input event.
 * @returns {void}
 */
const handleGridCreditsInput = debounce((event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.action !== 'credits') return;

  const card = target.closest('[data-subject-id]');
  if (!(card instanceof HTMLElement)) return;
  const subject = appState.subjects.find((s) => s.id === card.dataset.subjectId);
  if (!subject) return;

  try {
    const parsedCredits = Number(target.value);
    subject.credits = validateCredits(parsedCredits);
    hideGlobalError();
    saveState();
    renderKPIs();
  } catch (error) {
    showGlobalError(
      `${subject.courseCode}: ${error instanceof Error ? error.message : 'Credits must be between 0.5 and 10.'}`
    );
  }
}, DEBOUNCE_DELAY_MS);

/**
 * Validates and applies updates to prior completed credits and current CGPA.
 *
 * @returns {void}
 */
const handlePriorAcademicsUpdate = debounce(() => {
  const prevCreditsInput = document.getElementById('prev-credits-input');
  const prevCgpaInput = document.getElementById('prev-cgpa-input');
  const errorEl = document.getElementById('prior-academics-error');
  if (!prevCreditsInput || !prevCgpaInput || !errorEl) return;

  try {
    const validated = validatePriorAcademics(Number(prevCreditsInput.value), Number(prevCgpaInput.value));
    appState.priorCredits = validated.prevCredits;
    appState.priorCgpa = validated.prevCgpa;
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
    saveState();
    renderKPIs();
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : 'Invalid prior academic values.';
    errorEl.classList.remove('hidden');
  }
}, DEBOUNCE_DELAY_MS);

/**
 * Exports the current validated state as a downloadable JSON backup file.
 *
 * @returns {void}
 */
function handleExportJSON() {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    priorCredits: appState.priorCredits,
    priorCgpa: appState.priorCgpa,
    subjects: appState.subjects,
  };
  const jsonText = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `tiet-academic-pulse-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Exported JSON backup.');
}

/**
 * Imports and validates a user-selected JSON backup file.
 *
 * @param {Event} event - File input change event.
 * @returns {Promise<void>}
 */
async function handleImportJSON(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.files || input.files.length === 0) {
    return;
  }

  const file = input.files[0];
  try {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new RangeError('Backup file is too large (maximum 1 MB allowed).');
    }
    const text = await file.text();
    const parsed = JSON.parse(text);
    appState = validateBackupPayload(parsed);
    hideGlobalError();
    saveState();
    syncPriorInputs();
    renderAll();
    showToast(`Imported ${appState.subjects.length} subjects from backup.`);
  } catch (error) {
    showGlobalError(`Backup import failed: ${error instanceof Error ? error.message : 'Malformed JSON file.'}`);
  } finally {
    input.value = '';
  }
}

/**
 * Resets application state to the default Thapar University demo semester.
 *
 * @returns {void}
 */
function handleConfirmReset() {
  appState = createDemoState();
  filterState.query = '';
  filterState.status = 'all';

  const searchInput = document.getElementById('search-subjects-input');
  const statusSelect = document.getElementById('status-filter-select');
  if (searchInput instanceof HTMLInputElement) searchInput.value = '';
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = 'all';

  hideGlobalError();
  saveState();
  syncPriorInputs();
  renderAll();
  closeResetModal();
  showToast('Reset to demo semester.');
}

/**
 * Wires all DOM event listeners and initializes the application.
 *
 * @returns {void}
 */
export function initApp() {
  loadState();
  syncPriorInputs();
  renderAll();

  const btnAdd = document.getElementById('btn-add-subject');
  const btnEmptyAdd = document.getElementById('btn-empty-add-subject');
  const btnExport = document.getElementById('btn-export-json');
  const importInput = document.getElementById('import-json-input');
  const btnResetDemo = document.getElementById('btn-reset-demo');
  const btnDismissError = document.getElementById('btn-dismiss-error');

  const prevCreditsInput = document.getElementById('prev-credits-input');
  const prevCgpaInput = document.getElementById('prev-cgpa-input');
  const searchInput = document.getElementById('search-subjects-input');
  const statusFilterSelect = document.getElementById('status-filter-select');
  const subjectsGrid = document.getElementById('subjects-grid');

  const subjectForm = document.getElementById('subject-form');
  const subjectBackdrop = document.getElementById('subject-modal-backdrop');
  const btnCloseSubjectModal = document.getElementById('btn-close-subject-modal');
  const btnCancelSubjectModal = document.getElementById('btn-cancel-subject-modal');

  const resetBackdrop = document.getElementById('reset-modal-backdrop');
  const btnCloseResetModal = document.getElementById('btn-close-reset-modal');
  const btnCancelResetModal = document.getElementById('btn-cancel-reset-modal');
  const btnConfirmReset = document.getElementById('btn-confirm-reset');

  btnAdd?.addEventListener('click', () => openSubjectModal(null));
  btnEmptyAdd?.addEventListener('click', () => openSubjectModal(null));
  btnExport?.addEventListener('click', handleExportJSON);
  importInput?.addEventListener('change', handleImportJSON);
  btnResetDemo?.addEventListener('click', openResetModal);
  btnDismissError?.addEventListener('click', hideGlobalError);

  prevCreditsInput?.addEventListener('input', handlePriorAcademicsUpdate);
  prevCgpaInput?.addEventListener('input', handlePriorAcademicsUpdate);

  const handleSearchInput = debounce((event) => {
    if (event.target instanceof HTMLInputElement) {
      filterState.query = event.target.value;
      renderSubjects();
    }
  }, DEBOUNCE_DELAY_MS);
  searchInput?.addEventListener('input', handleSearchInput);

  statusFilterSelect?.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement) {
      filterState.status = event.target.value;
      renderSubjects();
    }
  });

  subjectsGrid?.addEventListener('click', handleGridClick);
  subjectsGrid?.addEventListener('change', handleGridChange);
  subjectsGrid?.addEventListener('input', handleGridCreditsInput);

  subjectForm?.addEventListener('submit', handleSubjectFormSubmit);
  btnCloseSubjectModal?.addEventListener('click', closeSubjectModal);
  btnCancelSubjectModal?.addEventListener('click', closeSubjectModal);
  subjectBackdrop?.addEventListener('click', (event) => {
    if (event.target === subjectBackdrop) closeSubjectModal();
  });

  btnCloseResetModal?.addEventListener('click', closeResetModal);
  btnCancelResetModal?.addEventListener('click', closeResetModal);
  btnConfirmReset?.addEventListener('click', handleConfirmReset);
  resetBackdrop?.addEventListener('click', (event) => {
    if (event.target === resetBackdrop) closeResetModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSubjectModal();
      closeResetModal();
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}

