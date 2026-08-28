#!/usr/bin/env node
// FDA public data fetcher — zero dependencies (Node 18+ global fetch).
// Output is always plain text: data lines + "source:" URL + "retrieved:" timestamp.
// Credentials enter only via environment variables and are redacted in all output.

const TIMEOUT_MS = 30_000;

function now() {
  return new Date().toISOString();
}

function die(message) {
  console.error(message);
  process.exit(2);
}

function redact(url) {
  return url.replace(/([?&]api_key=)[^&]*/u, '$1REDACTED');
}

async function getJson(url, init = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${redact(url)}`);
  return response.json();
}

function openFdaKey() {
  const key = (process.env.ALKINO_OPENFDA_API_KEY ?? '').trim();
  return key === '' ? '' : `&api_key=${key}`;
}

function printSource(url) {
  console.log('');
  console.log(`source: ${redact(url)}`);
  console.log(`retrieved: ${now()}`);
}

// ---------- regulation ----------

function parseCitation(raw) {
  const text = raw.replace(/^21\s*CFR\s*/iu, '').replace(/^§\s*/u, '').trim();
  const match = /^(\d+)\.(\d+)/u.exec(text);
  if (!match) die(`Cannot parse citation "${raw}". Examples: 21 CFR 820.30 / 820.30(a) / 11.10`);
  return { part: Number(match[1]), section: `${match[1]}.${match[2]}`, raw: text };
}

function stripXml(xml) {
  return xml
    .replace(/<HEAD>/gu, '\n## ')
    .replace(/<\/HEAD>/gu, '\n')
    .replace(/<P>/gu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&#x([0-9A-Fa-f]+);/gu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&rsquo;/gu, "'")
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

async function cmdRegulation(arg) {
  const citation = parseCitation(arg);
  const titles = await getJson('https://www.ecfr.gov/api/versioner/v1/titles.json');
  const title21 = (titles.titles ?? []).find((t) => t.number === 21);
  if (!title21) die('Title 21 not found in eCFR titles.json.');
  const date = title21.latest_issue_date;
  const url = `https://www.ecfr.gov/api/versioner/v1/full/${date}/title-21.xml?part=${citation.part}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) die(`eCFR full-text fetch failed: HTTP ${response.status} (part ${citation.part}, date ${date})`);
  const xml = await response.text();
  const sectionPattern = new RegExp(
    `<DIV8[^>]*N="[^"]*${citation.section.replace('.', '\\.')}"[^>]*>([\\s\\S]*?)</DIV8>`,
    'u',
  );
  const match = sectionPattern.exec(xml);
  if (!match) {
    console.log(`Section § ${citation.section} not located in the current 21 CFR Part ${citation.part} text (version ${date}).`);
    console.log('Possible reasons: the section number does not exist or is reserved. Browse the full part at the source below.');
    printSource(`https://www.ecfr.gov/current/title-21/part-${citation.part}`);
    return;
  }
  console.log(`21 CFR § ${citation.section} (eCFR version ${date}, current)`);
  console.log(stripXml(match[1]));
  printSource(`https://www.ecfr.gov/current/title-21/section-${citation.section}`);
}

// ---------- recalls ----------

async function cmdRecalls(firm) {
  const query = encodeURIComponent(`recalling_firm:"${firm}"`);
  const url = `https://api.fda.gov/device/enforcement.json?search=${query}&sort=report_date:desc&limit=15${openFdaKey()}`;
  let payload;
  try {
    payload = await getJson(url);
  } catch (error) {
    if (String(error).includes('HTTP 404')) {
      console.log(`No records found in the openFDA device enforcement database for recalling_firm:"${firm}".`);
      console.log('Tip: try dropping suffixes like Inc./LLC/Co., or search the parent-company name.');
      printSource(url);
      return;
    }
    throw error;
  }
  const total = payload.meta?.results?.total ?? 0;
  console.log(`Recall/enforcement records: ${total} total (showing latest ${payload.results.length}) — recalling_firm:"${firm}"`);
  for (const r of payload.results) {
    const reason = (r.reason_for_recall ?? '').slice(0, 120);
    console.log(`- ${r.report_date ?? '?'} | Class ${r.classification?.replace('Class ', '') ?? '?'} | ${r.status ?? '?'} | ${r.product_description?.slice(0, 60) ?? ''}`);
    console.log(`  Reason: ${reason}${(r.reason_for_recall ?? '').length > 120 ? '…' : ''}`);
  }
  printSource(url);
}

// ---------- device ----------

async function cmdDevice(query) {
  const isCode = /^[A-Z]{3}$/u.test(query.trim());
  const search = isCode
    ? `product_code:${query.trim()}`
    : `device_name:"${query}"`;
  const url = `https://api.fda.gov/device/classification.json?search=${encodeURIComponent(search)}&limit=8${openFdaKey()}`;
  let payload;
  try {
    payload = await getJson(url);
  } catch (error) {
    if (String(error).includes('HTTP 404')) {
      console.log(`No records found in the device classification database for ${search}.`);
      printSource(url);
      return;
    }
    throw error;
  }
  console.log(`Device classification: ${payload.meta?.results?.total ?? 0} matches (showing first ${payload.results.length}):`);
  for (const d of payload.results) {
    console.log(`- ${d.product_code} | Class ${d.device_class} | ${d.device_name}`);
    console.log(`  Regulation: 21 CFR ${d.regulation_number || '(none)'} | Specialty: ${d.medical_specialty_description ?? '?'} | Pathway hint: ${d.submission_type_id === '1' ? '510(k)' : d.submission_type_id === '2' ? 'PMA' : d.submission_type_id === '4' ? 'Exempt' : 'see regulation'}`);
  }
  printSource(url);
}

// ---------- events ----------

async function cmdEvents(code) {
  if (!/^[A-Z]{3}$/u.test(code.trim())) die('events requires a three-letter product code (e.g. LIT). Use the device subcommand to find codes.');
  const base = `https://api.fda.gov/device/event.json?search=${encodeURIComponent(`device.device_report_product_code:${code.trim()}`)}`;
  const byYearUrl = `${base}&count=date_received${openFdaKey()}`;
  const byTypeUrl = `${base}&count=event_type.exact${openFdaKey()}`;
  const [byYear, byType] = await Promise.all([getJson(byYearUrl), getJson(byTypeUrl)]);
  const years = new Map();
  for (const point of byYear.results ?? []) {
    const year = String(point.time).slice(0, 4);
    years.set(year, (years.get(year) ?? 0) + point.count);
  }
  const recent = [...years.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  console.log(`MAUDE adverse events — product code ${code.trim()} (spontaneous reporting database; counts are not incidence rates)`);
  console.log('By year (last eight):');
  for (const [year, count] of recent) console.log(`- ${year}: ${count}`);
  console.log('By event type:');
  for (const t of byType.results ?? []) console.log(`- ${t.term}: ${t.count}`);
  console.log('');
  console.log('FDA disclaimer: MAUDE data is unverified and must not be used to compute incidence rates or as the basis for medical decisions.');
  printSource(byYearUrl);
}

// ---------- changes ----------

async function cmdChanges(term) {
  const params = new URLSearchParams();
  params.set('conditions[term]', term);
  params.append('conditions[agencies][]', 'food-and-drug-administration');
  params.set('order', 'newest');
  params.set('per_page', '10');
  const url = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
  const payload = await getJson(url);
  console.log(`Federal Register (FDA) matches for "${term}": ${payload.count} total, latest 10:`);
  for (const d of payload.results ?? []) {
    console.log(`- ${d.publication_date} | ${d.type} | ${d.title}`);
    console.log(`  ${d.html_url}`);
  }
  printSource(url);
}

// ---------- inspections / citations (FDA Data Dashboard) ----------

function dashboardCredentials() {
  const user = (process.env.ALKINO_FDA_DASHBOARD_USER ?? '').trim();
  const key = (process.env.ALKINO_FDA_DASHBOARD_KEY ?? '').trim();
  if (user === '' || key === '') return null;
  const base = (process.env.ALKINO_FDA_DASHBOARD_BASE_URL ?? 'https://api-datadashboard.fda.gov/v1').replace(/\/+$/u, '');
  return { user, key, base };
}

function dashboardHint(command) {
  console.log(`"${command}" requires free FDA Data Dashboard credentials:`);
  console.log('1. Go to datadashboard.fda.gov → API docs → the OII Unified Logon application; create an account and request a key for "FDA Data Dashboard API".');
  console.log('2. Set environment variables ALKINO_FDA_DASHBOARD_USER (approved email) and ALKINO_FDA_DASHBOARD_KEY.');
  console.log('3. Re-run this command. Inspection classifications and 483 citation data will then be live.');
}

async function dashboardQuery(resource, filters) {
  const credentials = dashboardCredentials();
  const url = `${credentials.base}/${resource}`;
  const payload = await getJson(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization-user': credentials.user,
      'authorization-key': credentials.key,
    },
    // Official contract (datadashboard.fda.gov API docs): sort/sortorder/filters/columns are
    // required keys (empty values take defaults); rows max is 5000. Response statuscode
    // 400 = Success, 412 = no results. Fetching only the first page has previously hidden
    // every OAI record for large firms — always fetch the full set, newest first.
    body: JSON.stringify({
      start: 1,
      rows: 5000,
      sort: 'InspectionEndDate',
      sortorder: 'desc',
      filters,
      columns: [],
      returntotalcount: true,
    }),
  });
  if (payload.statuscode !== undefined && payload.statuscode !== 400 && payload.statuscode !== 412) {
    throw new Error(`Dashboard statuscode ${payload.statuscode}: ${payload.message ?? ''}`);
  }
  return { payload, url };
}

async function cmdInspections(firm) {
  if (!dashboardCredentials()) { dashboardHint('inspections'); process.exit(3); }
  const { payload, url } = await dashboardQuery('inspections_classifications', { LegalName: [firm] });
  const rows = payload.result ?? payload.results ?? [];
  const total = payload.totalrecordcount ?? rows.length;
  console.log(`Inspection records — LegalName:"${firm}", ${total} total (showing latest ${Math.min(15, rows.length)}):`);
  for (const r of rows.slice(0, 15)) {
    console.log(`- ${r.InspectionEndDate ?? r.EndDate ?? '?'} | ${r.Classification ?? '?'} | ${r.ProjectArea ?? r.ProductType ?? ''} | FEI ${r.FEINumber ?? '?'} | ${r.City ?? ''} ${r.CountryName ?? ''}`);
  }
  const tally = new Map();
  for (const r of rows) {
    const grade = /\(([A-Z]{3})\)/u.exec(r.Classification ?? '')?.[1] ?? r.Classification ?? '?';
    tally.set(grade, (tally.get(grade) ?? 0) + 1);
  }
  if (rows.length > 0) {
    console.log(`Classification tally (all ${rows.length} rows): ${[...tally.entries()].map(([g, c]) => `${g} ${c}`).join(' · ')}`);
  }
  if (rows.length === 5000) console.log('Note: hit the 5000-row single-request cap; tallies may be incomplete.');
  if (rows.length === 0) console.log('No records found. Try dropping company suffixes or searching by FEI number — legal names often differ from trade names.');
  printSource(url);
}

async function cmdCitations(firm) {
  if (!dashboardCredentials()) { dashboardHint('citations'); process.exit(3); }
  const { payload, url } = await dashboardQuery('inspections_citations', { LegalName: [firm] });
  const rows = payload.result ?? payload.results ?? [];
  const total = payload.totalrecordcount ?? rows.length;
  console.log(`483 citations — LegalName:"${firm}", ${total} total (showing latest ${Math.min(15, rows.length)}; frequency computed over the full set):`);
  const byClause = new Map();
  for (const r of rows) {
    const clause = r.ActCFRNumber ?? r.CFRNumber ?? '?';
    byClause.set(clause, (byClause.get(clause) ?? 0) + 1);
  }
  for (const r of rows.slice(0, 15)) {
    console.log(`- ${r.InspectionEndDate ?? '?'} | ${r.ActCFRNumber ?? r.CFRNumber ?? '?'} | ${(r.ShortDescription ?? '').slice(0, 90)}`);
  }
  if (rows.length === 5000) console.log('Note: hit the 5000-row single-request cap; tallies may be incomplete.');
  if (byClause.size > 0) {
    console.log('');
    console.log('Clause frequency:');
    for (const [clause, count] of [...byClause.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`- ${clause}: ${count}`);
    }
  }
  printSource(url);
}

// ---------- main ----------

const [command, ...rest] = process.argv.slice(2);
const arg = rest.join(' ').trim();
const usage = 'Usage: fda_data.mjs <regulation|recalls|device|events|changes|inspections|citations> <argument>';

try {
  if (command === 'regulation' && arg) await cmdRegulation(arg);
  else if (command === 'recalls' && arg) await cmdRecalls(arg);
  else if (command === 'device' && arg) await cmdDevice(arg);
  else if (command === 'events' && arg) await cmdEvents(arg);
  else if (command === 'changes' && arg) await cmdChanges(arg);
  else if (command === 'inspections' && arg) await cmdInspections(arg);
  else if (command === 'citations' && arg) await cmdCitations(arg);
  else die(usage);
} catch (error) {
  console.error(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('When a data source is unavailable, report that honestly to the user — never fill the gap from memory.');
  process.exit(1);
}
