# TIET AcademicPulse

A 100% client-side academic companion built for **Thapar Institute of Engineering & Technology (TIET)** students to track subject-wise **75% attendance margins** (exact safe bunks vs. consecutive recovery classes needed) and forecast **credit-weighted SGPA & cumulative CGPA**.

---

## Features

- **75% Attendance Safe-Bunk Engine**
  - Track courses with Course Code (e.g., `UTA018`, `UMA023`, `UCS406`), Subject Name, Attended Classes, and Total Conducted Classes.
  - Live status classification:
    - **Safe**: $\ge 80\%$
    - **Borderline**: $75\% – 79.9\%$
    - **Detention Risk**: $< 75\%$
  - One-click **`+1 Attended`** and **`+1 Missed`** stepper buttons on every subject card.
  - Visual progress bar with a 75% minimum threshold marker.
- **TIET Credit-Weighted SGPA & CGPA Forecaster**
  - Supports the official Thapar grade scale (`A+` through `F`) and flexible credit weights (e.g., `4.5`, `4.0`, `3.5`, `3.0`, `2.0`).
  - Live **Projected SGPA** and **Projected Cumulative CGPA** combined with your previously completed credits and current CGPA.
- **Data Portability & Persistence**
  - Automatic persistence in `localStorage` under schema-versioned key `tiet_academic_pulse_v1`.
  - **Export Backup JSON** for offline backups and cross-device portability.
  - **Import JSON** with strict schema and bounds validation.
  - **Reset Demo Semester** with an accessible confirmation modal.

---

## Mathematical Formulas

### 1. Attendance Percentage & Boundary Check
Given `attended` ($A$) and `total` ($T$):

$$\text{Percentage} = \begin{cases} 0\% & \text{if } T = 0 \\ \left(\frac{A}{T}\right) \times 100 & \text{if } T > 0 \end{cases}$$

To avoid floating-point drift at exact boundaries, threshold checks use integer cross-multiplication:
- Meets 75% requirement: $100 \cdot A \ge 75 \cdot T$
- Safe ($\ge 80\%$): $100 \cdot A \ge 80 \cdot T$

### 2. Safe Bunks Available (when Attendance $\ge 75\%$)
Maximum consecutive future classes that can be missed without dropping below $75\%$:

$$\text{Safe Bunks} = \left\lfloor \frac{A - 0.75 \cdot T}{0.75} \right\rfloor$$

### 3. Consecutive Recovery Classes Needed (when Attendance $< 75\%$)
Minimum consecutive future classes that must be attended to reach $75\%$:

$$\text{Recovery Classes} = \left\lceil \frac{0.75 \cdot T - A}{0.25} \right\rceil$$

### 4. TIET Grade Points & Credit-Weighted SGPA / CGPA

| Grade | A+ | A | A- | B | B- | C | C- | E | F |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Grade Point** | 10 | 10 | 9 | 8 | 7 | 6 | 5 | 2 | 0 |

$$\text{SGPA} = \frac{\sum_{i=1}^{n} (c_i \times g_i)}{\sum_{i=1}^{n} c_i}$$

$$\text{Projected CGPA} = \frac{(C_{\text{prev}} \times \text{CGPA}_{\text{prev}}) + \sum_{i=1}^{n} (c_i \times g_i)}{C_{\text{prev}} + \sum_{i=1}^{n} c_i}$$

---

## Architecture & Project Structure

```text
tiet-academic-pulse/
├── index.html          # Semantic light-theme UI (Tailwind CSS CDN + Inter font + strict CSP)
├── js/
│   ├── core.js         # Pure ES module: math, validation, sanitization, formatting (0 DOM deps)
│   └── app.js          # ES module: DOM rendering, 200ms debounced inputs, localStorage, JSON I/O
├── tests/
│   └── core.test.js    # Automated unit test suite using Node's native node:test & node:assert/strict
├── package.json        # ESM configuration ("type": "module") and npm test script
├── README.md           # Project documentation
└── .gitignore          # Standard macOS, Node, and coverage ignores
```

- **Decoupled Core (`js/core.js`)**: All domain calculations, validation, and sanitization live in pure functions with zero DOM or browser API dependencies, enabling fast headless verification in Node.js.
- **Single-Pass Efficiency**: `summarizeAttendance()` and `calculateSGPA()` compute totals in single $O(n)$ array reductions, while search, prior-record, and inline credit inputs are debounced by `200ms`.

---

## Security Model

1. **Strict Content Security Policy (CSP)**: Declared via `<meta http-equiv="Content-Security-Policy" ...>` in `index.html`:
   - `script-src 'self' https://cdn.tailwindcss.com` (disallows inline `<script>` tags and `eval`).
   - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
   - Zero inline `onclick` attributes; all listeners are bound via `addEventListener`.
2. **XSS Prevention**:
   - `escapeHTML(str)` in `js/core.js` escapes `&`, `<`, `>`, `"`, `'`, and `/`.
   - All user-entered strings (course codes, subject names) are rendered safely via DOM `.textContent` instead of raw `innerHTML`.
3. **Strict Input & Backup Validation**:
   - Non-negative integer checks for class counts (`attended <= total`).
   - Course credits constrained to `(0, 10]`; CGPA constrained to `[0, 10]`.
   - Imported JSON backups are size-capped (1 MB), schema-version checked (`schemaVersion === 1`), and validated field-by-field before updating state.
4. **100% Client-Side Privacy**: No backend servers, cookies, or analytics trackers. Academic records stay on your device.

---

## Accessibility Compliance (WCAG 2.1 AA)

- Explicit `<html lang="en">` and semantic landmarks (`<header>`, `<main>`, `<section>`, `<footer>`), plus a keyboard skip link.
- Every `<input>` and `<select>` (including dynamically rendered card controls) is paired with an explicit `<label for="...">`.
- Descriptive `aria-label` attributes on action and stepper buttons (`+1 Attended`, `+1 Missed`, `Edit`, `Delete Subject`).
- `aria-live="polite"` on summary KPI cards and status toast notifications.
- Full modal keyboard support: `Escape` key dismissal, `role="dialog"`, `aria-modal="true"`, focus initialization, and focus restoration on close.
- High-contrast light palette and visible `:focus-visible` outlines.

---

## Running Locally & Testing

### Prerequisites
- Node.js v18+ (tested with Node v22) for running the unit test suite.
- Any static file server (or modern browser) to run `index.html`.

### Run Automated Tests
```bash
npm test
```
This runs `node --test` against `tests/core.test.js` covering safe-bunk math, recovery classes, boundary conditions, SGPA/CGPA projections, input validation, and HTML escaping.

### Serve Locally
Because `index.html` loads ES modules (`<script type="module" src="js/app.js">`), serve the directory over HTTP rather than `file://`:
```bash
npx serve .
# or using Python:
python3 -m http.server 8080
```
Then open `http://localhost:8080` in your browser.

