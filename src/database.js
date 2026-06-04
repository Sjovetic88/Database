/**
 * FOOTBALL DATA HUB PRO - v5.26.1 "THE SENTINEL - SCHEMA ALIGNED"
 * 4 Moduli: ADMIN, NOMI, MATCH, CAMPIONATI.
 * Style: GOLDBET DATABASE (OLED Black + Cyan Neon).
 * Feature: Engine Shield (match_id fix), Schema Aligned (elo_raw/perf), Rome Time.
 * Fix: Total Reset Fix, 10.5px Font, ✖️ Close Buttons, No-Backtick UI.
 */

const FALLBACK_CONFIG = {
  ADMIN_PASSWORD: "RESET",
  FUZZY_THRESHOLD: 0.60,
  AUTO_ADD_THRESHOLD: 0.40,
  PAGE_SIZE: 100
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const h = { "Content-Type": "application/json" };
    try {
      if (p === "/api/leagues") return await handleGetLeagues(env, h);
      if (p === "/api/matches") return await handleGetMatches(url, env, h);
      if (p === "/api/admin/status") return await handleAdminStatus(env, h);
      if (p === "/api/admin/league-status") return await handleLeagueStatus(env, h);
      if (p === "/api/admin/validate") return await handleValidate(request, env, h);
      if (p === "/api/admin/merge") return await handleMerge(request, env, h);
      if (p === "/api/admin/split") return await handleSplit(request, env, h);
      if (p === "/api/admin/ignore") return await handleIgnoreDupe(request, env, h);
      if (p === "/api/admin/transfer") return await handleTransfer(env, h);
      if (p === "/api/admin/sync-single") return await handleSyncSingle(request, env, h);
      if (p === "/api/admin/update-team-country") return await handleUpdateTeamCountry(request, env, h);
      if (p === "/api/admin/add-league") return await handleAddLeague(request, env, h);
      if (p === "/api/admin/delete-league") return await handleDeleteLeague(request, env, h);
      if (p === "/api/admin/restore-league") return await handleRestoreLeague(request, env, h);
      if (p === "/api/admin/abbr") return await handleGetAbbr(env, h);
      if (p === "/api/admin/abbr-add") return await handleAddAbbr(request, env, h);
      if (p === "/api/admin/abbr-del") return await handleDeleteAbbr(request, env, h);
      if (p === "/api/admin/reset") return await handleReset(request, env, h);

      return new Response(generateHTML(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: h }); }
  },
  async scheduled(event, env) { await handleAutomatedUpdate(env); }
};

// --- UTILS ---

function getSimilarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase(); b = b.toLowerCase();
  var matrix = [];
  for (var i = 0; i <= b.length; i++) matrix[i] = [i];
  for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (var i = 1; i <= b.length; i++) {
    for (var j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return 1 - (matrix[b.length][a.length] / Math.max(a.length, b.length));
}

function getCurrentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? String(year).slice(-2) + String(year + 1).slice(-2) : String(year - 1).slice(-2) + String(year).slice(-2);
}

async function updateSignal(env, force = false) {
  if (force) {
    const ts = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    await env.DB.prepare("INSERT OR REPLACE INTO system_status (key, value) VALUES ('LAST_UPDATE', ?)").bind(ts).run();
  }
}

async function triggerEngineReset(env, engineCountry) {
  if (!engineCountry) return;
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM archivio_elaborato WHERE nazione = ?").bind(engineCountry),
      env.DB.prepare("UPDATE classifica_elite SET elo_raw = 1200, elo_perf = 1200, attacco = 1.0, difesa = 1.0, partite_giocate = 0, h_factor = 1.1, trend = 0 WHERE nazione = ?").bind(engineCountry),
      env.DB.prepare("UPDATE stato_nazioni SET completato = 1 WHERE nazione = ?").bind(engineCountry)
    ]);
  } catch (e) { }
}

// --- GESTIONE LEAGUES ---

async function handleGetLeagues(env, h) {
  const res = await env.DB.prepare("SELECT * FROM leagues ORDER BY id ASC").all();
  return new Response(JSON.stringify(res.results), { headers: h });
}

async function handleAddLeague(request, env, h) {
  const l = await request.json();
  await env.DB.prepare("INSERT OR REPLACE INTO leagues (id, name, country, engine_country, color, text_color, type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)")
    .bind(l.id, l.name, l.country, l.engine_country, l.color, l.text_color, l.type).run();
  return new Response(JSON.stringify({ success: true }), { headers: h });
}

async function handleDeleteLeague(request, env, h) {
  const { id } = await request.json();
  const league = await env.DB.prepare("SELECT engine_country FROM leagues WHERE id = ?").bind(id).first();
  await env.DB.prepare("DELETE FROM matches WHERE div = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM staged_matches WHERE div = ?").bind(id).run();
  await env.DB.prepare("UPDATE leagues SET is_active = 0 WHERE id = ?").bind(id).run();
  if (league && league.engine_country) await triggerEngineReset(env, league.engine_country);
  await updateSignal(env, true);
  return new Response(JSON.stringify({ success: true }), { headers: h });
}

async function handleRestoreLeague(request, env, h) {
  const { id } = await request.json();
  const league = await env.DB.prepare("SELECT engine_country FROM leagues WHERE id = ?").bind(id).first();
  await env.DB.prepare("UPDATE leagues SET is_active = 1 WHERE id = ?").bind(id).run();
  if (league && league.engine_country) await triggerEngineReset(env, league.engine_country);
  await updateSignal(env, true);
  return new Response(JSON.stringify({ success: true }), { headers: h });
}

// --- GESTIONE ABBREVIAZIONI ---

async function handleGetAbbr(env, h) {
  const res = await env.DB.prepare("SELECT * FROM name_abbreviations ORDER BY original ASC").all();
  return new Response(JSON.stringify(res.results), { headers: h });
}

async function handleAddAbbr(request, env, h) {
  const { original, short } = await request.json();
  await env.DB.prepare("INSERT OR REPLACE INTO name_abbreviations (original, short) VALUES (?, ?)")
    .bind(original.toUpperCase(), short.toUpperCase()).run();
  return new Response(JSON.stringify({ success: true }), { headers: h });
}

async function handleDeleteAbbr(request, env, h) {
  const { original } = await request.json();
  await env.DB.prepare("DELETE FROM name_abbreviations WHERE original = ?").bind(original).run();
  return new Response(JSON.stringify({ success: true }), { headers: h });
}

// --- LOGICA API MATCHES ---

async function handleGetMatches(url, env, h) {
  const l = url.searchParams.get("league"), s = url.searchParams.get("season"), t = url.searchParams.get("team"), page = parseInt(url.searchParams.get("page") || "1");
  const offset = (page - 1) * FALLBACK_CONFIG.PAGE_SIZE;
  let where = " WHERE 1=1", params = [];
  if (l) { where += " AND m.div = ?"; params.push(l); }
  if (s) { where += " AND m.season = ?"; params.push(s); }
  if (t) { where += " AND (t1.name LIKE ? OR t2.name LIKE ?)"; params.push("%" + t + "%", "%" + t + "%"); }
  const total = await env.DB.prepare("SELECT COUNT(*) as c FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id" + where).bind(...params).first();
  const res = await env.DB.prepare("SELECT m.*, t1.name as home_name, t2.name as away_name FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id" + where + " ORDER BY m.date DESC LIMIT ? OFFSET ?").bind(...params, FALLBACK_CONFIG.PAGE_SIZE, offset).all();
  const seasons = await env.DB.prepare("SELECT DISTINCT season FROM matches UNION SELECT DISTINCT season FROM staged_matches ORDER BY season DESC").all();
  const abbr = await env.DB.prepare("SELECT * FROM name_abbreviations").all();
  return new Response(JSON.stringify({ matches: res.results, seasons: seasons.results.map(i => i.season), total: total.c, abbr: abbr.results }), { headers: h });
}

async function handleLeagueStatus(env, h) {
  const p = await env.DB.prepare("SELECT div, COUNT(*) as c FROM matches GROUP BY div").all();
  const s = await env.DB.prepare("SELECT div, COUNT(*) as c FROM staged_matches GROUP BY div").all();
  const sc = await env.DB.prepare("SELECT div, COUNT(DISTINCT season) as c FROM matches GROUP BY div").all();
  return new Response(JSON.stringify({ prod: p.results, staged: s.results, seasons: sc.results }), { headers: h });
}

async function handleAdminStatus(env, h) {
  const total = await env.DB.prepare("SELECT COUNT(*) as c FROM matches").first();
  const staged = await env.DB.prepare("SELECT COUNT(*) as c FROM staged_matches").first();
  const unknown = await env.DB.prepare("SELECT DISTINCT s.name, l.country FROM (SELECT hometeam as name, div FROM staged_matches UNION SELECT awayteam as name, div FROM staged_matches) s JOIN leagues l ON s.div = l.id WHERE s.name NOT IN (SELECT alias FROM team_aliases)").all();
  const teams = await env.DB.prepare("SELECT t.id, t.name, t.country, GROUP_CONCAT(a.alias, ' | ') as aliases FROM teams t LEFT JOIN team_aliases a ON t.id = a.team_id GROUP BY t.id ORDER BY t.country, t.name").all();
  const ignored = await env.DB.prepare("SELECT id FROM ignored_duplicates").all();
  const signal = await env.DB.prepare("SELECT value FROM system_status WHERE key = 'LAST_UPDATE'").first();
  return new Response(JSON.stringify({ total: total.c, staged: staged.c, unknown: unknown.results, teams: teams.results, ignored: ignored.results.map(i => i.id), lastUpdate: signal ? signal.value : "MAI" }), { headers: h });
}

// --- ENGINE DOWNLOAD ---

async function fetchAndProcess(url, league, env, fullFile = false, seasonParam = null) {
  try {
    const curS = seasonParam || getCurrentSeason();
    if (curS !== getCurrentSeason()) {
      const check = await env.DB.prepare("SELECT COUNT(*) as c FROM matches WHERE div = ? AND season = ?").bind(league.id, curS).first();
      if (check && check.c > 0) return { success: true, status: 200, rows: 0, skipped: true };
    }

    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Referer": "https://www.football-data.co.uk/" };
    const resp = await fetch(url, { headers: headers });
    if (!resp.ok) return { success: false, status: resp.status, rows: 0 };
    const text = await resp.text();
    let rows = text.split("\n").map(r => r.trim()).filter(r => r);
    if (!fullFile && league.type === "extra" && rows.length > 300) { rows = [rows[0]].concat(rows.slice(-300)); }
    
    const headersCsv = rows[0].split(",").map(h => h.trim().toLowerCase());
    const colMap = {};
    const targets = { h: ["hometeam", "home", "ht"], a: ["awayteam", "away", "at"], s: ["season"], d: ["date"], fthg: ["fthg", "hg"], ftag: ["ftag", "ag"], ftr: ["ftr", "res"], hthg: ["hthg"], htag: ["htag"], htr: ["htr"], hs: ["hs"], as: ["as"], hst: ["hst"], ast: ["ast"], hf: ["hf"], af: ["af"], hc: ["hc"], ac: ["ac"], hy: ["hy"], ay: ["ay"], hr: ["hr"], ar: ["ar"] };
    for (const [key, aliases] of Object.entries(targets)) colMap[key] = headersCsv.findIndex(h => aliases.includes(h));

    const aliasData = await env.DB.prepare("SELECT alias, team_id FROM team_aliases").all();
    const aliasMap = new Map(aliasData.results.map(i => [i.alias, i.team_id]));
    const teamsData = await env.DB.prepare("SELECT id, name FROM teams").all();
    const allTeams = teamsData.results;

    const uniqueNamesInFile = new Set();
    const matchIdsInFile = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i].split(","); if (r.length < 5) continue;
      const h = r[colMap.h] ? r[colMap.h].trim().toUpperCase() : null;
      const a = r[colMap.a] ? r[colMap.a].trim().toUpperCase() : null;
      if (h) uniqueNamesInFile.add(h); if (a) uniqueNamesInFile.add(a);
      const hId = aliasMap.get(h), aId = aliasMap.get(a);
      if (hId && aId) matchIdsInFile.push(curS + "_" + league.id + "_" + hId + "_" + aId);
    }

    let needsEngineReset = false;
    try {
      if (matchIdsInFile.length > 0) {
        const placeholders = matchIdsInFile.map(() => "?").join(",");
        const checkArchivio = await env.DB.prepare("SELECT COUNT(*) as c FROM archivio_elaborato WHERE match_id IN (" + placeholders + ")").bind(...matchIdsInFile).first();
        if (checkArchivio && checkArchivio.c > 0) needsEngineReset = true;
      }
    } catch(e) { }

    for (const name of uniqueNamesInFile) {
      if (!aliasMap.has(name)) {
        let bestScore = 0;
        for (const t of allTeams) { const s = getSimilarity(name, t.name); if (s > bestScore) bestScore = s; }
        if (bestScore < FALLBACK_CONFIG.AUTO_ADD_THRESHOLD) {
          const res = await env.DB.prepare("INSERT INTO teams (name, country) VALUES (?, ?)").bind(name, league.country.toUpperCase()).run();
          const newId = res.meta.last_row_id;
          await env.DB.prepare("INSERT INTO team_aliases (alias, team_id) VALUES (?, ?)").bind(name, newId).run();
          aliasMap.set(name, newId);
        }
      }
    }

    let totalChanges = 0;
    const batch = [];
    if (needsEngineReset && league.engine_country) {
      batch.push(env.DB.prepare("DELETE FROM archivio_elaborato WHERE nazione = ?").bind(league.engine_country));
      batch.push(env.DB.prepare("UPDATE classifica_elite SET elo_raw = 1200, elo_perf = 1200, attacco = 1.0, difesa = 1.0, partite_giocate = 0, h_factor = 1.1, trend = 0 WHERE nazione = ?").bind(league.engine_country));
      batch.push(env.DB.prepare("UPDATE stato_nazioni SET completato = 1 WHERE nazione = ?").bind(league.engine_country));
    }

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i].split(","); if (r.length < 5) continue;
      const getVal = (key) => (colMap[key] !== -1 && r[colMap[key]]) ? r[colMap[key]].trim().toUpperCase() : null;
      const h = getVal("h"), a = getVal("a"); if (!h || !a) continue;
      const s = getVal("s") || curS;
      const dr = getVal("d"); let dateIso = ""; if (dr) { const p = dr.split("/"); if (p.length === 3) { const y = p[2].length === 2 ? (parseInt(p[2]) > 50 ? "19"+p[2] : "20"+p[2]) : p[2]; dateIso = y + "-" + p[1].padStart(2,"0") + "-" + p[0].padStart(2,"0"); } }
      const hId = aliasMap.get(h), aId = aliasMap.get(a);
      const sqlFields = "(id, div, season, date, hometeam, awayteam, fthg, ftag, ftr, hthg, htag, htr, hs, as_stats, hst, ast, hf, af, hc, ac, hy, ay, hr, ar, home_team_id, away_team_id)";
      const sqlPlaceholders = "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
      const commonValues = [ league.id, s, dateIso, h, a, parseInt(getVal("fthg")), parseInt(getVal("ftag")), getVal("ftr"), parseInt(getVal("hthg")), parseInt(getVal("htag")), getVal("htr"), parseInt(getVal("hs")), parseInt(getVal("as")), parseInt(getVal("hst")), parseInt(getVal("ast")), parseInt(getVal("hf")), parseInt(getVal("af")), parseInt(getVal("hc")), parseInt(getVal("ac")), parseInt(getVal("hy")), parseInt(getVal("ay")), parseInt(getVal("hr")), parseInt(getVal("ar")) ];

      if (hId && aId) {
        const prodId = s + "_" + league.id + "_" + hId + "_" + aId;
        batch.push(env.DB.prepare("INSERT INTO matches " + sqlFields + " " + sqlPlaceholders + " ON CONFLICT(id) DO UPDATE SET fthg=excluded.fthg, ftag=excluded.ftag, ftr=excluded.ftr, hthg=excluded.hthg, htag=excluded.htag, htr=excluded.htr, hs=excluded.hs, as_stats=excluded.as_stats, hst=excluded.hst, ast=excluded.ast, hf=excluded.hf, af=excluded.af, hc=excluded.hc, ac=excluded.ac, hy=excluded.hy, ay=excluded.ay, hr=excluded.hr, ar=excluded.ar WHERE matches.fthg != excluded.fthg OR matches.ftag != excluded.ftag OR matches.hthg != excluded.hthg OR matches.htag != excluded.htag OR matches.ftr != excluded.ftr").bind(prodId, ...commonValues, hId, aId));
      } else {
        const rowId = (s + "_" + league.id + "_" + h + "_" + a).replace(/\s+/g, "");
        batch.push(env.DB.prepare("INSERT OR REPLACE INTO staged_matches (id, div, season, date, hometeam, awayteam, fthg, ftag, ftr, hthg, htag, htr, hs, as_stats, hst, ast, hf, af, hc, ac, hy, ay, hr, ar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(rowId, ...commonValues.slice(0, 23)));
      }
      if (batch.length >= 50) { const resBatch = await env.DB.batch(batch); resBatch.forEach(r => { if(r.meta.changes) totalChanges += r.meta.changes; }); batch.length = 0; }
    }
    if (batch.length > 0) { const resBatch = await env.DB.batch(batch); resBatch.forEach(r => { if(r.meta.changes) totalChanges += r.meta.changes; }); }
    await env.DB.prepare("UPDATE matches SET id = season || '_' || div || '_' || home_team_id || '_' || away_team_id WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL").run();
    await updateSignal(env, totalChanges || (needsEngineReset ? 1 : 0));
    return { success: true, status: resp.status, rows: rows.length - 1, staged: (uniqueNamesInFile.size > aliasMap.size), changes: totalChanges };
  } catch (e) { return { success: false, status: 500, error: e.message }; }
}

async function handleSyncSingle(request, env, h) {
  const { leagueId, season, fullFile } = await request.json();
  const leagueRes = await env.DB.prepare("SELECT * FROM leagues WHERE id = ?").bind(leagueId).first();
  const s = season || getCurrentSeason();
  const folder = leagueRes.type === "extra" ? "new" : "mmz4281/" + s;
  const url = "https://www.football-data.co.uk/" + folder + "/" + leagueRes.id + ".csv";
  const result = await fetchAndProcess(url, leagueRes, env, fullFile, s);
  return new Response(JSON.stringify(result), { headers: h });
}

async function handleAutomatedUpdate(env) {
  const leaguesRes = await env.DB.prepare("SELECT * FROM leagues WHERE is_active = 1").all();
  const allLeagues = leaguesRes.results; if (allLeagues.length === 0) return;
  const leagueToProcess = allLeagues[new Date().getMinutes() % allLeagues.length];
  const s = getCurrentSeason();
  const folder = leagueToProcess.type === "extra" ? "new" : "mmz4281/" + s;
  await fetchAndProcess("https://www.football-data.co.uk/" + folder + "/" + leagueToProcess.id + ".csv", leagueToProcess, env, false, s);
}

async function handleTransferInternal(env) {
  const qInsert = env.DB.prepare("INSERT OR REPLACE INTO matches (id, div, season, date, hometeam, awayteam, fthg, ftag, ftr, hthg, htag, htr, hs, as_stats, hst, ast, hf, af, hc, ac, hy, ay, hr, ar, home_team_id, away_team_id) SELECT s.season || '_' || s.div || '_' || a1.team_id || '_' || a2.team_id, s.div, s.season, s.date, s.hometeam, s.awayteam, s.fthg, s.ftag, s.ftr, s.hthg, s.htag, s.htr, s.hs, s.as_stats, s.hst, s.ast, s.hf, s.af, s.hc, s.ac, s.hy, s.ay, s.hr, s.ar, a1.team_id, a2.team_id FROM staged_matches s JOIN team_aliases a1 ON s.hometeam = a1.alias JOIN team_aliases a2 ON s.awayteam = a2.alias WHERE s.hometeam IN (SELECT alias FROM team_aliases) AND s.awayteam IN (SELECT alias FROM team_aliases)");
  const qDelete = env.DB.prepare("DELETE FROM staged_matches WHERE hometeam IN (SELECT alias FROM team_aliases) AND awayteam IN (SELECT alias FROM team_aliases)");
  const res = await env.DB.batch([qInsert, qDelete]);
  const changes = res[0].meta.changes;
  await env.DB.prepare("UPDATE matches SET id = season || '_' || div || '_' || home_team_id || '_' || away_team_id WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL").run();
  await updateSignal(env, changes || 1);
}

async function handleTransfer(env, h) { await handleTransferInternal(env); return new Response(JSON.stringify({ success: true }), { headers: h }); }
async function handleReset(request, env, h) { const { password } = await request.json(); if (password !== FALLBACK_CONFIG.ADMIN_PASSWORD) return new Response("Error", { status: 403 }); await env.DB.batch([env.DB.prepare("DELETE FROM matches"), env.DB.prepare("DELETE FROM staged_matches"), env.DB.prepare("DELETE FROM ignored_duplicates"), env.DB.prepare("DELETE FROM archivio_elaborato"), env.DB.prepare("UPDATE classifica_elite SET elo_raw = 1200, elo_perf = 1200, attacco = 1.0, difesa = 1.0, partite_giocate = 0, h_factor = 1.1, trend = 0"), env.DB.prepare("UPDATE stato_nazioni SET completato = 1")]); await updateSignal(env, true); return new Response(JSON.stringify({ success: true }), { headers: h }); }
async function handleValidate(request, env, h) { const { original, targetId, isNew, country } = await request.json(); const cleanName = original.trim().toUpperCase(); if (isNew) { const res = await env.DB.prepare("INSERT INTO teams (name, country) VALUES (?, ?)").bind(cleanName, country.toUpperCase()).run(); await env.DB.prepare("INSERT INTO team_aliases (alias, team_id) VALUES (?, ?)").bind(cleanName, res.meta.last_row_id).run(); } else await env.DB.prepare("INSERT INTO team_aliases (alias, team_id) VALUES (?, ?)").bind(cleanName, targetId).run(); await handleTransferInternal(env); return new Response(JSON.stringify({ success: true }), { headers: h }); }
async function handleUpdateTeamCountry(request, env, h) { const { teamId, newCountry } = await request.json(); await env.DB.prepare("UPDATE teams SET country = ? WHERE id = ?").bind(newCountry.toUpperCase(), teamId).run(); await updateSignal(env, true); return new Response(JSON.stringify({ success: true }), { headers: h }); }
async function handleMerge(request, env, h) { const { sourceId, targetId } = await request.json(); const team = await env.DB.prepare("SELECT country FROM teams WHERE id = ?").bind(targetId).first(); await env.DB.batch([ env.DB.prepare("UPDATE team_aliases SET team_id = ? WHERE team_id = ?").bind(targetId, sourceId), env.DB.prepare("UPDATE matches SET home_team_id = ? WHERE home_team_id = ?").bind(targetId, sourceId), env.DB.prepare("UPDATE matches SET away_team_id = ? WHERE away_team_id = ?").bind(targetId, sourceId), env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(sourceId) ]); if (team) await triggerEngineReset(env, team.country); await updateSignal(env, true); return new Response(JSON.stringify({ success: true }), { headers: h }); }
async function handleSplit(request, env, h) { const { alias, currentTeamId, country } = await request.json(); const res = await env.DB.prepare("INSERT INTO teams (name, country) VALUES (?, ?)").bind(alias, country.toUpperCase()).run(); const newId = res.meta.last_row_id; await env.DB.batch([ env.DB.prepare("UPDATE team_aliases SET team_id = ? WHERE alias = ?").bind(newId, alias), env.DB.prepare("UPDATE matches SET home_team_id = ? WHERE home_team_id = ? AND hometeam = ?").bind(newId, currentTeamId, alias), env.DB.prepare("UPDATE matches SET away_team_id = ? WHERE away_team_id = ? AND awayteam = ?").bind(newId, currentTeamId, alias) ]); await triggerEngineReset(env, country.toUpperCase()); await updateSignal(env, true); return new Response(JSON.stringify({ success: true }), { headers: h }); }
async function handleIgnoreDupe(request, env, h) { const { id } = await request.json(); await env.DB.prepare("INSERT OR IGNORE INTO ignored_duplicates (id) VALUES (?)").bind(id).run(); return new Response(JSON.stringify({ success: true }), { headers: h }); }

// --- FRONTEND ---
function generateHTML() {
  const lines = [
"<!DOCTYPE html>",
"<html lang='it'>",
"<head>",
"    <meta charset='UTF-8'>",
"    <meta name='viewport' content='width=device-width, initial-scale=1.0'>",
"    <title>GOLDBET DATABASE v5.25.0</title>",
"    <script src='https://cdn.tailwindcss.com'></script>",
"    <style>",
"        body { font-family: sans-serif; margin: 0; background: #000; font-size: 12px; color: #d4d4d8; }",
"        .header { background: #000; padding: 15px 20px; border-bottom: 1px solid #27272a; position: sticky; top: 0; z-index: 100; }",
"        .nav-icons { display: flex; gap: 15px; }",
"        .nav-btn { cursor: pointer; font-size: 18px; background: none; border: none; color: #fff; transition: 0.2s; }",
"        .nav-btn:hover { color: #22d3ee; transform: scale(1.1); }",
"        .filter-bar { background: #09090b; padding: 10px; display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #27272a; }",
"        select, input { background: #18181b; color: #fff; border: 1px solid #3f3f46; padding: 6px; border-radius: 4px; font-size: 12px; }",
"        .table-container { overflow-x: auto; background: #000; margin: 10px; border-radius: 8px; border: 1px solid #27272a; }",
"        table { width: 100%; border-collapse: collapse; table-layout: auto; }",
"        th, td { border: 1px solid #18181b; padding: 6px 4px; text-align: center; white-space: nowrap; }",
"        th { background: #09090b; color: #71717a; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }",
"        .h-macro { background: #18181b; color: #22d3ee; font-weight: 900; font-size: 10px; border-bottom: 2px solid #22d3ee; }",
"        .t-name { text-transform: uppercase; font-weight: 900; text-align: left !important; font-size: 10.5px; color: #fff; min-width: 120px; }",
"        .div-tag { padding: 2px 5px; border-radius: 3px; font-weight: 900; font-size: 9px; display: inline-block; }",
"        .col-away { background-color: rgba(255,255,255,0.03); }",
"        .sep-r { border-right: 2px solid #3f3f46 !important; }",
"        .pagination { padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; background: #09090b; margin: 10px; border-radius: 8px; border: 1px solid #27272a; }",
"        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); }",
"        .modal-content { background: #09090b; margin: 20px auto; padding: 25px; width: 95%; max-width: 800px; border-radius: 12px; border: 1px solid #27272a; max-height: 90vh; overflow-y: auto; position: relative; color: #fff; }",
"        .close-x { position: absolute; top: 15px; right: 20px; font-size: 22px; cursor: pointer; color: #71717a; transition: 0.2s; }",
"        .close-x:hover { color: #fff; }",
"        .card-yellow { background: #facc15; color: #000; border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10px; }",
"        .card-red { background: #ef4444; color: #fff; border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10px; }",
"        .btn { padding: 8px 14px; border-radius: 6px; border: none; cursor: pointer; font-weight: 800; font-size: 11px; transition: 0.2s; text-transform: uppercase; }",
"        .btn-primary { background: #22d3ee; color: #000; }",
"        .btn-primary:hover { background: #67e8f9; }",
"        .btn-success { background: #22c55e; color: #000; }",
"        .btn-danger { background: #ef4444; color: #fff; }",
"        .btn-warning { background: #facc15; color: #000; }",
"        #consoleLog { background: #000; color: #22d3ee; font-family: monospace; font-size: 11px; border: 1px solid #27272a; padding: 10px; height: 350px; overflow-y: auto; }",
"        .log-line { border-bottom: 1px solid #18181b; padding: 4px 0; }",
"        .log-success { color: #22c55e; }",
"        .log-error { color: #ef4444; }",
"    </style>",
"</head>",
"<body>",
"    <div class='header flex justify-between items-center'>",
"        <h1 class='text-2xl font-black italic tracking-tighter text-white flex items-center'>",
"            GOLDBET <span class='text-cyan-400 not-italic ml-1'>DATABASE</span>",
"            <div class='h-2 w-2 rounded-full bg-cyan-500 animate-pulse ml-3'></div>",
"        </h1>",
"        <div class='nav-icons'>",
"            <button class='nav-btn' onclick=\"openMatches()\">⚽</button>",
"            <button class='nav-btn' onclick=\"openNames()\">🔠</button>",
"            <button class='nav-btn' onclick=\"openLeagues()\">🏆</button>",
"            <button class='nav-btn' onclick=\"openAdmin()\">⚙️</button>",
"        </div>",
"    </div>",
"    <div class='filter-bar'>",
"        <select id='fLega' onchange='resetPage()'><option value=''>TUTTE LE LEGHE</option></select>",
"        <select id='fSeason' onchange='resetPage()'><option value=''>STAGIONE</option></select>",
"        <input type='text' id='fTeam' placeholder='CERCA SQUADRA...' onkeyup='debouncedSearch()'>",
"    </div>",
"    <div class='table-container'>",
"        <table>",
"            <thead>",
"                <tr>",
"                    <th colspan='4' class='h-macro sep-r'>INFO PARTITA</th>",
"                    <th colspan='2' class='h-macro sep-r'>SCORE</th>",
"                    <th colspan='4' class='h-macro sep-r'>DISCIPLINA</th>",
"                    <th colspan='4' class='h-macro sep-r'>ATTACCO</th>",
"                    <th colspan='4' class='h-macro'>STATISTICHE</th>",
"                </tr>",
"                <tr>",
"                    <th>DATA</th><th>LEGA</th><th>CASA</th><th class='sep-r'>AWAY</th>",
"                    <th>⚽</th><th class='sep-r'>⏱️</th>",
"                    <th>🟨C</th><th>🟨T</th><th>🟥C</th><th class='sep-r'>🟥T</th>",
"                    <th>🥅C</th><th>🥅T</th><th>🎯C</th><th class='sep-r'>🎯T</th>",
"                    <th>⚠️C</th><th>⚠️T</th><th>🚩C</th><th>🚩T</th>",
"                </tr>",
"            </thead>",
"            <tbody id='matchTable'></tbody>",
"        </table>",
"    </div>",
"    <div class='pagination'>",
"        <button class='btn btn-primary' id='prevBtn' onclick='changePage(-1)'>◀ PREV</button>",
"        <span id='pageInfo' class='font-bold text-cyan-400'>...</span>",
"        <button class='btn btn-primary' id='nextBtn' onclick='changePage(1)'>NEXT ▶</button>",
"    </div>",
"    <div id='consoleModal' class='modal' style='z-index: 9999;'>",
"        <div class='modal-content'>",
"            <span class='close-x' onclick=\"toggleModal('consoleModal')\">✖️</span>",
"            <h3 class='text-cyan-400 font-black mb-4 text-center'>TERMINALE DI SISTEMA</h3>",
"            <div id='consoleLog'></div>",
"        </div>",
"    </div>",
"    <div id='leaguesModal' class='modal'>",
"        <div class='modal-content'>",
"            <span class='close-x' onclick=\"toggleModal('leaguesModal')\">✖️</span>",
"            <h2 class='text-xl font-black mb-4'>🏆 GESTIONE CAMPIONATI</h2>",
"            <div class='bg-zinc-900 p-4 rounded-lg border border-zinc-800 mb-6'>",
"                <div class='grid grid-cols-4 gap-3 mb-3'>",
"                    <div>ID: <input type='text' id='lId' class='w-full'></div>",
"                    <div>NOME: <input type='text' id='lName' class='w-full'></div>",
"                    <div>NAZIONE: <input type='text' id='lCountry' class='w-full'></div>",
"                    <div>NOME ENGINE: <input type='text' id='lEngine' placeholder='es: Italy' class='w-full'></div>",
"                </div>",
"                <div class='grid grid-cols-4 gap-3'>",
"                    <div>SFONDO: <input type='color' id='lColor' oninput=\"document.getElementById('lHex').value=this.value\" class='w-full h-8'></div>",
"                    <div>TESTO: <input type='color' id='lTextColor' value='#FFFFFF' class='w-full h-8'></div>",
"                    <div>HEX: <input type='text' id='lHex' oninput=\"document.getElementById('lColor').value=this.value\" class='w-full'></div>",
"                    <div>TIPO: <select id='lType' class='w-full'><option value='std'>STANDARD</option><option value='extra'>EXTRA</option></select></div>",
"                </div>",
"                <button class='btn btn-success w-full mt-4' onclick='addLeague()'>SALVA CONFIGURAZIONE</button>",
"            </div>",
"            <h4 class='text-cyan-400 font-bold mb-2'>CAMPIONATI ATTIVI</h4><div id='leaguesList'></div><hr class='my-4 border-zinc-800'>",
"            <h4 class='text-zinc-500 font-bold mb-2'>ARCHIVIO</h4><div id='archivedList'></div>",
"        </div>",
"    </div>",
"    <div id='countryModal' class='modal' style='z-index:1100'>",
"        <div class='modal-content' style='max-width:400px; text-align:center;'>",
"            <span class='close-x' onclick=\"toggleModal('countryModal')\">✖️</span>",
"            <h3 class='font-black mb-4'>SELEZIONA NAZIONE</h3>",
"            <select id='countrySelect' class='w-full mb-3 p-2'></select>",
"            <input type='text' id='countryCustom' oninput='this.value=this.value.toUpperCase()' placeholder='O SCRIVI NUOVA...' class='w-full mb-4 p-2'>",
"            <button class='btn btn-primary w-full' onclick='confirmCountry()'>CONFERMA</button>",
"        </div>",
"    </div>",
"    <div id='splitModal' class='modal' style='z-index:1100'>",
"        <div class='modal-content' style='max-width:450px;'>",
"            <span class='close-x' onclick=\"toggleModal('splitModal')\">✖️</span>",
"            <h3 class='font-black mb-4 text-red-500'>DIVIDI SQUADRA ➗</h3><div id='aliasList'></div>",
"        </div>",
"    </div>",
"    <div id='matchModal' class='modal'>",
"        <div class='modal-content'>",
"            <span class='close-x' onclick=\"toggleModal('matchModal')\">✖️</span>",
"            <h2 class='font-black mb-4'>⚽ STATO AVANZAMENTO</h2>",
"            <table width='100%' class='text-sm'><thead><tr><th>LEGA</th><th>STAGIONI</th><th>PROD</th><th>DIGA</th></tr></thead><tbody id='statusTableBody'></tbody></table>",
"        </div>",
"    </div>",
"    <div id='namesModal' class='modal'>",
"        <div class='modal-content'>",
"            <span class='close-x' onclick=\"toggleModal('namesModal')\">✖️</span>",
"            <h2 class='font-black mb-4'>🔠 GESTIONE NOMI</h2>",
"            <div id='valList'></div><hr class='my-4 border-zinc-800'>",
"            <button class='btn btn-primary w-full mb-4' onclick='scanDuplicates()'>SCANSIONA DOPPIONI (60%)</button>",
"            <div id='dupeResults' class='mb-4'></div><hr class='my-4 border-zinc-800'>",
"            <div class='bg-zinc-900 p-4 rounded-lg border border-zinc-800 mb-4'>",
"                <h4 class='text-cyan-400 font-bold mb-3'>✂️ ABBREVIAZIONI VISIVE</h4>",
"                <div class='grid grid-cols-2 gap-3 mb-3'>",
"                    <input type='text' id='abbrOrig' placeholder='NOME INTERO (es: MILAN)'>",
"                    <input type='text' id='abbrShort' placeholder='CORTO (es: ACM)'>",
"                </div>",
"                <button class='btn btn-success w-full' onclick='addAbbr()'>SALVA ABBREVIAZIONE</button>",
"                <details class='mt-3'><summary class='cursor-pointer text-zinc-500 text-xs'>LISTA ABBREVIAZIONI ATTIVE</summary><div id='abbrList' class='mt-2'></div></details>",
"            </div>",
"            <div id='teamRegistry'></div><hr class='my-4 border-zinc-800'>",
"            <div class='bg-zinc-900 p-4 rounded-lg border border-zinc-800'>",
"                ID SORGENTE: <input type='number' id='mSrc' class='w-16'> ➔ TARGET: <input type='number' id='mTrg' class='w-16'>",
"                <button class='btn btn-danger ml-2' onclick='mergeManual()'>FONDI ORA</button>",
"            </div>",
"        </div>",
"    </div>",
"    <div id='adminModal' class='modal'>",
"        <div class='modal-content'>",
"            <span class='close-x' onclick=\"toggleModal('adminModal')\">✖️</span>",
"            <h2 class='font-black mb-4 text-cyan-400'>⚙️ AMMINISTRAZIONE</h2>",
"            <div id='admStats' class='p-4 bg-zinc-900 rounded-lg border border-zinc-800 mb-6 text-center'></div>",
"            <button class='btn btn-warning w-full mb-4 text-lg h-14' onclick=\"startSync('full')\">🚀 SYNC COMPLETO</button>",
"            <button id='promoBtn' class='btn btn-success w-full mb-4' style='display:none' onclick='transfer()'>PROMUOVI TUTTA LA DIGA</button>",
"            <hr class='my-4 border-zinc-800'><button class='btn btn-danger w-full' onclick='resetDB()'>RESET TOTALE RISULTATI</button>",
"        </div>",
"    </div>",
"    <script>",
"        var LEAGUES = []; var UNIQUE_COUNTRIES = []; var ABBR = []; var currentPage = 1, teamData = [], ignoredList = [], unknownData = []; var cMode = null, cPayload = null, searchTimeout = null;",
"        const lev = function(a, b) { var tmp = []; for (var i=0; i<=a.length; i++) tmp[i]=[i]; for (var j=0; j<=b.length; j++) tmp[0][j]=j; for (var i=1; i<=a.length; i++) for (var j=1; j<=b.length; j++) tmp[i][j] = Math.min(tmp[i-1][j]+1, tmp[i][j-1]+1, tmp[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return 1 - (tmp[a.length][b.length] / Math.max(a.length, b.length)); };",
"        function getLega(id) { for(var i=0; i<LEAGUES.length; i++) if(LEAGUES[i].id===id) return LEAGUES[i]; return null; }",
"        function toggleModal(id) { var m = document.getElementById(id); m.style.display = (m.style.display==='block')?'none':'block'; }",
"        function debouncedSearch() { clearTimeout(searchTimeout); searchTimeout = setTimeout(function(){ resetPage(); }, 500); }",
"        function logConsole(msg, type) { var c = document.getElementById('consoleLog'); var cName = type==='error'?'log-error':(type==='success'?'log-success':''); c.innerHTML += \"<div class='log-line \" + cName + \"'>\" + msg + \"</div>\"; c.scrollTop = c.scrollHeight; }",
"        function getSeasonsSince2000() { var seasons = []; var now = new Date(); var currentYear = now.getFullYear(); var endYear = now.getMonth() >= 6 ? currentYear : currentYear - 1; for (var y = 2000; y <= endYear; y++) { seasons.push(String(y).slice(-2) + String(y + 1).slice(-2)); } return seasons.reverse(); }",
"        function formatCard(val, type) { if(!val || val==='0') return '-'; var cls = type==='Y'?'card-yellow':'card-red'; return \"<span class='\"+cls+\"'>\"+val+\"</span>\"; }",
"        function applyAbbr(name) { if(!name) return ''; var n = name.toUpperCase(); for(var i=0; i<ABBR.length; i++) { if(n === ABBR[i].original) return ABBR[i].short; } return n; }",
"        async function initApp() { var res = await fetch('/api/leagues'); LEAGUES = await res.json(); var cSet = {}; for(var i=0; i<LEAGUES.length; i++) cSet[LEAGUES[i].country] = true; UNIQUE_COUNTRIES = Object.keys(cSet).sort(); var sel = document.getElementById('fLega'); sel.innerHTML = \"<option value=''>TUTTE LE LEGHE</option>\"; for(var i=0; i<LEAGUES.length; i++) if(LEAGUES[i].is_active) sel.innerHTML += \"<option value='\" + LEAGUES[i].id + \"'>\" + LEAGUES[i].name + \"</option>\"; loadMatches(); }",
"        async function loadMatches() { var l = document.getElementById('fLega').value, s = document.getElementById('fSeason').value, t = document.getElementById('fTeam').value; var res = await fetch('/api/matches?league=' + l + '&season=' + s + '&team=' + t + '&page=' + currentPage); var data = await res.json(); ABBR = data.abbr; var sSelect = document.getElementById('fSeason'); var curS = sSelect.value; var opt = \"<option value=''>STAGIONE</option>\"; for(var i=0; i<data.seasons.length; i++) { var v = data.seasons[i]; opt += \"<option value='\" + v + \"' \" + (v===curS?\"selected\":\"\") + \">\" + v + \"</option>\"; } sSelect.innerHTML = opt; document.getElementById('pageInfo').innerText = \"PAGINA \" + currentPage + \" (TOTALE: \" + data.total + \")\"; document.getElementById('prevBtn').disabled = (currentPage === 1); document.getElementById('nextBtn').disabled = (data.matches.length < 100); var tbody = \"\"; for(var i=0; i<data.matches.length; i++) { var m = data.matches[i]; var leg = getLega(m.div); var col = leg ? leg.color : '#333'; var txtCol = leg ? leg.text_color : '#FFF'; var ht = (m.hthg !== null) ? (m.hthg + '-' + m.htag) : '-'; tbody += \"<tr><td>\" + new Date(m.date).toLocaleDateString('it-IT') + \"</td><td><span class='div-tag' style='background:\" + col + \"; color:\" + txtCol + \"'>\" + m.div + \"</span></td><td class='t-name' title='\"+m.home_name+\"'>\" + applyAbbr(m.home_name) + \"</td><td class='t-name col-away sep-r' title='\"+m.away_name+\"'>\" + applyAbbr(m.away_name) + \"</td><td>\" + m.fthg + \"-\" + m.ftag + \"</td><td class='sep-r'>\" + ht + \"</td><td>\" + formatCard(m.hy,'Y') + \"</td><td class='col-away'>\" + formatCard(m.ay,'Y') + \"</td><td>\" + formatCard(m.hr,'R') + \"</td><td class='col-away sep-r'>\" + formatCard(m.ar,'R') + \"</td><td>\" + (m.hs||'-') + \"</td><td class='col-away'>\" + (m.as_stats||'-') + \"</td><td>\" + (m.hst||'-') + \"</td><td class='col-away sep-r'>\" + (m.ast||'-') + \"</td><td>\" + (m.hf||'-') + \"</td><td class='col-away'>\" + (m.af||'-') + \"</td><td>\" + (m.hc||'-') + \"</td><td class='col-away'>\" + (m.ac||'-') + \"</td></tr>\"; } document.getElementById('matchTable').innerHTML = tbody; }",
"        async function startSync(type, singleId) {",
"            if(type==='full') toggleModal('adminModal'); else toggleModal('leaguesModal');",
"            toggleModal('consoleModal'); document.getElementById('consoleLog').innerHTML = \"\";",
"            logConsole(\"AVVIO SINCRONIZZAZIONE...\", \"success\");",
"            var seasons = getSeasonsSince2000(); var list = [];",
"            if(singleId) { list.push(getLega(singleId)); }",
"            else { for(var i=0; i<LEAGUES.length; i++) if(LEAGUES[i].is_active) list.push(LEAGUES[i]); }",
"            for(var i=0; i<list.length; i++) {",
"                var l = list[i]; logConsole(\"--- ELABORAZIONE \" + l.name + \" ---\", \"\");",
"                if(l.type==='extra') {",
"                    var res = await fetch('/api/admin/sync-single', { method:'POST', body: JSON.stringify({leagueId: l.id, fullFile: true}) });",
"                    var data = await res.json(); if(data.success) logConsole(\"✅ Storico completato.\", \"success\");",
"                } else {",
"                    for(var j=0; j<seasons.length; j++) {",
"                        var s = seasons[j]; logConsole(\"Stagione \" + s + \"...\", \"\");",
"                        var retry = 0; var success = false;",
"                        while(retry < 3 && !success) {",
"                            try {",
"                                var res = await fetch('/api/admin/sync-single', { method:'POST', body: JSON.stringify({leagueId: l.id, season: s, fullFile: true}) });",
"                                var data = await res.json();",
"                                if(data.success) { if(data.skipped) logConsole(\"⏭️ Già presente.\", \"\"); else logConsole(\"✅ OK\", \"success\"); success = true; }",
"                                else { retry++; if(retry<3) logConsole(\"⚠️ Riprovo...\", \"\"); }",
"                            } catch(e) { retry++; }",
"                            await new Promise(r => setTimeout(r, 300));",
"                        }",
"                    }",
"                }",
"            }",
"            logConsole(\"🏁 OPERAZIONE COMPLETATA.\", \"success\"); loadMatches();",
"        }",
"        async function openNames() { if (document.getElementById('namesModal').style.display !== 'block') toggleModal('namesModal'); var res = await fetch('/api/admin/status'); var data = await res.json(); teamData = data.teams; ignoredList = data.ignored; unknownData = data.unknown; var unkHtml = \"\"; if(unknownData.length > 0) { for(var i=0; i<unknownData.length; i++) { var u = unknownData[i]; var best = {name:'Nuova', score:0, id:null}; for(var j=0; j<teamData.length; j++) { var s = lev(u.name.toLowerCase(), teamData[j].name.toLowerCase()); if(s>best.score) { best.score = s; best.name = teamData[j].name; best.id = teamData[j].id; } } unkHtml += \"<div class='val-box bg-zinc-900 border-zinc-700 text-white'><b>\" + u.name + \"</b> <small class='text-cyan-400'>[\" + u.country + \"]</small><br><button class='btn btn-success mt-2' onclick=\\\"validate('\" + u.name.replace(/'/g, \"\\\\'\") + \"', null, true, '\" + u.country + \"')\\\">NUOVA</button>\" + (best.score > 0.6 ? \" <button class='btn btn-primary mt-2 ml-2' onclick=\\\"validate('\" + u.name.replace(/'/g, \"\\\\'\") + \"', \" + best.id + \", false)\\\">USA \" + best.name + \"</button>\" : \"\") + \"</div>\"; } } else { unkHtml = \"<span style='color:#22c55e; font-weight:bold'>✅ Tutto mappato correttamente!</span>\"; } document.getElementById('valList').innerHTML = unkHtml; var grouped = {}; for(var i=0; i<teamData.length; i++) { var t = teamData[i]; if(!grouped[t.country]) grouped[t.country]=[]; grouped[t.country].push(t); } var regHtml = \"\"; var keys = Object.keys(grouped).sort(); for(var i=0; i<keys.length; i++) { var c = keys[i]; var arr = grouped[c]; regHtml += \"<details class='border border-zinc-800 mb-2 rounded-lg'><summary class='p-3 cursor-pointer bg-zinc-900 font-bold'>\" + c + \" (\" + arr.length + \")</summary>\"; for(var j=0; j<arr.length; j++) { var t=arr[j]; regHtml += \"<div class='team-row'><span>[\" + t.id + \"] <b>\" + t.name + \"</b> <span class='action-icon' onclick=\\\"promptCountry('edit', {teamId:\"+t.id+\"})\\\">✏️</span> <span class='action-icon' onclick=\\\"openSplit(\"+t.id+\", '\"+(t.aliases||'').replace(/'/g,\"\\\\'\")+\"')\\\">➗</span></span><small class='text-zinc-500'>\"+(t.aliases||'')+\"</small></div>\"; } regHtml += \"</details>\"; } document.getElementById('teamRegistry').innerHTML = regHtml; loadAbbr(); }",
"        async function loadAbbr() { var res = await fetch('/api/admin/abbr'); var data = await res.json(); var html = \"<table width='100%'>\"; for(var i=0; i<data.length; i++) { html += \"<tr class='border-b border-zinc-800'><td>\"+data[i].original+\"</td><td>➔</td><td>\"+data[i].short+\"</td><td align='right'><button class='text-red-500' onclick=\\\"delAbbr('\"+data[i].original+\"')\\\">🗑️</button></td></tr>\"; } document.getElementById('abbrList').innerHTML = html + \"</table>\"; }",
"        async function addAbbr() { var o = document.getElementById('abbrOrig').value; var s = document.getElementById('abbrShort').value; if(!o || !s) return; await fetch('/api/admin/abbr-add', { method:'POST', body: JSON.stringify({original:o, short:s}) }); document.getElementById('abbrOrig').value=''; document.getElementById('abbrShort').value=''; loadAbbr(); loadMatches(); }",
"        async function delAbbr(o) { await fetch('/api/admin/abbr-del', { method:'POST', body: JSON.stringify({original:o}) }); loadAbbr(); loadMatches(); }",
"        async function validate(original, targetId, isNew, country) { if (isNew) { await fetch('/api/admin/validate', { method:'POST', body: JSON.stringify({original:original, targetId:targetId, isNew:isNew, country: country}) }); openNames(); } else { await fetch('/api/admin/validate', { method:'POST', body: JSON.stringify({original:original, targetId:targetId, isNew:isNew}) }); openNames(); } }",
"        function promptCountry(mode, payload) { cMode = mode; cPayload = payload; var sel = document.getElementById('countrySelect'); var opt = \"<option value=''>-- SELEZIONA --</option>\"; for(var i=0; i<UNIQUE_COUNTRIES.length; i++) opt += \"<option value='\"+UNIQUE_COUNTRIES[i]+\"'>\"+UNIQUE_COUNTRIES[i]+\"</option>\"; sel.innerHTML = opt; document.getElementById('countryCustom').value = ''; toggleModal('countryModal'); }",
"        async function confirmCountry() { var finalC = document.getElementById('countryCustom').value.trim().toUpperCase() || document.getElementById('countrySelect').value; if(!finalC) return; toggleModal('countryModal'); var pay = Object.assign({}, cPayload); if (cMode === 'new') { pay.country = finalC; await fetch('/api/admin/validate', { method:'POST', body: JSON.stringify(pay) }); } else if (cMode === 'split') { pay.country = finalC; await fetch('/api/admin/split', { method:'POST', body: JSON.stringify(pay) }); } else { pay.newCountry = finalC; await fetch('/api/admin/update-team-country', { method:'POST', body: JSON.stringify(pay) }); } openNames(); }",
"        function openSplit(teamId, aliasesStr) { var aliases = aliasesStr.split(' | '); var html = \"\"; for(var i=0; i<aliases.length; i++) { var a = aliases[i]; if(a) html += \"<button class='btn bg-zinc-800 text-white w-full mb-2 text-left p-3' onclick=\\\"execSplit('\"+a.replace(/'/g,\"\\\\'\")+\"', \"+teamId+\")\\\">➗ STACCA: <b>\"+a+\"</b></button>\"; } document.getElementById('aliasList').innerHTML = html; toggleModal('splitModal'); }",
"        function execSplit(alias, teamId) { toggleModal('splitModal'); promptCountry('split', { alias:alias, currentTeamId: teamId }); }",
"        async function scanDuplicates() { document.getElementById('dupeResults').innerHTML = \"<div class='p-4'>Scansione...</div>\"; var grouped = {}; for(var i=0; i<teamData.length; i++) { var t = teamData[i]; if(!grouped[t.country]) grouped[t.country]=[]; grouped[t.country].push(t); } var html = \"\"; for (var c in grouped) { var dup = \"\"; var list = grouped[c]; for (var i=0; i<list.length; i++) { for (var j=i+1; j<list.length; j++) { var dk = Math.min(list[i].id, list[j].id) + \"-\" + Math.max(list[i].id, list[j].id); if (ignoredList.indexOf(dk) !== -1) continue; if (lev(list[i].name.toLowerCase(), list[j].name.toLowerCase()) >= 0.60) { dup += \"<div class='team-row bg-zinc-900 mb-1 rounded'><span>[\" + list[i].id + \"]\" + list[i].name + \" ↔ [\" + list[j].id + \"]\" + list[j].name + \"</span><div><button class='btn btn-primary' onclick=\\\"mergeManual(\" + list[j].id + \", \" + list[i].id + \")\\\">FONDI</button> <button class='btn bg-zinc-700 text-white ml-2' onclick=\\\"ignoreDupe('\" + dk + \"')\\\">OK</button></div></div>\"; } } } if(dup) html += \"<div class='p-2'><b class='text-cyan-400'>\" + c + \"</b>\" + dup + \"</div>\"; } document.getElementById('dupeResults').innerHTML = html || \"<div class='p-4 text-green-500 font-bold'>✅ Nessun doppione trovato.</div>\"; }",
"        async function ignoreDupe(id) { await fetch('/api/admin/ignore', { method:'POST', body: JSON.stringify({id:id}) }); var res = await fetch('/api/admin/status'); var data = await res.json(); ignoredList = data.ignored; scanDuplicates(); }",
"        async function mergeManual(s, t) { var src = s || document.getElementById('mSrc').value; var trg = t || document.getElementById('mTrg').value; if(!src || !trg || !confirm(\"Confermi fusione?\")) return; await fetch('/api/admin/merge', { method:'POST', body: JSON.stringify({sourceId: src, targetId: trg}) }); openNames(); }",
"        async function transfer() { toggleModal('adminModal'); logConsole(\"Promozione Diga...\", \"\"); toggleModal('consoleModal'); await fetch('/api/admin/transfer'); logConsole(\"✅ Diga Svuotata.\", \"success\"); loadMatches(); }",
"        async function resetDB() { if(prompt(\"Password RESET:\")===\"RESET\") { await fetch('/api/admin/reset', {method:'POST', body:JSON.stringify({password:\"RESET\"})}); location.reload(); } }",
"        async function openAdmin() { if(document.getElementById('adminModal').style.display !== 'block') toggleModal('adminModal'); var res = await fetch('/api/admin/status'); var data = await res.json(); document.getElementById('admStats').innerHTML = \"<div class='text-cyan-400 font-black mb-2'>ULTIMO AGGIORNAMENTO: \" + data.lastUpdate + \"</div><b>PROD:</b> \" + data.total + \" | <b>DIGA:</b> \" + data.staged; document.getElementById('promoBtn').style.display = (data.staged > 0 && data.unknown.length === 0) ? 'block' : 'none'; }",
"        async function openMatches() { toggleModal('matchModal'); var res = await fetch('/api/admin/league-status'); var data = await res.json(); var html = \"\"; for(var i=0; i<LEAGUES.length; i++){ var l=LEAGUES[i]; if(!l.is_active) continue; var pObj=data.prod.find(function(x){return x.div===l.id;}); var p=pObj?pObj.c:0; var sObj=data.staged.find(function(x){return x.div===l.id;}); var s=sObj?sObj.c:0; var scObj=data.seasons.find(function(x){return x.div===l.id;}); var sc=scObj?scObj.c:0; html += \"<tr class='border-b border-zinc-800'><td>\"+l.name+\"</td><td align='center'>\"+sc+\"</td><td align='center'>\"+p+\"</td><td align='center' class='\"+(s>0?\"text-red-500 font-black\":\"\")+\"'>\"+s+\"</td></tr>\"; } document.getElementById('statusTableBody').innerHTML = html; }",
"        async function openLeagues() {",
"            var res = await fetch('/api/leagues'); var data = await res.json();",
"            var activeHtml = \"<table width='100%'><thead><tr><th>TAG</th><th>ID</th><th>NOME</th><th>AZIONI</th></tr></thead><tbody>\";",
"            var archHtml = \"<table width='100%'><thead><tr><th>ID</th><th>NOME</th><th>AZIONI</th></tr></thead><tbody>\";",
"            for(var i=0; i<data.length; i++) {",
"                var l = data[i];",
"                if(l.is_active) {",
"                    activeHtml += \"<tr class='border-b border-zinc-800'><td><span class='div-tag' style='background:\"+l.color+\"; color:\"+l.text_color+\"'>\"+l.id+\"</span></td><td>\"+l.id+\"</td><td>\"+l.name+\"</td><td><button class='btn btn-primary' onclick=\\\"editLeague('\"+l.id+\"','\"+l.name.replace(/'/g,\"\\\\'\")+\"','\"+l.country.replace(/'/g,\"\\\\'\")+\"','\"+l.engine_country+\"','\"+l.color+\"','\"+l.text_color+\"','\"+l.type+\"')\\\">✏️</button> <button class='btn btn-warning ml-1' onclick=\\\"startSync('single','\"+l.id+\"')\\\">♻️</button> <button class='btn btn-danger ml-1' onclick=\\\"deleteLeague('\"+l.id+\"')\\\">🗑️</button></td></tr>\";",
"                } else {",
"                    archHtml += \"<tr class='border-b border-zinc-800'><td>\"+l.id+\"</td><td>\"+l.name+\"</td><td><button class='btn btn-success' onclick=\\\"restoreLeague('\"+l.id+\"')\\\">RIPRISTINA</button></td></tr>\";",
"                }",
"            }",
"            document.getElementById('leaguesList').innerHTML = activeHtml + \"</tbody></table>\";",
"            document.getElementById('archivedList').innerHTML = archHtml + \"</tbody></table>\";",
"            if(document.getElementById('leaguesModal').style.display !== 'block') toggleModal('leaguesModal');",
"        }",
"        function editLeague(id, name, country, engine, color, textColor, type) { document.getElementById('lId').value = id; document.getElementById('lName').value = name; document.getElementById('lCountry').value = country; document.getElementById('lEngine').value = engine; document.getElementById('lColor').value = color; document.getElementById('lHex').value = color; document.getElementById('lTextColor').value = textColor; document.getElementById('lType').value = type; }",
"        async function addLeague() {",
"            var l = { id: document.getElementById('lId').value, name: document.getElementById('lName').value, country: document.getElementById('lCountry').value, engine_country: document.getElementById('lEngine').value, color: document.getElementById('lColor').value, text_color: document.getElementById('lTextColor').value, type: document.getElementById('lType').value };",
"            if(!l.id || !l.name) return alert('Compila i campi!');",
"            await fetch('/api/admin/add-league', { method:'POST', body: JSON.stringify(l) });",
"            document.getElementById('lId').value=''; document.getElementById('lName').value=''; document.getElementById('lCountry').value=''; document.getElementById('lEngine').value='';",
"            openLeagues(); initApp();",
"        }",
"        async function deleteLeague(id) { if(!confirm('Eliminare partite e archiviare lega?')) return; await fetch('/api/admin/delete-league', { method:'POST', body: JSON.stringify({id:id}) }); openLeagues(); initApp(); }",
"        async function restoreLeague(id) { await fetch('/api/admin/restore-league', { method:'POST', body: JSON.stringify({id:id}) }); openLeagues(); initApp(); }",
"        function resetPage() { currentPage = 1; loadMatches(); }",
"        function changePage(d) { currentPage += d; if(currentPage < 1) currentPage = 1; loadMatches(); }",
"        initApp();",
"    </script>",
"</body>",
"</html>"
  ].join("\n");
  return lines;
}