'use strict';
// =============================================================================
// tests/unit/validation-audit/findings.js
//
// Feature 020 — Validation Audit Harness (T012)
// Spec: specs/020-validation-audit/tasks.md T012
// Contract: specs/020-validation-audit/contracts/validation-audit-harness.contract.md
// Data model: specs/020-validation-audit/data-model.md § Finding
//
// Exports:
//   createFinding(invariant, persona, observed, expected, notes?) → Finding
//   writeFindingsJson(findings, filePath)   → void  (writes audit-report.json)
//   writeFindingsMarkdown(findings, filePath) → void  (writes audit-report.md table)
//
// CommonJS (Constitution Principle V — file:// compatible, no ES module syntax).
// =============================================================================

const fs = require('fs');
const path = require('path');

/**
 * Finding shape (matches data-model.md §Finding):
 * {
 *   invariantId:          string
 *   invariantDescription: string
 *   invariantSeverity:    'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
 *   invariantFamily:      string
 *   personaId:            string
 *   observed:             any
 *   expected:             any
 *   severity:             'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'   // mirrors invariantSeverity
 *   status:               'OPEN' | 'FIXED' | 'DEFERRED' | 'WONTFIX'
 *   fixCommitHash?:       string   // populated when status = FIXED
 *   deferralRationale?:   string   // populated when status = DEFERRED or WONTFIX
 *   discoveredAt:         string   // ISO 8601
 *   notes?:               string
 * }
 */

/**
 * Factory — creates a Finding record from an invariant + persona + check result.
 *
 * @param {object} invariant  Must have { id, description, severity, family }
 * @param {object} persona    Must have { id }
 * @param {*}      observed   What the check function actually saw
 * @param {*}      expected   What the check function expected
 * @param {string} [notes]    Optional prose
 * @returns {object} Finding
 */
function createFinding(invariant, persona, observed, expected, notes) {
  // Input validation — fail fast at boundary
  if (!invariant || typeof invariant.id !== 'string') {
    throw new Error('[findings.createFinding] invariant.id must be a string');
  }
  if (!persona || typeof persona.id !== 'string') {
    throw new Error('[findings.createFinding] persona.id must be a string');
  }

  return {
    invariantId:          invariant.id,
    invariantDescription: invariant.description || '',
    invariantSeverity:    invariant.severity || 'LOW',
    invariantFamily:      invariant.family || 'unknown',
    personaId:            persona.id,
    observed:             observed,
    expected:             expected,
    severity:             invariant.severity || 'LOW',
    status:               'OPEN',
    fixCommitHash:        undefined,
    deferralRationale:    undefined,
    discoveredAt:         new Date().toISOString(),
    notes:                notes || undefined,
  };
}

/**
 * Serialize findings to JSON and write to filePath.
 * Creates parent directories if they do not exist.
 * The file is regenerated (not appended) on each run per the contract.
 *
 * @param {object[]} findings  Array of Finding objects
 * @param {string}   filePath  Absolute path to the output JSON file
 */
function writeFindingsJson(findings, filePath) {
  if (!Array.isArray(findings)) {
    throw new Error('[findings.writeFindingsJson] findings must be an array');
  }
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('[findings.writeFindingsJson] filePath must be a non-empty string');
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    totalFindings: findings.length,
    bySeverity: {
      CRITICAL: findings.filter(f => f.severity === 'CRITICAL').length,
      HIGH:     findings.filter(f => f.severity === 'HIGH').length,
      MEDIUM:   findings.filter(f => f.severity === 'MEDIUM').length,
      LOW:      findings.filter(f => f.severity === 'LOW').length,
    },
    findings: findings,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * Serialize findings to a markdown table and write to filePath.
 * Creates parent directories if they do not exist.
 * The file is regenerated on each run.
 *
 * Columns: Invariant ID | Persona | Severity | Observed | Expected | Status
 *
 * @param {object[]} findings  Array of Finding objects
 * @param {string}   filePath  Absolute path to the output markdown file
 */
function writeFindingsMarkdown(findings, filePath) {
  if (!Array.isArray(findings)) {
    throw new Error('[findings.writeFindingsMarkdown] findings must be an array');
  }
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('[findings.writeFindingsMarkdown] filePath must be a non-empty string');
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const now = new Date().toISOString();

  // Summary counts by severity
  const counts = {
    CRITICAL: findings.filter(f => f.severity === 'CRITICAL').length,
    HIGH:     findings.filter(f => f.severity === 'HIGH').length,
    MEDIUM:   findings.filter(f => f.severity === 'MEDIUM').length,
    LOW:      findings.filter(f => f.severity === 'LOW').length,
  };

  const openCount   = findings.filter(f => f.status === 'OPEN').length;
  const fixedCount  = findings.filter(f => f.status === 'FIXED').length;
  const deferCount  = findings.filter(f => f.status === 'DEFERRED').length;
  const wontfixCount = findings.filter(f => f.status === 'WONTFIX').length;

  /**
   * Safely stringify an observed/expected value for display in a markdown cell.
   * Truncates very long serializations to prevent table corruption.
   */
  function cellValue(val) {
    if (val === null || val === undefined) return '—';
    let str;
    try {
      str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    } catch (_e) {
      str = String(val);
    }
    // Escape pipe characters that would break markdown table layout
    str = str.replace(/\|/g, '\\|');
    // Escape newlines
    str = str.replace(/\n/g, ' ').replace(/\r/g, '');
    // Truncate at 120 chars to keep table readable
    if (str.length > 120) {
      str = str.slice(0, 117) + '...';
    }
    return str;
  }

  const lines = [
    '# Audit Report — Feature 020 Validation Audit',
    '',
    `Generated: ${now}`,
    '',
    '## Summary',
    '',
    `Total findings: **${findings.length}**`,
    `- CRITICAL: ${counts.CRITICAL}`,
    `- HIGH: ${counts.HIGH}`,
    `- MEDIUM: ${counts.MEDIUM}`,
    `- LOW: ${counts.LOW}`,
    '',
    `Status: OPEN: ${openCount} | FIXED: ${fixedCount} | DEFERRED: ${deferCount} | WONTFIX: ${wontfixCount}`,
    '',
    '## Findings',
    '',
    '| Invariant ID | Persona | Severity | Observed | Expected | Status |',
    '|---|---|---|---|---|---|',
  ];

  if (findings.length === 0) {
    lines.push('| — | — | — | No findings | — | — |');
  } else {
    for (const f of findings) {
      const statusCell = f.status === 'FIXED' && f.fixCommitHash
        ? `FIXED (${f.fixCommitHash.slice(0, 7)})`
        : (f.status || 'OPEN');

      lines.push(
        `| ${f.invariantId} ` +
        `| ${f.personaId} ` +
        `| ${f.severity} ` +
        `| ${cellValue(f.observed)} ` +
        `| ${cellValue(f.expected)} ` +
        `| ${statusCell} |`
      );
    }
  }

  lines.push('');
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

module.exports = {
  createFinding,
  writeFindingsJson,
  writeFindingsMarkdown,
};
