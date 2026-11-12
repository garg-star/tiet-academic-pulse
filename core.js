/**
 * @fileoverview Pure domain calculations, validation, sanitization, and formatting
 * helpers for TIET AcademicPulse. Contains zero DOM or browser storage dependencies.
 */

/**
 * Current persisted state schema version.
 * @type {number}
 */
export const SCHEMA_VERSION = 1;

/**
 * LocalStorage persistence key.
 * @type {string}
 */
export const STORAGE_KEY = 'tiet_academic_pulse_v1';

/**
 * Minimum attendance ratio mandated by Thapar University (75%).
 * @type {number}
 */
export const ATTENDANCE_TARGET_RATIO = 0.75;

/**
 * Standard Thapar Institute of Engineering & Technology (TIET) grade-to-point map.
 * @type {Readonly<Record<string, number>>}
 */
export const GRADE_POINTS = Object.freeze({
  'A+': 10,
  A: 10,
  'A-': 9,
  B: 8,
  'B-': 7,
  C: 6,
  'C-': 5,
  E: 2,
  F: 0,
});

/**
 * Ordered list of valid TIET letter grades.
 * @type {readonly string[]}
 */
export const VALID_GRADES = Object.freeze(Object.keys(GRADE_POINTS));

/**
 * Escapes HTML special characters in user-supplied strings to prevent XSS.
 *
 * @param {unknown} value - Input value to sanitize into an HTML-safe string.
 * @returns {string} Escaped string safe for HTML contexts.
 */
export function escapeHTML(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  };
  return str.replace(/[&<>"'/]/g, (char) => entityMap[char]);
}

/**
 * Formats a numeric percentage with fixed decimal precision.
 *
 * @param {number} value - Percentage value between 0 and 100.
 * @param {number} [decimals=1] - Number of decimal places.
 * @returns {string} Formatted percentage string with `%` suffix.
 * @throws {TypeError} If `value` is not a finite number.
 */
export function formatPercentage(value, decimals = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Percentage must be a finite number.');
  }
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formats an SGPA or CGPA value to fixed decimal precision.
 *
 * @param {number} value - GPA value between 0 and 10.
 * @param {number} [decimals=2] - Number of decimal places.
 * @returns {string} Formatted GPA string.
 * @throws {TypeError} If `value` is not a finite number.
 */
export function formatGPA(value, decimals = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('GPA value must be a finite number.');
  }
  return value.toFixed(decimals);
}

/**
 * Validates attended and total conducted class counts.
 *
 * @param {number} attended - Number of classes attended.
 * @param {number} total - Total number of classes conducted.
 * @returns {{ attended: number, total: number }} Validated integer counts.
 * @throws {TypeError} If either value is not a finite integer.
 * @throws {RangeError} If counts are negative or attended exceeds total.
 */
export function validateAttendanceInput(attended, total) {
  if (typeof attended !== 'number' || !Number.isFinite(attended) || !Number.isInteger(attended)) {
    throw new TypeError('Attended classes must be a whole number.');
  }
  if (typeof total !== 'number' || !Number.isFinite(total) || !Number.isInteger(total)) {
    throw new TypeError('Total conducted classes must be a whole number.');
  }
  if (attended < 0 || total < 0) {
    throw new RangeError('Class counts cannot be negative.');
  }
  if (attended > total) {
    throw new RangeError('Attended classes cannot exceed total conducted classes.');
  }
  return { attended, total };
}

/**
 * Validates a TIET course credit value.
 *
 * @param {number} credits - Course credit weight.
 * @returns {number} Validated credit value.
 * @throws {TypeError} If credits is not a finite number.
 * @throws {RangeError} If credits is outside `(0, 10]`.
 */
export function validateCredits(credits) {
  if (typeof credits !== 'number' || !Number.isFinite(credits)) {
    throw new TypeError('Credits must be a valid number.');
  }
  if (credits <= 0 || credits > 10) {
    throw new RangeError('Credits must be greater than 0 and at most 10.');
  }
  return credits;
}

/**
 * Validates a TIET letter grade against the official grade scale.
 *
 * @param {string} grade - Letter grade (e.g., `A+`, `A-`, `B`).
 * @returns {string} Validated letter grade.
 * @throws {TypeError} If grade is not a string.
 * @throws {RangeError} If grade is not part of the TIET grading scale.
 */
export function validateGrade(grade) {
  if (typeof grade !== 'string') {
    throw new TypeError('Grade must be a string.');
  }
  const normalized = grade.trim().toUpperCase();
  if (!Object.hasOwn(GRADE_POINTS, normalized)) {
    throw new RangeError(`Unsupported TIET grade "${grade}". Expected one of: ${VALID_GRADES.join(', ')}.`);
  }
  return normalized;
}

/**
 * Validates prior completed credits and existing CGPA.
 *
 * @param {number} prevCredits - Credits completed prior to the current semester.
 * @param {number} prevCgpa - Current cumulative GPA prior to this semester.
 * @returns {{ prevCredits: number, prevCgpa: number }} Validated prior academic metrics.
 * @throws {TypeError} If either value is not a finite number.
 * @throws {RangeError} If `prevCredits < 0` or `prevCgpa` is outside `[0, 10]`.
 */
export function validatePriorAcademics(prevCredits, prevCgpa) {
  if (typeof prevCredits !== 'number' || !Number.isFinite(prevCredits)) {
    throw new TypeError('Previous completed credits must be a valid number.');
  }
  if (typeof prevCgpa !== 'number' || !Number.isFinite(prevCgpa)) {
    throw new TypeError('Current CGPA must be a valid number.');
  }
  if (prevCredits < 0) {
    throw new RangeError('Previous completed credits cannot be negative.');
  }
  if (prevCgpa < 0 || prevCgpa > 10) {
    throw new RangeError('Current CGPA must be between 0.00 and 10.00.');
  }
  return { prevCredits, prevCgpa };
}

/**
 * Validates and normalizes a subject record.
 *
 * @param {Object} input - Raw subject fields.
 * @param {string} [input.id] - Optional unique identifier.
 * @param {string} input.courseCode - Thapar course code (e.g., `UTA018`).
 * @param {string} input.name - Subject title.
 * @param {number} input.attended - Attended classes count.
 * @param {number} input.total - Total conducted classes count.
 * @param {number} input.credits - Course credit weight.
 * @param {string} input.grade - Expected or achieved TIET letter grade.
 * @returns {{
 *   id: string,
 *   courseCode: string,
 *   name: string,
 *   attended: number,
 *   total: number,
 *   credits: number,
 *   grade: string
 * }} Normalized subject object.
 * @throws {TypeError|RangeError} If any field fails validation.
 */
export function validateSubjectInput(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Subject payload must be an object.');
  }

  const courseCode = typeof input.courseCode === 'string' ? input.courseCode.trim().toUpperCase() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (!courseCode) {
    throw new RangeError('Course code is required (e.g., UTA018).');
  }
  if (courseCode.length > 20) {
    throw new RangeError('Course code must be 20 characters or fewer.');
  }
  if (!name) {
    throw new RangeError('Subject name is required.');
  }
  if (name.length > 100) {
    throw new RangeError('Subject name must be 100 characters or fewer.');
  }

  const { attended, total } = validateAttendanceInput(input.attended, input.total);
  const credits = validateCredits(input.credits);
  const grade = validateGrade(input.grade);
  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim().slice(0, 64)
      : `${courseCode.toLowerCase()}-${Date.now()}`;

  return {
    id,
    courseCode,
    name,
    attended,
    total,
    credits,
    grade,
  };
}

/**
 * Computes attendance percentage, status classification, exact safe bunks available,
 * and exact consecutive classes needed to reach the 75% threshold.
 *
 * Uses integer cross-multiplication (`attended * 100 >= total * 75`) for exact boundary checks,
 * avoiding floating-point precision drift.
 *
 * @param {number} attended - Number of classes attended.
 * @param {number} total - Total number of classes conducted.
 * @returns {{
 *   percentage: number,
 *   status: 'Safe' | 'Borderline' | 'Detention Risk' | 'No Classes',
 *   statusKey: 'safe' | 'borderline' | 'risk' | 'neutral',
 *   safeBunks: number,
 *   recoveryClasses: number,
 *   meetsRequirement: boolean
 * }} Computed attendance metrics.
 * @throws {TypeError|RangeError} If inputs are invalid.
 */
export function calculateAttendanceMetrics(attended, total) {
  validateAttendanceInput(attended, total);

  if (total === 0) {
    return {
      percentage: 0,
      status: 'No Classes',
      statusKey: 'neutral',
      safeBunks: 0,
      recoveryClasses: 0,
      meetsRequirement: true,
    };
  }

  const percentage = (attended / total) * 100;
  const meetsRequirement = attended * 100 >= total * 75;
  const isSafe = attended * 100 >= total * 80;

  if (meetsRequirement) {
    const safeBunks = Math.max(0, Math.floor((attended - 0.75 * total) / 0.75));
    return {
      percentage,
      status: isSafe ? 'Safe' : 'Borderline',
      statusKey: isSafe ? 'safe' : 'borderline',
      safeBunks,
      recoveryClasses: 0,
      meetsRequirement: true,
    };
  }

  const recoveryClasses = Math.ceil((0.75 * total - attended) / 0.25);
  return {
    percentage,
    status: 'Detention Risk',
    statusKey: 'risk',
    safeBunks: 0,
    recoveryClasses,
    meetsRequirement: false,
  };
}

/**
 * Aggregates attendance KPIs across all subjects in a single `O(n)` pass.
 *
 * @param {Array<{ attended: number, total: number }>} subjects - List of tracked subjects.
 * @returns {{
 *   subjectCount: number,
 *   totalAttended: number,
 *   totalConducted: number,
 *   overallPercentage: number,
 *   safeCount: number,
 *   borderlineCount: number,
 *   riskCount: number,
 *   noClassesCount: number
 * }} Aggregated semester attendance summary.
 * @throws {TypeError} If `subjects` is not an array.
 */
export function summarizeAttendance(subjects) {
  if (!Array.isArray(subjects)) {
    throw new TypeError('Subjects must be provided as an array.');
  }

  const summary = subjects.reduce(
    (acc, subject) => {
      const metrics = calculateAttendanceMetrics(subject.attended, subject.total);
      acc.subjectCount += 1;
      acc.totalAttended += subject.attended;
      acc.totalConducted += subject.total;
      if (metrics.statusKey === 'safe') acc.safeCount += 1;
      else if (metrics.statusKey === 'borderline') acc.borderlineCount += 1;
      else if (metrics.statusKey === 'risk') acc.riskCount += 1;
      else acc.noClassesCount += 1;
      return acc;
    },
    {
      subjectCount: 0,
      totalAttended: 0,
      totalConducted: 0,
      overallPercentage: 0,
      safeCount: 0,
      borderlineCount: 0,
      riskCount: 0,
      noClassesCount: 0,
    }
  );

  summary.overallPercentage =
    summary.totalConducted > 0 ? (summary.totalAttended / summary.totalConducted) * 100 : 0;

  return summary;
}

/**
 * Calculates credit-weighted Semester GPA (SGPA) in a single `O(n)` pass.
 *
 * @param {Array<{ credits: number, grade: string }>} subjects - List of semester subjects.
 * @returns {{
 *   sgpa: number,
 *   totalCredits: number,
 *   totalWeightedPoints: number
 * }} Computed semester GPA metrics.
 * @throws {TypeError|RangeError} If `subjects` is not an array or contains invalid credits/grades.
 */
export function calculateSGPA(subjects) {
  if (!Array.isArray(subjects)) {
    throw new TypeError('Subjects must be provided as an array.');
  }

  const totals = subjects.reduce(
    (acc, subject) => {
      const credits = validateCredits(subject.credits);
      const grade = validateGrade(subject.grade);
      const points = GRADE_POINTS[grade];
      acc.totalCredits += credits;
      acc.totalWeightedPoints += credits * points;
      return acc;
    },
    { totalCredits: 0, totalWeightedPoints: 0 }
  );

  return {
    sgpa: totals.totalCredits > 0 ? totals.totalWeightedPoints / totals.totalCredits : 0,
    totalCredits: totals.totalCredits,
    totalWeightedPoints: totals.totalWeightedPoints,
  };
}

/**
 * Projects cumulative CGPA by combining prior completed credits/CGPA with
 * the current semester's credit-weighted performance.
 *
 * @param {Array<{ credits: number, grade: string }>} subjects - Current semester subjects.
 * @param {number} prevCredits - Completed credits prior to this semester.
 * @param {number} prevCgpa - Cumulative GPA prior to this semester.
 * @returns {{
 *   sgpa: number,
 *   semesterCredits: number,
 *   semesterPoints: number,
 *   projectedCgpa: number,
 *   combinedCredits: number
 * }} Projected SGPA and CGPA metrics.
 * @throws {TypeError|RangeError} If inputs fail validation.
 */
export function calculateProjectedCGPA(subjects, prevCredits, prevCgpa) {
  const prior = validatePriorAcademics(prevCredits, prevCgpa);
  const semester = calculateSGPA(subjects);

  const combinedCredits = prior.prevCredits + semester.totalCredits;
  const totalPoints = prior.prevCredits * prior.prevCgpa + semester.totalWeightedPoints;
  const projectedCgpa = combinedCredits > 0 ? totalPoints / combinedCredits : 0;

  return {
    sgpa: semester.sgpa,
    semesterCredits: semester.totalCredits,
    semesterPoints: semester.totalWeightedPoints,
    projectedCgpa,
    combinedCredits,
  };
}

/**
 * Filters subjects by search query (course code or name) and attendance status category.
 *
 * @param {Array<{ courseCode: string, name: string, attended: number, total: number }>} subjects - Source subjects.
 * @param {string} [query=''] - Search filter text.
 * @param {'all' | 'safe' | 'borderline' | 'risk' | 'neutral'} [statusFilter='all'] - Attendance status filter.
 * @returns {Array<Object>} Matching subjects.
 */
export function filterSubjects(subjects, query = '', statusFilter = 'all') {
  if (!Array.isArray(subjects)) {
    return [];
  }
  const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';
  const normalizedStatus = typeof statusFilter === 'string' ? statusFilter : 'all';

  return subjects.filter((subject) => {
    if (normalizedQuery) {
      const codeMatch = subject.courseCode.toLowerCase().includes(normalizedQuery);
      const nameMatch = subject.name.toLowerCase().includes(normalizedQuery);
      if (!codeMatch && !nameMatch) {
        return false;
      }
    }
    if (normalizedStatus !== 'all') {
      const { statusKey } = calculateAttendanceMetrics(subject.attended, subject.total);
      if (statusKey !== normalizedStatus) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Creates a fresh default demo semester tailored to Thapar University students.
 *
 * @returns {{
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
 * }} Default state object.
 */
export function createDemoState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    priorCredits: 42,
    priorCgpa: 8.45,
    subjects: [
      {
        id: 'demo-uta018',
        courseCode: 'UTA018',
        name: 'Object Oriented Programming',
        attended: 26,
        total: 30,
        credits: 4.0,
        grade: 'A',
      },
      {
        id: 'demo-uma023',
        courseCode: 'UMA023',
        name: 'Differential Equations & Linear Algebra',
        attended: 22,
        total: 28,
        credits: 3.5,
        grade: 'A-',
      },
      {
        id: 'demo-ucs406',
        courseCode: 'UCS406',
        name: 'Data Structures & Algorithms',
        attended: 17,
        total: 25,
        credits: 4.5,
        grade: 'B',
      },
      {
        id: 'demo-uec301',
        courseCode: 'UEC301',
        name: 'Analog Electronic Circuits',
        attended: 18,
        total: 24,
        credits: 4.0,
        grade: 'B-',
      },
      {
        id: 'demo-uhu003',
        courseCode: 'UHU003',
        name: 'Professional Communication',
        attended: 15,
        total: 16,
        credits: 2.0,
        grade: 'A+',
      },
    ],
  };
}

/**
 * Validates and normalizes an imported or stored application state payload.
 *
 * @param {unknown} payload - Parsed JSON object from storage or backup file.
 * @returns {{
 *   schemaVersion: number,
 *   priorCredits: number,
 *   priorCgpa: number,
 *   subjects: Array<Object>
 * }} Sanitized and validated state object.
 * @throws {TypeError|RangeError} If payload structure or any field is invalid.
 */
export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Backup file must contain a valid JSON object.');
  }

  if (payload.schemaVersion !== undefined && payload.schemaVersion !== SCHEMA_VERSION) {
    throw new RangeError(`Unsupported schema version "${payload.schemaVersion}". Expected version ${SCHEMA_VERSION}.`);
  }

  const prior = validatePriorAcademics(
    Number(payload.priorCredits ?? 0),
    Number(payload.priorCgpa ?? 0)
  );

  if (!Array.isArray(payload.subjects)) {
    throw new TypeError('Backup file must include a "subjects" array.');
  }

  if (payload.subjects.length > 50) {
    throw new RangeError('Backup file exceeds the maximum limit of 50 subjects.');
  }

  const seenIds = new Set();
  const subjects = payload.subjects.map((raw, index) => {
    const clean = validateSubjectInput({
      id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id : `imported-${index}-${Date.now()}`,
      courseCode: raw?.courseCode,
      name: raw?.name,
      attended: Number(raw?.attended),
      total: Number(raw?.total),
      credits: Number(raw?.credits),
      grade: raw?.grade,
    });
    if (seenIds.has(clean.id)) {
      clean.id = `${clean.id}-${index}`;
    }
    seenIds.add(clean.id);
    return clean;
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    priorCredits: prior.prevCredits,
    priorCgpa: prior.prevCgpa,
    subjects,
  };
}

