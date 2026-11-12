/**
 * @fileoverview Unit test suite for js/core.js using Node's native test runner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADE_POINTS,
  SCHEMA_VERSION,
  calculateAttendanceMetrics,
  calculateProjectedCGPA,
  calculateSGPA,
  createDemoState,
  escapeHTML,
  filterSubjects,
  formatGPA,
  formatPercentage,
  summarizeAttendance,
  validateAttendanceInput,
  validateBackupPayload,
  validateCredits,
  validateGrade,
  validatePriorAcademics,
  validateSubjectInput,
} from '../js/core.js';

describe('75% Attendance Safe-Bunk & Recovery Engine', () => {
  it('computes 0 safe bunks and Borderline status at exactly 75%', () => {
    const res = calculateAttendanceMetrics(15, 20);
    assert.equal(res.percentage, 75);
    assert.equal(res.status, 'Borderline');
    assert.equal(res.statusKey, 'borderline');
    assert.equal(res.safeBunks, 0);
    assert.equal(res.recoveryClasses, 0);
    assert.equal(res.meetsRequirement, true);
  });

  it('computes exact safe bunks and Safe status at 85%', () => {
    const res = calculateAttendanceMetrics(17, 20);
    assert.equal(res.percentage, 85);
    assert.equal(res.status, 'Safe');
    assert.equal(res.statusKey, 'safe');
    // Math.floor((17 - 0.75 * 20) / 0.75) = Math.floor(2 / 0.75) = 2
    assert.equal(res.safeBunks, 2);
    assert.equal(res.recoveryClasses, 0);
    assert.equal(res.meetsRequirement, true);
  });

  it('computes exact safe bunks and Safe status at 100%', () => {
    const res = calculateAttendanceMetrics(20, 20);
    assert.equal(res.percentage, 100);
    assert.equal(res.status, 'Safe');
    // Math.floor((20 - 15) / 0.75) = 6 (20 / 26 = 76.9%, 20 / 27 = 74.1%)
    assert.equal(res.safeBunks, 6);
    assert.equal(res.recoveryClasses, 0);
  });

  it('classifies 79.9% as Borderline and 80.0% as Safe', () => {
    const borderline = calculateAttendanceMetrics(799, 1000);
    assert.equal(borderline.status, 'Borderline');
    assert.equal(borderline.statusKey, 'borderline');

    const safe = calculateAttendanceMetrics(800, 1000);
    assert.equal(safe.status, 'Safe');
    assert.equal(safe.statusKey, 'safe');
  });

  it('computes exact recovery classes at 60% attendance', () => {
    const res = calculateAttendanceMetrics(12, 20);
    assert.equal(res.percentage, 60);
    assert.equal(res.status, 'Detention Risk');
    assert.equal(res.statusKey, 'risk');
    assert.equal(res.safeBunks, 0);
    // Math.ceil((0.75 * 20 - 12) / 0.25) = Math.ceil(3 / 0.25) = 12 (24 / 32 = 75%)
    assert.equal(res.recoveryClasses, 12);
    assert.equal(res.meetsRequirement, false);
  });

  it('computes exact recovery classes at 74% attendance', () => {
    const res = calculateAttendanceMetrics(37, 50);
    assert.equal(res.percentage, 74);
    assert.equal(res.status, 'Detention Risk');
    // Math.ceil((37.5 - 37) / 0.25) = 2 (39 / 52 = 75%)
    assert.equal(res.recoveryClasses, 2);
  });

  it('computes exact recovery classes at 0% attendance', () => {
    const res = calculateAttendanceMetrics(0, 10);
    assert.equal(res.percentage, 0);
    assert.equal(res.status, 'Detention Risk');
    // Math.ceil((7.5 - 0) / 0.25) = 30 (30 / 40 = 75%)
    assert.equal(res.recoveryClasses, 30);
  });

  it('handles total === 0 edge case gracefully without NaN', () => {
    const res = calculateAttendanceMetrics(0, 0);
    assert.equal(res.percentage, 0);
    assert.equal(res.status, 'No Classes');
    assert.equal(res.statusKey, 'neutral');
    assert.equal(res.safeBunks, 0);
    assert.equal(res.recoveryClasses, 0);
  });

  it('rejects attended > total and negative class counts', () => {
    assert.throws(() => calculateAttendanceMetrics(11, 10), RangeError);
    assert.throws(() => validateAttendanceInput(-1, 10), RangeError);
    assert.throws(() => validateAttendanceInput(0, -5), RangeError);
    assert.throws(() => validateAttendanceInput(2.5, 10), TypeError);
    assert.throws(() => validateAttendanceInput(Number.NaN, 10), TypeError);
  });
});

describe('TIET Credit-Weighted SGPA & CGPA Forecaster', () => {
  it('supports official Thapar grade point scale from A+ through F', () => {
    assert.equal(GRADE_POINTS['A+'], 10);
    assert.equal(GRADE_POINTS.A, 10);
    assert.equal(GRADE_POINTS['A-'], 9);
    assert.equal(GRADE_POINTS.B, 8);
    assert.equal(GRADE_POINTS['B-'], 7);
    assert.equal(GRADE_POINTS.C, 6);
    assert.equal(GRADE_POINTS['C-'], 5);
    assert.equal(GRADE_POINTS.E, 2);
    assert.equal(GRADE_POINTS.F, 0);
  });

  it('calculates credit-weighted SGPA accurately across mixed credits and grades', () => {
    const subjects = [
      { credits: 4.5, grade: 'A+' }, // 45.0
      { credits: 4.0, grade: 'A-' }, // 36.0
      { credits: 3.5, grade: 'B' },  // 28.0
      { credits: 3.0, grade: 'B-' }, // 21.0
      { credits: 2.0, grade: 'C' },  // 12.0
      { credits: 1.5, grade: 'C-' }, // 7.5
      { credits: 1.0, grade: 'E' },  // 2.0
      { credits: 1.0, grade: 'F' },  // 0.0
    ];
    // Total credits = 20.5, total points = 151.5
    const result = calculateSGPA(subjects);
    assert.equal(result.totalCredits, 20.5);
    assert.equal(result.totalWeightedPoints, 151.5);
    assert.ok(Math.abs(result.sgpa - 151.5 / 20.5) < 1e-9);
  });

  it('returns 0 SGPA when semester has no subjects', () => {
    const result = calculateSGPA([]);
    assert.equal(result.sgpa, 0);
    assert.equal(result.totalCredits, 0);
  });

  it('projects cumulative CGPA accurately when combined with prior credits', () => {
    const subjects = [
      { credits: 4.0, grade: 'A' },  // 40
      { credits: 4.0, grade: 'B' },  // 32 -> semCredits=8, semPoints=72, SGPA=9.00
    ];
    // Prior: 40 credits @ 8.00 = 320 points -> combined = 392 / 48 = 8.166666...
    const projection = calculateProjectedCGPA(subjects, 40, 8.0);
    assert.equal(projection.sgpa, 9);
    assert.equal(projection.semesterCredits, 8);
    assert.equal(projection.combinedCredits, 48);
    assert.ok(Math.abs(projection.projectedCgpa - 392 / 48) < 1e-9);
  });

  it('handles zero prior credits cleanly when projecting first-semester CGPA', () => {
    const subjects = [{ credits: 4.0, grade: 'A-' }];
    const projection = calculateProjectedCGPA(subjects, 0, 0);
    assert.equal(projection.sgpa, 9);
    assert.equal(projection.projectedCgpa, 9);
  });

  it('rejects out-of-range credits, grades, and prior CGPA values', () => {
    assert.throws(() => validateCredits(0), RangeError);
    assert.throws(() => validateCredits(10.5), RangeError);
    assert.throws(() => validateGrade('D'), RangeError);
    assert.throws(() => validatePriorAcademics(-5, 8.0), RangeError);
    assert.throws(() => validatePriorAcademics(20, 10.1), RangeError);
    assert.throws(() => validatePriorAcademics(20, -0.1), RangeError);
  });
});

describe('Security Sanitization, Validation & Summary Helpers', () => {
  it('escapeHTML neutralizes script tags, angle brackets, quotes, and ampersands', () => {
    const payload = `<script>alert("XSS" & 'test')</script>`;
    const escaped = escapeHTML(payload);
    assert.equal(
      escaped,
      '&lt;script&gt;alert(&quot;XSS&quot; &amp; &#39;test&#39;)&lt;&#x2F;script&gt;'
    );
    assert.equal(escapeHTML(null), '');
    assert.equal(escapeHTML(undefined), '');
  });

  it('summarizes semester attendance across multiple subjects in a single pass', () => {
    const summary = summarizeAttendance([
      { attended: 18, total: 20 }, // 90% safe
      { attended: 15, total: 20 }, // 75% borderline
      { attended: 10, total: 20 }, // 50% risk
      { attended: 0, total: 0 },   // neutral
    ]);
    assert.equal(summary.subjectCount, 4);
    assert.equal(summary.totalAttended, 43);
    assert.equal(summary.totalConducted, 60);
    assert.ok(Math.abs(summary.overallPercentage - (43 / 60) * 100) < 1e-9);
    assert.equal(summary.safeCount, 1);
    assert.equal(summary.borderlineCount, 1);
    assert.equal(summary.riskCount, 1);
    assert.equal(summary.noClassesCount, 1);
  });

  it('filters subjects by course code, name, and attendance status', () => {
    const demo = createDemoState();
    const byCode = filterSubjects(demo.subjects, 'uta018', 'all');
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].courseCode, 'UTA018');

    const atRisk = filterSubjects(demo.subjects, '', 'risk');
    assert.equal(atRisk.length, 1);
    assert.equal(atRisk[0].courseCode, 'UCS406');
  });

  it('validates and normalizes subject input and backup payloads', () => {
    const normalized = validateSubjectInput({
      courseCode: '  uta018 ',
      name: '  Object Oriented Programming  ',
      attended: 10,
      total: 12,
      credits: 4,
      grade: 'a-',
    });
    assert.equal(normalized.courseCode, 'UTA018');
    assert.equal(normalized.name, 'Object Oriented Programming');
    assert.equal(normalized.grade, 'A-');

    const demo = createDemoState();
    const validatedBackup = validateBackupPayload(demo);
    assert.equal(validatedBackup.schemaVersion, SCHEMA_VERSION);
    assert.equal(validatedBackup.subjects.length, demo.subjects.length);

    assert.throws(() => validateBackupPayload({ schemaVersion: 99, subjects: [] }), RangeError);
    assert.throws(() => validateBackupPayload(null), TypeError);
  });

  it('formats percentages and GPAs cleanly', () => {
    assert.equal(formatPercentage(75), '75.0%');
    assert.equal(formatGPA(8.5), '8.50');
    assert.throws(() => formatGPA(Number.POSITIVE_INFINITY), TypeError);
  });
});

