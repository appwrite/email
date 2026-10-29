// Reads the spam verdict that arrives with an email. The gateway's Bayesian
// classifier sends `spam: { score, verdict, model }` with a score in [0, 1] and
// a verdict of ham (< 0.2), unsure, or spam (>= 0.99). Filter headers inside
// the email (Rspamd, SpamAssassin) are a fallback. Result `level` is
// 'spam' (Junk), 'unsure' (Inbox, flagged) or 'ham'.

const DEFAULT_THRESHOLD = 6;
// The gateway's default cutoffs for its 0–1 score.
const GATEWAY_HAM_CUTOFF = 0.2;
const GATEWAY_SPAM_CUTOFF = 0.99;
const SPAM_ACTIONS = new Set(['reject', 'soft reject', 'add header', 'rewrite subject', 'spam', 'junk']);
const YES = /^\s*(yes|true|1|spam|junk)\b/i;
const NO = /^\s*(no|false|0|ham|clean|not spam)\b/i;

function first(value) {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

/** Every header whose name mentions spam, from both the request and the email. */
export function spamHeaders(reqHeaders = {}, email = {}) {
  const out = {};
  const collect = (source) => {
    for (const [name, value] of Object.entries(source || {})) {
      const key = name.toLowerCase();
      if (/spam|rspamd/.test(key)) out[key] = first(value).slice(0, 500);
    }
  };
  collect(email.headers);
  collect(reqHeaders);
  return out;
}

export function spamVerdict(reqHeaders = {}, email = {}) {
  const g = email.spam;
  if (g && typeof g === 'object' && typeof g.score === 'number' && g.score >= 0 && g.score <= 1) {
    const verdict = String(g.verdict || '').toLowerCase();
    const level = ['spam', 'unsure', 'ham'].includes(verdict)
      ? verdict
      : g.score >= GATEWAY_SPAM_CUTOFF
        ? 'spam'
        : g.score >= GATEWAY_HAM_CUTOFF
          ? 'unsure'
          : 'ham';
    return {
      isSpam: level === 'spam',
      level,
      score: g.score,
      reason: `${level} ${g.score}${g.model ? ` · model ${g.model}` : ''}`,
      headers: {},
    };
  }

  const h = spamHeaders(reqHeaders, email);
  let isSpam = null;
  let score = null;
  let threshold = null;
  const reasons = [];

  // A structured verdict in the payload, if the trigger sends one.
  const s = email.spam;
  if (s && typeof s === 'object') {
    if (typeof s.score === 'number') score = s.score;
    if (typeof s.threshold === 'number') threshold = s.threshold;
    if (typeof s.isSpam === 'boolean') isSpam = s.isSpam;
    if (typeof s.spam === 'boolean') isSpam = s.spam;
    if (typeof s.action === 'string' && SPAM_ACTIONS.has(s.action.toLowerCase())) isSpam = true;
  }

  for (const [name, value] of Object.entries(h)) {
    if (/status$/.test(name)) {
      // SpamAssassin: "Yes, score=7.1 required=5.0 tests=..."
      if (YES.test(value)) isSpam = true;
      else if (NO.test(value) && isSpam === null) isSpam = false;
      const sc = value.match(/score=(-?\d+(?:\.\d+)?)/i);
      const rq = value.match(/required=(-?\d+(?:\.\d+)?)/i);
      if (sc) score ??= parseFloat(sc[1]);
      if (rq) threshold ??= parseFloat(rq[1]);
    } else if (/action$/.test(name)) {
      if (SPAM_ACTIONS.has(value.trim().toLowerCase())) isSpam = true;
      reasons.push(`action ${value.trim()}`);
    } else if (/score$/.test(name)) {
      // Rspamd: "7.20 / 15.00" or a bare number.
      const m = value.match(/(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?/);
      if (m) {
        score ??= parseFloat(m[1]);
        if (m[2] && threshold === null) threshold = parseFloat(m[2]);
      }
    } else if (/level$/.test(name)) {
      const stars = (value.match(/\*/g) || []).length;
      if (stars && score === null) score = stars;
    } else if (/(flag|spam|verdict|is-spam)$/.test(name)) {
      if (YES.test(value)) isSpam = true;
      else if (NO.test(value) && isSpam === null) isSpam = false;
    }
  }

  if (isSpam === null && score !== null) isSpam = score >= (threshold ?? DEFAULT_THRESHOLD);
  if (score !== null) reasons.unshift(`score ${score}${threshold !== null ? ` / ${threshold}` : ''}`);

  return {
    isSpam: isSpam === true,
    level: isSpam === true ? 'spam' : score === null && isSpam === null ? null : 'ham',
    score,
    reason: reasons.join(', ').slice(0, 200),
    headers: h,
  };
}
