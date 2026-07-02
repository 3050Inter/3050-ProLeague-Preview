const $ = id => document.getElementById(id);
let CFG = {}, ROSTERS = {}, PLAYERS = {}, TEMPLATE = null, MATCHES = [], ACTUAL_RESULTS = [];
const state = { sets: [] };
const OFFICIAL_TEAMS = ['Team1k', '외모지상주의', 'JD', 'Team최강파파', 'WorldClass', 'KHAN'];
const TIERS = ['갓', '킹', '퀸', '잭', '스페이드', '조커', '히든'];
const DEFAULT_MAPS = ['투혼', '폴스타', '녹아웃', '매치포인트', '실피드', '옥타곤', '폴리포이드', '네오실피드', '라데온', '애티튜드'];
const raceMap = { z:'Z', p:'P', t:'T', '저그':'Z', '프로토스':'P', '토스':'P', '테란':'T', zerg:'Z', protoss:'P', terran:'T' };

const displayName = v => (v ?? '').toString().replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ').replace(/[\s　]+/g, ' ').trim();
const normalize = v => displayName(v).replace(/[\s　]+/g, '').toLowerCase();
function cleanPlayerName(v){
  let s = displayName(v);
  s = s.replace(/^\d+\.?\s*/, '');
  s = s.replace(/\s*[\(\[\{](?:T|P|Z|테란|토스|프로토스|저그|Terran|Protoss|Zerg)[\)\]\}]\s*$/i, '');
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return s;
}
const playerKey = v => normalize(cleanPlayerName(v));
function log(msg, cls=''){ const el = $('status'); if(el) el.innerHTML = cls ? `<span class="${cls}">${msg}</span>` : msg; }
async function loadJSON(path){ return fetch(path + '?v=' + Date.now()).then(r => r.json()); }
function option(sel, val, text){ if(!sel) return; const o = document.createElement('option'); o.value = val; o.textContent = text ?? val; sel.appendChild(o); }
function fillSelect(sel, arr, selected){ if(!sel) return; const old = selected ?? sel.value; sel.innerHTML = ''; (arr || []).forEach(v => option(sel, v)); if(old && (arr || []).includes(old)) sel.value = old; }
function emptyTeam(){ return { 감독:'-', 부감독:'-', 보호선수:'-', players:[] }; }
function makeEmptyRosters(){ const r = {}; OFFICIAL_TEAMS.forEach(t => r[t] = emptyTeam()); return r; }
function cleanTeamName(v){ const s = displayName(v); const hit = OFFICIAL_TEAMS.find(t => normalize(t) === normalize(s)); return hit || s; }
function isOfficialTeam(v){ return OFFICIAL_TEAMS.some(t => normalize(t) === normalize(v)); }
function teamCount(rosters){ return Object.values(rosters || {}).reduce((a,t) => a + ((t.players || []).length), 0); }

function csvParse(text){
  const rows=[]; let row=[], cur='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(q){ if(c==='"' && n==='"'){ cur+='"'; i++; } else if(c==='"') q=false; else cur+=c; }
    else { if(c==='"') q=true; else if(c===','){ row.push(cur); cur=''; } else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; } else if(c !== '\r') cur+=c; }
  }
  row.push(cur); rows.push(row);
  return rows.filter(r => r.some(c => displayName(c) !== ''));
}
async function fetchSheet(sheet, id){
  const sid = id || CFG.sheetId;
  const url = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}&t=${Date.now()}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(res.status);
  const txt = await res.text();
  if(/^\s*</.test(txt)) throw new Error('CSV 아님/권한 확인');
  return csvParse(txt);
}
function colIndex(headers, patterns, fallback=-1){
  for(const p of patterns){ const idx = headers.findIndex(h => p.test(displayName(h))); if(idx >= 0) return idx; }
  return fallback;
}
function findHeader(rows, mode='general'){
  const max = Math.min(rows.length, 80);
  let best = 0, bestScore = -1;
  for(let i=0;i<max;i++){
    const line = rows[i].map(displayName);
    let score = 0;
    for(const h of line){
      if(/선수|닉|아이디|ID|이름|player|winner|loser|승자|패자|팀|감독/i.test(h)) score += 3;
      if(/elo|티어|종족|승|패|결과|상대|map|맵|보호|부감독|레이팅|점수|rating/i.test(h)) score += 2;
      if(mode === 'elo' && /elo|레이팅|점수|rating/i.test(h)) score += 5;
      if(mode === 'recent' && /승자|패자|선수.?1|선수.?2|결과|스코어|승패/i.test(h)) score += 5;
    }
    if(score > bestScore){ bestScore = score; best = i; }
  }
  return best;
}
function isPlayerLike(v){
  const s = cleanPlayerName(v);
  if(!s || s.length > 35) return false;
  if(/^(?:-|–|—|TRUE|FALSE)$/i.test(s)) return false;
  if(/날짜|맵|리그|경기|승자|패자|결과|선수|선수명단|종족|티어|ELO|팀명|감독|부감독|보호|승률|순위|랭킹|비고/i.test(s)) return false;
  if(/^(?:set|score|bo)$/i.test(s)) return false;
  if(/^\d+(?:\.\d+)?$/.test(s)) return false;
  if(/^\d+명$/.test(s)) return false;
  if(/^\d{4}[.\-/년]/.test(s)) return false;
  if(TIERS.some(t => normalize(t) === normalize(s))) return false;
  if(['t','p','z','테란','프로토스','토스','저그'].includes(normalize(s))) return false;
  if(isOfficialTeam(s)) return false;
  return /[A-Za-z가-힣0-9]/.test(s);
}
function splitTokens(cell){
  return displayName(cell)
    .split(/[\n\r,;\/]+|\s{2,}/g)
    .map(v => cleanPlayerName(v))
    .flatMap(v => v.includes(' ') ? v.split(/\s+/).map(cleanPlayerName) : [v])
    .filter(Boolean);
}
function addTeamPlayer(rosters, team, name, role='player'){
  team = cleanTeamName(team); name = cleanPlayerName(name);
  if(!team || !name) return;
  if(!rosters[team]) rosters[team] = emptyTeam();
  if(role === '감독'){ rosters[team].감독 = name; return; }
  if(role === '부감독'){ rosters[team].부감독 = name; return; }
  if(role === '보호선수'){ rosters[team].보호선수 = name; return; }
  if(!isPlayerLike(name)) return;
  if(!rosters[team].players.some(p => playerKey(p) === playerKey(name))) rosters[team].players.push(name);
}
function findTeamMarkers(rows){
  const markers = [];
  for(let r=0; r<rows.length; r++){
    for(let c=0; c<rows[r].length; c++){
      const cell = displayName(rows[r][c]);
      const next = displayName(rows[r][c+1]);
      if(/^팀명$/.test(cell) && isOfficialTeam(next)) markers.push({row:r, col:c, team:cleanTeamName(next), preferred:true});
      const m = cell.match(/^팀명\s+(.+)$/);
      if(m && isOfficialTeam(m[1])) markers.push({row:r, col:c, team:cleanTeamName(m[1]), preferred:true});
    }
  }
  if(markers.length) return dedupeMarkers(markers);
  for(let r=0; r<Math.min(rows.length, 60); r++){
    for(let c=0; c<rows[r].length; c++){
      const cell = displayName(rows[r][c]);
      if(isOfficialTeam(cell)) markers.push({row:r, col:c, team:cleanTeamName(cell), preferred:false});
    }
  }
  return dedupeMarkers(markers);
}
function dedupeMarkers(markers){
  markers.sort((a,b) => a.row-b.row || a.col-b.col);
  const out=[];
  for(const m of markers){
    if(out.some(x => x.team === m.team && Math.abs(x.row-m.row) <= 2 && Math.abs(x.col-m.col) <= 2)) continue;
    out.push(m);
  }
  return out;
}
function blockBounds(markers, idx, rows){
  const m = markers[idx];
  const sameRow = markers.filter(x => x.row === m.row && x.col > m.col).sort((a,b)=>a.col-b.col)[0];
  const sameColNext = markers.filter(x => x.col === m.col && x.row > m.row).sort((a,b)=>a.row-b.row)[0];
  return {
    startRow: m.row,
    endRow: sameColNext ? sameColNext.row - 1 : rows.length - 1,
    startCol: m.col,
    endCol: sameRow ? sameRow.col - 1 : Math.max(...rows.map(r => r.length)) - 1
  };
}
function rowsToTeamRosters(rows, sheetName){
  const rosters = {};
  const markers = findTeamMarkers(rows).filter(m => OFFICIAL_TEAMS.includes(cleanTeamName(m.team)));
  if(!markers.length) return rosters;
  markers.forEach((m, idx) => {
    const team = cleanTeamName(m.team);
    if(!rosters[team]) rosters[team] = emptyTeam();
    const b = blockBounds(markers, idx, rows);
    let raceRow = -1;
    for(let r=b.startRow; r<=Math.min(b.endRow, b.startRow + 12); r++){
      let races=0;
      for(let c=b.startCol; c<=b.endCol; c++){
        const v = normalize(rows[r]?.[c]);
        if(['t','p','z','테란','토스','프로토스','저그'].includes(v)) races++;
      }
      if(races >= 2){ raceRow = r; break; }
    }
    function roleValue(line, role){
      const safe = displayName(line).replace(/\s+/g, ' ');
      const label = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(?:^|\\s)' + label + '\\s*[:：]?\\s*(.*?)(?=\\s*(?:감독|부감독|보호선수)\\s*[:：]?|$)');
      const m = safe.match(re);
      return m ? cleanPlayerName(m[1]) : '';
    }
    for(let r=b.startRow; r<=Math.min(b.endRow, b.startRow + 8); r++){
      for(let c=b.startCol; c<=b.endCol; c++){
        const cell = displayName(rows[r]?.[c]);
        for(const line of cell.split(/[\n\r]+/)){
          const head = roleValue(line, '감독');
          const sub = roleValue(line, '부감독');
          const protectedP = roleValue(line, '보호선수');
          if(head) addTeamPlayer(rosters, team, head, '감독');
          if(sub) addTeamPlayer(rosters, team, sub, '부감독');
          if(protectedP) addTeamPlayer(rosters, team, protectedP, '보호선수');
        }
      }
    }
    const dataStart = raceRow >= 0 ? raceRow + 1 : b.startRow + 1;
    let blankRun = 0;
    for(let r=dataStart; r<=b.endRow; r++){
      const row = rows[r] || [];
      const blockCells = [];
      for(let c=b.startCol; c<=b.endCol; c++) blockCells.push(displayName(row[c]));
      if(blockCells.every(v => !v)){ blankRun++; if(blankRun >= 3) break; continue; }
      blankRun = 0;
      if(blockCells.some(v => /^팀명$/.test(v) || /^팀명\s+/.test(v))) break;
      for(const cell of blockCells){
        for(const token of splitTokens(cell)) addTeamPlayer(rosters, team, token, 'player');
      }
    }
  });
  Object.keys(rosters).forEach(t => {
    rosters[t].players = rosters[t].players.filter((v,i,a) => v && a.findIndex(x => playerKey(x) === playerKey(v)) === i);
  });
  return rosters;
}

function upsertPlayer(raw, data={}){
  const name = cleanPlayerName(raw);
  const key = playerKey(name);
  if(!key || !isPlayerLike(name)) return false;
  const old = PLAYERS[key] || {};
  const elo = Number(String(data.elo ?? '').replace(/[^0-9.]/g, ''));
  let race = displayName(data.race ?? old.race ?? '-');
  race = raceMap[normalize(race)] || race || '-';
  const tier = displayName(data.tier ?? old.tier ?? '-');
  PLAYERS[key] = {
    name: old.name || name,
    tier: tier && tier !== '-' ? tier : (old.tier || '-'),
    race: race && race !== '-' ? race : (old.race || '-'),
    elo: Number.isFinite(elo) && elo > 0 ? Math.round(elo) : (old.elo || 1500),
    recentGames: old.recentGames || [],
    recent: old.recent || '0승 0패',
    raceRecord: old.raceRecord || '0승\n0패',
    mapRecord: old.mapRecord || '0승 0패',
    source: [...new Set([...(old.source ? old.source.split('+') : []), data.source].filter(Boolean))].join('+')
  };
  return true;
}
function inferColumns(rows, hi, mode){
  const headers = (rows[hi] || []).map(displayName);
  const nameP = [/선수명/,/닉네임/,/^ID$/i,/아이디/,/^이름$/,/player/i,/name/i,/닉/];
  const eloP = [/^ELO$/i,/ELO/i,/레이팅/,/점수/,/rating/i,/현재.*점수/];
  const tierP = [/티어/,/현재티어/,/tier/i,/등급/];
  const raceP = [/종족/,/race/i];
  let nameI = colIndex(headers, nameP, -1);
  let eloI = colIndex(headers, eloP, -1);
  let tierI = colIndex(headers, tierP, -1);
  let raceI = colIndex(headers, raceP, -1);
  const width = Math.max(...rows.map(r => r.length));
  if(nameI < 0){
    let best={c:-1,n:-1};
    for(let c=0;c<width;c++){
      let n=0; for(let r=hi+1;r<Math.min(rows.length,hi+80);r++) if(isPlayerLike(rows[r]?.[c])) n++;
      if(n>best.n) best={c,n};
    }
    nameI = best.c;
  }
  if(eloI < 0 && mode === 'elo'){
    let best={c:-1,n:-1};
    for(let c=0;c<width;c++){
      let n=0; for(let r=hi+1;r<Math.min(rows.length,hi+120);r++){ const val=Number(String(rows[r]?.[c]||'').replace(/[^0-9.]/g,'')); if(val>=800 && val<=2600) n++; }
      if(n>best.n) best={c,n};
    }
    eloI = best.n>5 ? best.c : -1;
  }
  if(tierI < 0){
    let best={c:-1,n:-1};
    for(let c=0;c<width;c++){
      let n=0;
      for(let r=hi+1;r<Math.min(rows.length,hi+160);r++){
        const v = displayName(rows[r]?.[c]);
        if(TIERS.some(t => normalize(t) === normalize(v))) n++;
      }
      if(n>best.n) best={c,n};
    }
    tierI = best.n>3 ? best.c : -1;
  }
  if(raceI < 0){
    let best={c:-1,n:-1};
    for(let c=0;c<width;c++){
      let n=0;
      for(let r=hi+1;r<Math.min(rows.length,hi+160);r++){
        const v = normalize(rows[r]?.[c]);
        if(['t','p','z','테란','토스','프로토스','저그','terran','protoss','zerg'].includes(v)) n++;
      }
      if(n>best.n) best={c,n};
    }
    raceI = best.n>3 ? best.c : -1;
  }
  return {nameI, eloI, tierI, raceI, headers};
}
function rowsToPlayers(rows, sheetName, allowNoElo=false){
  const mode = allowNoElo ? 'roster' : 'elo';
  const hi = findHeader(rows, mode);
  const {nameI, eloI, tierI, raceI} = inferColumns(rows, hi, mode);
  let count = 0;
  if(nameI < 0) return 0;
  for(let r=hi+1; r<rows.length; r++){
    const row = rows[r] || [];
    const name = cleanPlayerName(row[nameI]);
    if(!isPlayerLike(name)) continue;
    const elo = eloI >= 0 ? row[eloI] : '';
    if(!allowNoElo){
      const n = Number(String(elo || '').replace(/[^0-9.]/g,''));
      if(!Number.isFinite(n) || n <= 0) continue;
    }
    const tier = tierI >= 0 ? displayName(row[tierI] || '-') : '-';
    const race = raceI >= 0 ? displayName(row[raceI] || '-') : '-';
    if(upsertPlayer(name, {tier, race, elo, source:sheetName})) count++;
  }
  return count;
}

function recordGame(name, result){
  const key = playerKey(name);
  if(!key || !isPlayerLike(name)) return false;
  if(!PLAYERS[key]) upsertPlayer(name, {source:'경기기록'});
  if(!PLAYERS[key]) return false;
  PLAYERS[key].recentGames = PLAYERS[key].recentGames || [];
  if(result === 'W' || result === 'L'){ PLAYERS[key].recentGames.push(result); return true; }
  return false;
}
function firstCol(headers, patterns){ return colIndex(headers || [], patterns, -1); }
function cellByPatterns(row, headers, patterns){ const i = firstCol(headers, patterns); return i >= 0 ? displayName(row?.[i]) : ''; }
function inferMap(row, headers){
  let m = cellByPatterns(row, headers, [/^맵$/,/맵\s*이름/,/map/i,/전장/]);
  if(!m){
    for(const cell of row || []){
      const v = displayName(cell);
      if((CFG.maps || DEFAULT_MAPS).some(x => normalize(x) === normalize(v))) { m = v; break; }
    }
  }
  return m;
}
function inferRace(row, headers, side, fallback){
  const pats = side === 1
    ? [/선수\s*1.*종족/,/1.*선수.*종족/,/p1.*race/i,/home.*race/i,/홈.*종족/,/종족\s*1/,/1p.*종족/i]
    : [/선수\s*2.*종족/,/2.*선수.*종족/,/p2.*race/i,/away.*race/i,/어웨이.*종족/,/종족\s*2/,/2p.*종족/i,/상대.*종족/];
  let r = cellByPatterns(row, headers, pats);
  r = raceMap[normalize(r)] || r;
  if(['T','P','Z'].includes(r)) return r;
  return fallback && fallback !== '-' ? fallback : '-';
}
function addMatch(p1, p2, p1Result, row=[], headers=[], source=''){
  p1 = cleanPlayerName(p1); p2 = cleanPlayerName(p2);
  if(!isPlayerLike(p1) || !isPlayerLike(p2) || playerKey(p1) === playerKey(p2)) return 0;
  const r1 = p1Result === 'W' ? 'W' : 'L';
  const r2 = r1 === 'W' ? 'L' : 'W';
  let cnt = 0;
  if(recordGame(p1, r1)) cnt++;
  if(recordGame(p2, r2)) cnt++;
  const i1 = infoOf(p1), i2 = infoOf(p2);
  MATCHES.push({
    p1, p2,
    p1k: playerKey(p1), p2k: playerKey(p2),
    winnerK: r1 === 'W' ? playerKey(p1) : playerKey(p2),
    loserK: r1 === 'W' ? playerKey(p2) : playerKey(p1),
    p1Race: inferRace(row, headers, 1, i1.race),
    p2Race: inferRace(row, headers, 2, i2.race),
    map: inferMap(row, headers),
    source
  });
  return cnt;
}
function wlText(w,l,vertical=false){ return vertical ? [`${w}승`, `${l}패`] : `${w}승 ${l}패`; }
function wlOneLine(v){
  if(Array.isArray(v)) return v.join(' ');
  return displayName(v).replace(/\s+/g,' ');
}
function statsFor(player, opponent, mapName){
  const pk = playerKey(player), ok = playerKey(opponent);
  const oppRace = infoOf(opponent).race;
  let hW=0,hL=0,rW=0,rL=0,mW=0,mL=0;
  MATCHES.forEach(m => {
    const asP1 = m.p1k === pk, asP2 = m.p2k === pk;
    if(!asP1 && !asP2) return;
    const oppK = asP1 ? m.p2k : m.p1k;
    const oppR = asP1 ? m.p2Race : m.p1Race;
    const won = m.winnerK === pk;
    if(ok && oppK === ok){ won ? hW++ : hL++; }
    if(oppRace && oppRace !== '-' && normalize(oppR) === normalize(oppRace)){ won ? rW++ : rL++; }
    if(mapName && m.map && normalize(m.map) === normalize(mapName)){ won ? mW++ : mL++; }
  });
  return { h2h:`${hW} : ${hL}`, raceRecordLines:wlText(rW,rL,true), mapRecord:`${mW}승 ${mL}패` };
}
function finalizeRecent(){
  Object.values(PLAYERS).forEach(p => {
    const games = (p.recentGames || []).slice(-10);
    const w = games.filter(x => x === 'W').length;
    const l = games.filter(x => x === 'L').length;
    p.recentGames = games;
    p.recent = `${w}승 ${l}패`;
  });
}
function rowsToRecent(rows, sheetName){
  const hi = findHeader(rows, 'recent');
  const headers = (rows[hi] || []).map(displayName);
  const winnerI = colIndex(headers, [/승자/,/승리.*선수/,/winner/i,/win\s*player/i,/이긴/], -1);
  const loserI = colIndex(headers, [/패자/,/패배.*선수/,/loser/i,/lose\s*player/i,/진/], -1);
  const nameI = colIndex(headers, [/선수명/,/닉네임/,/^ID$/i,/아이디/,/^이름$/,/player/i], -1);
  const resultI = colIndex(headers, [/승패/,/^결과$/,/result/i,/win.?lose/i], -1);
  const oppI = colIndex(headers, [/상대\s*선수/,/상대\s*명/,/^상대$/,/opponent/i,/vs/i], -1);
  const p1I = colIndex(headers, [/선수\s*1/,/선수.?1/,/player.?1/i,/^p1$/i,/1p/i,/home/i], -1);
  const p2I = colIndex(headers, [/선수\s*2/,/선수.?2/,/player.?2/i,/^p2$/i,/2p/i,/away/i,/상대/], -1);
  const scoreI = colIndex(headers, [/스코어/,/score/i,/set/i,/결과/], -1);
  let count = 0;
  for(let r=hi+1; r<rows.length; r++){
    const row = rows[r] || [];
    if(winnerI >= 0 && loserI >= 0){
      const w = cleanPlayerName(row[winnerI]), l = cleanPlayerName(row[loserI]);
      if(isPlayerLike(w) && isPlayerLike(l) && playerKey(w) !== playerKey(l)){
        count += addMatch(w, l, 'W', row, headers, sheetName); continue;
      }
    }
    if(nameI >= 0 && resultI >= 0){
      const n = cleanPlayerName(row[nameI]); const res = displayName(row[resultI]);
      if(isPlayerLike(n)){
        const opp = oppI >= 0 ? cleanPlayerName(row[oppI]) : '';
        if(/승|win|^w$/i.test(res)){
          if(isPlayerLike(opp) && playerKey(opp) !== playerKey(n)) count += addMatch(n, opp, 'W', row, headers, sheetName);
          else if(recordGame(n,'W')) count++;
          continue;
        }
        if(/패|lose|loss|^l$/i.test(res)){
          if(isPlayerLike(opp) && playerKey(opp) !== playerKey(n)) count += addMatch(n, opp, 'L', row, headers, sheetName);
          else if(recordGame(n,'L')) count++;
          continue;
        }
      }
    }
    if(p1I >= 0 && p2I >= 0){
      const p1 = cleanPlayerName(row[p1I]), p2 = cleanPlayerName(row[p2I]);
      const res = displayName(scoreI >= 0 ? row[scoreI] : '');
      if(isPlayerLike(p1) && isPlayerLike(p2)){
        const nums = res.match(/(\d+)\D+(\d+)/);
        if(nums){ const a=+nums[1], b=+nums[2]; if(a!==b){ count += addMatch(p1, p2, a>b?'W':'L', row, headers, sheetName); continue; } }
        if(/1\s*승|p1|home|선수1/i.test(res)){ count += addMatch(p1, p2, 'W', row, headers, sheetName); continue; }
        if(/2\s*승|p2|away|선수2/i.test(res)){ count += addMatch(p1, p2, 'L', row, headers, sheetName); continue; }
      }
    }
    const known = [];
    row.forEach(cell => splitTokens(cell).forEach(tok => { if(PLAYERS[playerKey(tok)] && !known.some(x => playerKey(x) === playerKey(tok))) known.push(tok); }));
    if(known.length >= 2){
      const line = row.map(displayName).join(' ');
      const nums = line.match(/(\d+)\D+(\d+)/);
      if(nums){ const a=+nums[1], b=+nums[2]; if(a!==b){ count += addMatch(known[0], known[1], a>b?'W':'L', row, headers, sheetName); } }
    }
  }
  return count;
}
function parseMaps(rows){
  // V28: MapDATA 주변의 '프로리그1', '검색' 같은 문구가 맵 목록에 섞이는 문제 방지.
  // 공식 맵 화이트리스트만 허용하고, 구글시트에 있는 순서를 우선 반영한다.
  const official = CFG.maps || DEFAULT_MAPS;
  const out = [];
  const addMap = (value) => {
    const s = displayName(value);
    if(!s) return;
    const found = official.find(m => normalize(m) === normalize(s));
    if(found && !out.some(x => normalize(x) === normalize(found))) out.push(found);
  };

  // 1순위: '맵', 'MAP', 'map' 헤더가 있는 열만 먼저 읽기
  const hi = findHeader(rows, 'map');
  const headers = (rows[hi] || []).map(displayName);
  const mapCols = headers
    .map((h, i) => (/^맵$|맵\s*이름|^map$/i.test(h) ? i : -1))
    .filter(i => i >= 0);
  if(mapCols.length){
    for(let r=hi+1; r<rows.length; r++) mapCols.forEach(c => addMap(rows[r]?.[c]));
  }

  // 2순위: 헤더 열에서 충분히 못 찾으면 전체 셀 중 공식맵과 정확히 일치하는 값만 읽기
  if(out.length < 3){
    rows.flat().forEach(addMap);
  }

  // 3순위: 빠진 공식맵은 기본 목록 순서대로 보충. 특히 폴스타 누락 방지.
  official.forEach(addMap);
  return out;
}

function infoOf(name){ return PLAYERS[playerKey(name)] || { name:cleanPlayerName(name), tier:'-', race:'-', elo:1500, recent:'0승 0패', recentGames:[], raceRecord:'0승\n0패', mapRecord:'0승 0패' }; }
function prob(homeElo, awayElo){
  homeElo=Number(homeElo)||1500; awayElo=Number(awayElo)||1500;
  let p=1/(1+Math.pow(10,(awayElo-homeElo)/400));
  let pct=Math.round(p*100);
  pct=Math.max(CFG.eloClampMin??1, Math.min(CFG.eloClampMax??99,pct));
  return pct;
}
function clampPct(p){ return Math.max(CFG.eloClampMin??1, Math.min(CFG.eloClampMax??99, Math.round(p))); }
function mapStatsRaw(player, mapName){
  const pk = playerKey(player), mk = normalize(mapName);
  let w=0,l=0;
  if(!pk || !mk) return {w,l,n:0,rate:0.5};
  MATCHES.forEach(m=>{
    if(!m.map || normalize(m.map)!==mk) return;
    if(m.p1k!==pk && m.p2k!==pk) return;
    if(m.winnerK===pk) w++; else l++;
  });
  const n=w+l;
  // 베이지안 보정: 표본이 적을 때 50%로 당겨서 1~2판 전적 왜곡 방지
  const rate=(w+2)/(n+4);
  return {w,l,n,rate};
}
function mapAdjust(homeName, awayName, mapName){
  const hs=mapStatsRaw(homeName,mapName), as=mapStatsRaw(awayName,mapName);
  const total=hs.n+as.n;
  if(!mapName || total<3) return 0;
  // 3~19전은 약하게, 20전 이상부터 최대 반영
  const confidence=Math.min(1, total/20);
  const edge=hs.rate-as.rate;
  // 최대 약 ±12%p 보정. 맵 때문에 승률은 움직이되 ELO를 완전히 뒤집지는 않게 제한
  const adj=Math.max(-12, Math.min(12, edge*26*confidence));
  return adj;
}
function predictedProb(homeName, awayName, mapName){
  const h=infoOf(homeName), a=infoOf(awayName);
  const base=prob(h.elo,a.elo);
  return clampPct(base + mapAdjust(homeName, awayName, mapName));
}
function pctColor(p){ p=Number(p)||0; if(p>=70)return CFG.colors.green; if(p>=55)return CFG.colors.yellow; if(p>=45)return CFG.colors.white; if(p>=30)return CFG.colors.orange; return CFG.colors.red; }


function normalizeDate(v){
  const s = displayName(v);
  if(!s) return '';
  const nums = s.match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
  if(nums) return `${nums[1]}.${String(+nums[2]).padStart(2,'0')}.${String(+nums[3]).padStart(2,'0')}`;
  return s.replace(/-/g,'.').replace(/\s+/g,'');
}
function addActualResult({date='', set='', map='', p1='', p2='', winner='', loser='', source=''}){
  p1=cleanPlayerName(p1); p2=cleanPlayerName(p2); winner=cleanPlayerName(winner); loser=cleanPlayerName(loser);
  if(!winner && p1 && p2 && loser){ winner = playerKey(loser) === playerKey(p1) ? p2 : p1; }
  if(!loser && p1 && p2 && winner){ loser = playerKey(winner) === playerKey(p1) ? p2 : p1; }
  if(!p1 && winner) p1 = winner;
  if(!p2 && loser) p2 = loser;
  if(!isPlayerLike(winner) || !isPlayerLike(loser) || playerKey(winner)===playerKey(loser)) return false;
  ACTUAL_RESULTS.push({
    date: normalizeDate(date), set: displayName(set), map: displayName(map),
    p1, p2, winner, loser,
    p1k: playerKey(p1), p2k: playerKey(p2), winnerK: playerKey(winner), loserK: playerKey(loser),
    pairKey: [playerKey(winner), playerKey(loser)].sort().join('|'), source
  });
  return true;
}
function rowsToActualResults(rows, sheetName){
  const hi=findHeader(rows,'recent');
  const headers=(rows[hi]||[]).map(displayName);
  const dateI=colIndex(headers,[/^날짜$/,/일자/,/경기.*일/,/date/i],0);
  const mapI=colIndex(headers,[/^맵$/,/맵.*이름/,/map/i,/전장/],7);
  const setI=colIndex(headers,[/^set$/i,/세트/,/^SET$/],-1);

  // S11PlayerResult는 구조가 고정입니다.
  // C열 = 승자선수, F열 = 패자선수. 이 기준을 최우선으로 사용합니다.
  // A:날짜, B:승자티어, C:승자선수, D:승자종족, E:패자티어, F:패자선수, G:패자종족, H:맵
  let winnerI = 2;
  let loserI = 5;

  // 다른 탭을 읽을 가능성까지 대비해서, C/F가 헤더 구조와 맞지 않을 때만 헤더명으로 보정합니다.
  const headerWinnerI=colIndex(headers,[/^승자선수$/,/승자.*선수/,/승리.*선수/,/winner/i,/이긴.*선수/],-1);
  const headerLoserI=colIndex(headers,[/^패자선수$/,/패자.*선수/,/패배.*선수/,/loser/i,/진.*선수/],-1);
  if(!/S11PlayerResult/i.test(sheetName) && headerWinnerI>=0 && headerLoserI>=0){
    winnerI=headerWinnerI; loserI=headerLoserI;
  }

  let count=0;
  for(let r=hi+1;r<rows.length;r++){
    const row=rows[r]||[];
    const date=dateI>=0?row[dateI]:row[0];
    const set=setI>=0?row[setI]:'';
    const map=mapI>=0?row[mapI]:inferMap(row,headers);
    const winner=winnerI>=0?row[winnerI]:'';
    const loser=loserI>=0?row[loserI]:'';
    if(addActualResult({date,set,map,p1:winner,p2:loser,winner,loser,source:sheetName})) count++;
  }
  return count;
}
function findActualFor(row){
  const date=normalizeDate($('date')?.value||'');
  const hk=playerKey(row.hn), ak=playerKey(row.an);
  const pair=[hk, ak].sort().join('|');
  const mapK=normalize(row.map);
  const candidates=ACTUAL_RESULTS.filter(a => {
    const dateOk = !date || !a.date || a.date===date;
    const pairOk = a.pairKey===pair;
    const playerOk = (a.winnerK===hk && a.loserK===ak) || (a.winnerK===ak && a.loserK===hk);
    return dateOk && pairOk && playerOk;
  });
  if(!candidates.length) return null;
  return candidates.find(a => mapK && normalize(a.map)===mapK) || candidates[0];
}

const HISTORY_KEY = '3050_prediction_history_v1';
function loadPredictionHistory(){
  try{ return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}') || {}; }
  catch(e){ return {}; }
}
function savePredictionHistory(obj){
  try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(obj || {})); }
  catch(e){ console.warn('history save failed', e); }
}
function predictionHistoryKey(date, map, p1, p2){
  const pair=[playerKey(p1), playerKey(p2)].sort().join('_vs_');
  return `${normalizeDate(date||'')}_${normalize(map||'')}_${pair}`;
}
function upsertPredictionHistory(rec){
  const hist=loadPredictionHistory();
  hist[rec.key]=Object.assign({}, hist[rec.key]||{}, rec, {updatedAt:new Date().toISOString()});
  savePredictionHistory(hist);
}
function currentTeamNames(){
  return {home:$('homeTeam')?.value||'', away:$('awayTeam')?.value||''};
}
function historyRecords(){ return Object.values(loadPredictionHistory()).sort((a,b)=>(a.date||'').localeCompare(b.date||'') || (a.set||0)-(b.set||0)); }
function renderHistorySummary(){
  const recs=historyRecords();
  const box=$('historyBox');
  if(!box) return;
  if(!recs.length){ box.textContent='저장된 로컬 히스토리가 없습니다. 결과 검증 또는 분석 리포트를 누르면 저장됩니다.'; return; }
  const total=recs.length, hit=recs.filter(r=>r.hit).length;
  const byDate={}; recs.forEach(r=>{ const d=r.date||'미상'; (byDate[d] ||= {n:0,h:0}); byDate[d].n++; if(r.hit) byDate[d].h++; });
  const lines=[];
  lines.push(`로컬 예측 히스토리: ${hit}/${total} 적중 (${Math.round(hit/total*100)}%)`);
  lines.push(`저장 위치: 이 브라우저 LocalStorage (구글시트 수정 없음)`);
  lines.push('');
  Object.entries(byDate).sort().forEach(([d,v])=>lines.push(`${d}: ${v.h}/${v.n} (${Math.round(v.h/v.n*100)}%)`));
  lines.push('');
  lines.push('최근 기록');
  recs.slice(-12).reverse().forEach(r=>{
    lines.push(`${r.date} SET${r.set} ${r.map} ${r.home} vs ${r.away} | 예측 ${r.predictedWinner} ${r.predictedPct}% / 실제 ${r.actualWinner} ${r.hit?'✅':'❌'}`);
  });
  box.textContent=lines.join('\n');
}
function clearPredictionHistory(){
  if(!confirm('로컬 예측 히스토리를 초기화할까요? 구글시트 데이터는 건드리지 않습니다.')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistorySummary();
  log('로컬 예측 히스토리를 초기화했습니다.', 'good');
}
function recordPredictionResult(r, actual, predName, predPct, ok){
  const date=normalizeDate($('date')?.value||'');
  const teams=currentTeamNames();
  const key=predictionHistoryKey(date, r.map, r.hn, r.an);
  upsertPredictionHistory({
    key, date, set:r.set, map:r.map,
    homeTeam:teams.home, awayTeam:teams.away,
    home:r.hn, away:r.an,
    predictedWinner:predName,
    predictedPct:predPct,
    actualWinner:actual.winner,
    actualLoser:actual.loser,
    hit:!!ok,
    homePct:r.hp, awayPct:r.ap,
    modelVersion:'V34'
  });
}

function verifyCurrentPredictions(){
  const c=calc();
  let checked=0, hit=0;
  const lines=[];
  c.rows.forEach(r=>{
    const actual=findActualFor(r);
    if(!actual){ lines.push(`${r.set}SET ${r.hn} vs ${r.an}: 결과 없음`); return; }
    const predIsHome = r.hp>=50;
    const predK = predIsHome ? playerKey(r.hn) : playerKey(r.an);
    const predName = predIsHome ? r.hn : r.an;
    const predPct = Math.max(r.hp, r.ap);
    const ok = predK === actual.winnerK;
    checked++; if(ok) hit++;
    const actualSide = actual.winnerK===playerKey(r.hn) ? 'HOME' : (actual.winnerK===playerKey(r.an) ? 'AWAY' : '');
    const predSide = predIsHome ? 'HOME' : 'AWAY';
    recordPredictionResult(r, actual, predName, predPct, ok);
    lines.push(`${r.set}SET ${r.hn} vs ${r.an}: 예측 ${predSide}(${predName}) ${ok?'✅':'❌'} / 실제 ${actualSide}(${actual.winner})`);
  });
  const pct = checked ? Math.round(hit/checked*100) : 0;
  const text = checked ? `검증 결과: ${hit}/${checked} 적중 (${pct}%)\n${lines.join('\n')}` : `검증 가능한 결과가 없습니다.\nS11PlayerResult 날짜/선수명/승자·패자 컬럼을 확인하세요.`;
  const el=$('resultCheck'); if(el) el.textContent=text;
  log(`예측 검증 완료\n${text}`, checked ? 'good' : 'warn');
}


function parseWLText(v){
  const t = Array.isArray(v) ? v.join(' ') : displayName(v);
  const m = t.match(/(\d+)\s*승\s*(\d+)\s*패/);
  if(m) return {w:+m[1], l:+m[2], n:+m[1]+(+m[2]), rate:(+m[1]+1)/((+m[1])+(+m[2])+2)};
  return {w:0,l:0,n:0,rate:0.5};
}
function recentRate(playerName){
  const p=infoOf(playerName), g=p.recentGames||[];
  const w=g.filter(x=>x==='W').length, l=g.filter(x=>x==='L').length, n=w+l;
  return {w,l,n,rate:n?(w+1)/(n+2):0.5};
}
function h2hRaw(player, opponent){
  const pk=playerKey(player), ok=playerKey(opponent);
  let w=0,l=0;
  MATCHES.forEach(m=>{
    const involved = m.p1k===pk || m.p2k===pk;
    const opp = m.p1k===ok || m.p2k===ok;
    if(!involved || !opp) return;
    if(m.winnerK===pk) w++; else l++;
  });
  const n=w+l;
  return {w,l,n,rate:n?(w+1)/(n+2):0.5};
}
function raceRaw(player, opponent){
  const pk=playerKey(player), oppRace=infoOf(opponent).race;
  let w=0,l=0;
  MATCHES.forEach(m=>{
    const asP1=m.p1k===pk, asP2=m.p2k===pk;
    if(!asP1 && !asP2) return;
    const oppR=asP1?m.p2Race:m.p1Race;
    if(!oppRace || oppRace==='-' || normalize(oppR)!==normalize(oppRace)) return;
    if(m.winnerK===pk) w++; else l++;
  });
  const n=w+l;
  return {w,l,n,rate:n?(w+1)/(n+2):0.5};
}
function sideName(diff, home, away){
  if(Math.abs(diff) < 0.001) return '중립';
  return diff > 0 ? home : away;
}
function factorSummary(r){
  const h=r.h, a=r.a;
  const eloDiff=(Number(h.elo)||1500)-(Number(a.elo)||1500);
  const hr=recentRate(r.hn), ar=recentRate(r.an);
  const hh=h2hRaw(r.hn,r.an), ah=h2hRaw(r.an,r.hn);
  const hRace=raceRaw(r.hn,r.an), aRace=raceRaw(r.an,r.hn);
  const hm=mapStatsRaw(r.hn,r.map), am=mapStatsRaw(r.an,r.map);
  const mapAdj=mapAdjust(r.hn,r.an,r.map);
  const base=prob(h.elo,a.elo);
  return {
    base, mapAdj,
    factors:[
      {name:'ELO', side:sideName(eloDiff,r.hn,r.an), note:`${h.elo} vs ${a.elo} (${eloDiff>0?'+':''}${eloDiff})`, strength:Math.min(3,Math.abs(eloDiff)/120)},
      {name:'최근10', side:sideName(hr.rate-ar.rate,r.hn,r.an), note:`${hr.w}-${hr.l} vs ${ar.w}-${ar.l}`, strength:Math.min(3,Math.abs(hr.rate-ar.rate)*5)},
      {name:'상대전적', side:sideName(hh.rate-ah.rate,r.hn,r.an), note:`${hh.w}-${hh.l} vs ${ah.w}-${ah.l}`, strength:hh.n+ah.n?Math.min(3,Math.abs(hh.rate-ah.rate)*5):0},
      {name:'종족전적', side:sideName(hRace.rate-aRace.rate,r.hn,r.an), note:`${hRace.w}-${hRace.l} vs ${aRace.w}-${aRace.l}`, strength:hRace.n+aRace.n?Math.min(3,Math.abs(hRace.rate-aRace.rate)*5):0},
      {name:'맵전적', side:sideName(hm.rate-am.rate,r.hn,r.an), note:`${r.map} ${hm.w}-${hm.l} vs ${am.w}-${am.l} / 보정 ${mapAdj>=0?'+':''}${mapAdj.toFixed(1)}%p`, strength:hm.n+am.n?Math.min(3,Math.abs(hm.rate-am.rate)*5):0}
    ]
  };
}
function confidenceBand(p){
  p=Number(p)||50;
  if(p>=75) return '강한 우세';
  if(p>=65) return '우세';
  if(p>=55) return '근소 우세';
  return '박빙';
}
function buildAnalysisReport(){
  const c=calc();
  let checked=0, hit=0;
  const bandStats={ '55~59':{h:0,n:0}, '60~69':{h:0,n:0}, '70+':{h:0,n:0}, '박빙':{h:0,n:0} };
  const lines=[];
  lines.push(`3050 예측 분석 리포트`);
  lines.push(`${$('date').value} ${$('time').value}  ${c.ht} vs ${c.at}`);
  lines.push(`데이터: S11Roaster / ELOrank / 경기기록 / S11PlayerResult`);
  lines.push('');
  c.rows.forEach(r=>{
    const fs=factorSummary(r);
    const predName = r.hp>=50 ? r.hn : r.an;
    const predPct = Math.max(r.hp,r.ap);
    const actual=findActualFor(r);
    let result='결과 없음', ok=null;
    if(actual){
      ok = playerKey(predName)===actual.winnerK;
      checked++; if(ok) hit++;
      recordPredictionResult(r, actual, predName, predPct, ok);
      result = `실제 ${actual.winner} 승 ${ok?'✅ 적중':'❌ 실패'}`;
      const key=predPct>=70?'70+':predPct>=60?'60~69':predPct>=55?'55~59':'박빙';
      bandStats[key].n++; if(ok) bandStats[key].h++;
    }
    lines.push(`SET${r.set} · ${r.map}`);
    lines.push(`예측: ${predName} ${predPct}% (${confidenceBand(predPct)}) / ${result}`);
    lines.push(`기본 ELO확률: ${fs.base}% → 맵보정 후: ${r.hp}% : ${r.ap}%`);
    lines.push(`근거:`);
    fs.factors.forEach(f=>{
      const mark = f.side==='중립' ? '·' : (f.side===predName ? '▲' : '▼');
      lines.push(`  ${mark} ${f.name}: ${f.side} / ${f.note}`);
    });
    if(actual && !ok){
      const supportsPred=fs.factors.filter(f=>f.side===predName).map(f=>f.name);
      const supportsActual=fs.factors.filter(f=>f.side===actual.winner).map(f=>f.name);
      lines.push(`오답 해석: 예측 근거(${supportsPred.join(', ')||'없음'})보다 실제 승자 우세 요인(${supportsActual.join(', ')||'없음'}) 또는 변수 영향이 컸을 가능성`);
    }
    lines.push('');
  });
  if(checked){
    lines.push(`요약: ${hit}/${checked} 적중 (${Math.round(hit/checked*100)}%)`);
    Object.entries(bandStats).forEach(([k,v])=>{ if(v.n) lines.push(`- ${k} 구간: ${v.h}/${v.n} 적중 (${Math.round(v.h/v.n*100)}%)`); });
    lines.push('');
    lines.push('※ 이 리포트는 현재 입력된 6세트 예측과 S11PlayerResult의 실제 결과를 비교합니다. 가중치는 자동 변경하지 않고, 누적 표본을 보고 사람이 조정하는 용도입니다.');
  }else{
    lines.push('요약: 현재 입력 경기와 매칭되는 실제 결과가 없습니다. 날짜/선수명/맵명이 S11PlayerResult와 맞는지 확인하세요.');
  }
  const text=lines.join('\n');
  if($('analysisReport')) $('analysisReport').textContent=text;
  renderHistorySummary();
  log('분석 리포트 생성 완료', 'good');
}

async function syncMaps(report){
  let maps = [];
  if(CFG.mapSheet){
    try{ const rows = await fetchSheet(CFG.mapSheet, CFG.teamSheetId); maps = parseMaps(rows); report.push(`[맵] ${CFG.mapSheet}: ${maps.length}개`); }
    catch(e){ report.push(`[맵] ${CFG.mapSheet}: 실패(${e.message})`); }
  }
  if(maps.length >= 3){ CFG.maps = maps.includes('애티튜드') ? maps : [...maps, '애티튜드']; }
  else { CFG.maps = CFG.maps || DEFAULT_MAPS; if(!CFG.maps.includes('애티튜드')) CFG.maps.push('애티튜드'); }
  updateMapSelects();
}
async function syncTeamRosters(){
  const report=[];
  const sheet = CFG.teamRosterSheet || 'S11Roaster';
  const rows = await fetchSheet(sheet, CFG.teamSheetId);
  const parsed = rowsToTeamRosters(rows, sheet);
  const cnt = teamCount(parsed);
  const detail = OFFICIAL_TEAMS.map(t => `${t}:${parsed[t]?.players?.length || 0}`).join(' / ');
  report.push(`${sheet}: ${cnt}명 (${detail})`);
  ROSTERS = makeEmptyRosters();
  OFFICIAL_TEAMS.forEach(t => { if(parsed[t]) ROSTERS[t] = parsed[t]; });
  buildTeamSelectsKeep(); updateTeamPlayers();
  if(cnt < 30) throw new Error(`${sheet} 파싱 인원 ${cnt}명 - 표 구조 확인 필요`);
  return report;
}
async function syncAll(){
  log('구글시트 전체 동기화 중...');
  const report = ['[데이터 소스] 로컬 rosters/json 사용 안 함'];
  try{ await syncMaps(report); } catch(e){ report.push(`[맵] 실패(${e.message})`); }
  try{ report.push('[팀 로스터]', ...(await syncTeamRosters())); } catch(e){ report.push(`[팀 로스터] 실패(${e.message})`); ROSTERS = makeEmptyRosters(); buildTeamSelectsKeep(); updateTeamPlayers(); }
  PLAYERS = {};
  let rosterLoaded = false;
  for(const sheet of (CFG.playerRosterSheets || [])){
    try{ const rows = await fetchSheet(sheet, CFG.sheetId); const c = rowsToPlayers(rows, sheet, true); report.push(`[선수DB] ${sheet}: ${c}명`); if(c>0) rosterLoaded = true; }
    catch(e){ report.push(`[선수DB] ${sheet}: 실패(${e.message})`); }
  }
  for(const sheet of (CFG.eloSheets || [])){
    try{ const rows = await fetchSheet(sheet, CFG.sheetId); const c = rowsToPlayers(rows, sheet, false); report.push(`[ELO] ${sheet}: ${c}명`); }
    catch(e){ report.push(`[ELO] ${sheet}: 실패(${e.message})`); }
  }
  Object.values(PLAYERS).forEach(p => p.recentGames = []);
  MATCHES = [];
  let recentRows = 0;
  for(const sheet of (CFG.resultSheets || [])){
    try{ const rows = await fetchSheet(sheet, CFG.sheetId); const c = rowsToRecent(rows, sheet); recentRows += c; report.push(`[최근10] ${sheet}: ${c}건`); }
    catch(e){ report.push(`[최근10] ${sheet}: 실패(${e.message})`); }
  }
  ACTUAL_RESULTS = [];
  let actualRows = 0;
  for(const sheet of (CFG.actualResultSheets || [])){
    try{ const rows = await fetchSheet(sheet, CFG.teamSheetId); const c = rowsToActualResults(rows, sheet); actualRows += c; report.push(`[예측검증] ${sheet}: ${c}건`); }
    catch(e){ report.push(`[예측검증] ${sheet}: 실패(${e.message})`); }
  }
  finalizeRecent();
  const rosterNames = Object.values(ROSTERS).flatMap(t => t.players || []);
  const keys = [...new Set(rosterNames.map(playerKey).filter(Boolean))];
  const missing = keys.filter(k => !PLAYERS[k]);
  const matched = keys.length - missing.length;
  const missingNames = missing.map(k => rosterNames.find(n => playerKey(n) === k) || k);
  let msg = `동기화 완료\n${report.join('\n')}\n로스터 매칭: ${matched}/${keys.length}\n최근10 계산: ${recentRows}건\n검증결과 로딩: ${actualRows}건`;
  if(!rosterLoaded) msg += `\n경고: 선수DB가 로딩되지 않았습니다. '클랜원 전체명단' 탭 이름/권한 확인`;
  if(missing.length) msg += `\n미매칭(${missing.length}): ${missingNames.slice(0, 60).join(', ')}${missing.length>60?' ...':''}`;
  log(msg, missing.length ? 'warn' : 'good');
  renderAll();
}

function updateMapSelects(){
  const maps = CFG.maps || DEFAULT_MAPS;
  fillSelect($('aceMap'), maps, $('aceMap')?.value || '매치포인트');
  for(let i=1; i<=7; i++) fillSelect($(`map${i}`), maps, $(`map${i}`)?.value || maps[i-1] || maps[0]);
}
function buildTeamSelectsKeep(){
  const teams = OFFICIAL_TEAMS.filter(t => ROSTERS[t]);
  const oldH = $('homeTeam')?.value, oldA = $('awayTeam')?.value;
  fillSelect($('homeTeam'), teams, oldH && teams.includes(oldH) ? oldH : teams[0]);
  fillSelect($('awayTeam'), teams, oldA && teams.includes(oldA) ? oldA : (teams.includes('KHAN') ? 'KHAN' : teams[1] || teams[0]));
}
function buildUI(){
  ROSTERS = makeEmptyRosters();
  fillSelect($('aceTier'), CFG.aceTiers, '퀸');
  $('date').value = CFG.dateDefault; $('time').value = CFG.timeDefault; $('bo').value = CFG.boDefault;
  buildTeamSelectsKeep();
  const tb=$('setRows'); tb.innerHTML=''; state.sets=[];
  for(let i=1;i<=6;i++){ const tr=document.createElement('tr'); tr.innerHTML=`<td>${i}SET</td><td><select id="map${i}"></select></td><td><select id="h${i}"></select></td><td><select id="a${i}"></select></td>`; tb.appendChild(tr); state.sets.push(i); }
  const tr=document.createElement('tr'); tr.innerHTML=`<td>7SET</td><td><select id="map7"></select></td><td>ACE</td><td>ACE</td>`; tb.appendChild(tr);
  updateMapSelects(); updateTeamPlayers();
  document.querySelectorAll('select,input').forEach(e => e.addEventListener('change', () => { if(e.id==='homeTeam'||e.id==='awayTeam') updateTeamPlayers(); renderAll(); }));
  $('syncBtn').onclick = syncAll;
  $('reloadBtn').onclick = async () => { try{ log('S11Roaster 다시 읽는 중...'); const r=await syncTeamRosters(); log(`[팀 로스터]\n${r.join('\n')}`, 'good'); renderAll(); } catch(e){ log(`로스터 다시읽기 실패: ${e.message}`, 'warn'); } };
  $('generateBtn').onclick = downloadImage; if($('verifyBtn')) $('verifyBtn').onclick = verifyCurrentPredictions; if($('reportBtn')) $('reportBtn').onclick = buildAnalysisReport; if($('historyBtn')) $('historyBtn').onclick = renderHistorySummary; if($('clearHistoryBtn')) $('clearHistoryBtn').onclick = clearPredictionHistory;
}
function updateTeamPlayers(){
  const ht=$('homeTeam')?.value, at=$('awayTeam')?.value;
  const hp=ROSTERS[ht]?.players || [], ap=ROSTERS[at]?.players || [];
  for(let i=1;i<=6;i++){ fillSelect($(`h${i}`), hp, hp[i-1]); fillSelect($(`a${i}`), ap, ap[i-1]); }
  if($('homeInfo')) $('homeInfo').innerHTML=`감독: ${ROSTERS[ht]?.감독||'-'}<br>부감독: ${ROSTERS[ht]?.부감독||'-'}<br>보호선수: ${ROSTERS[ht]?.보호선수||'-'}<br>선수: ${hp.length}명`;
  if($('awayInfo')) $('awayInfo').innerHTML=`감독: ${ROSTERS[at]?.감독||'-'}<br>부감독: ${ROSTERS[at]?.부감독||'-'}<br>보호선수: ${ROSTERS[at]?.보호선수||'-'}<br>선수: ${ap.length}명`;
}
function calc(){
  const ht=$('homeTeam')?.value || OFFICIAL_TEAMS[0], at=$('awayTeam')?.value || OFFICIAL_TEAMS[1];
  let homeScore=0, awayScore=0, rows=[], diffs=[];
  for(let i=1;i<=6;i++){
    const hn=$(`h${i}`)?.value || '', an=$(`a${i}`)?.value || '', map=$(`map${i}`)?.value || '';
    const h=infoOf(hn), a=infoOf(an), hp=predictedProb(hn, an, map), ap=100-hp;
    const winner=hp>=50?ht:at; if(winner===ht) homeScore++; else awayScore++;
    const hStats = statsFor(hn, an, map), aStats = statsFor(an, hn, map);
    rows.push({set:i,map,hn,an,h,a,hp,ap,winner,hStats,aStats}); diffs.push({diff:Math.abs(hp-50),row:rows[rows.length-1]});
  }
  diffs.sort((x,y)=>x.diff-y.diff); const big=diffs[0]?.row || rows[0]; return {ht,at,rows,homeScore,awayScore,big};
}
function renderPreviews(){
  if(!$('homePreview')) return;
  const c=calc(), hr=$('homePreview'), ar=$('awayPreview'); hr.innerHTML=''; ar.innerHTML='';
  c.rows.forEach(r => { hr.innerHTML+=`<tr><td style="color:${CFG.colors.home};font-weight:800">${r.h.name}</td><td>${r.h.tier} / ${r.h.race}</td><td>${r.h.elo}</td><td>${r.h.recent}</td></tr>`; ar.innerHTML+=`<tr><td style="color:${CFG.colors.away};font-weight:800">${r.a.name}</td><td>${r.a.tier} / ${r.a.race}</td><td>${r.a.elo}</td><td>${r.a.recent}</td></tr>`; });
  $('metaDate').textContent=$('date').value; $('metaTime').textContent=$('time').value; $('metaBo').textContent=$('bo').value;
  $('calcPreview').innerHTML=`예상 스코어: <b>${c.ht} ${c.homeScore} : ${c.awayScore} ${c.at}</b>\nBIG MATCH: SET${c.big.set} ${c.big.hn} vs ${c.big.an} (${c.big.hp}:${c.big.ap})\nV33: S11PlayerResult C열=승자 / F열=패자 기준 검증`;
}
function drawText(ctx,text,x,y,size=28,color='#fff',align='center',weight='700',maxW=9999){ ctx.save(); ctx.font=`${weight} ${size}px Malgun Gothic, Arial`; ctx.textAlign=align; ctx.textBaseline='middle'; while(ctx.measureText(String(text)).width>maxW&&size>10){ size--; ctx.font=`${weight} ${size}px Malgun Gothic, Arial`; } ctx.lineWidth=Math.max(2,Math.floor(size/10)); ctx.strokeStyle='rgba(0,0,0,.85)'; ctx.strokeText(String(text),x,y); ctx.fillStyle=color; ctx.fillText(String(text),x,y); ctx.restore(); }
function drawMulti(ctx,lines,x,y,size,color,align='center',gap=1.15,weight='700',maxW=9999){ const lh=size*gap,start=y-(lines.length-1)*lh/2; lines.forEach((t,i)=>drawText(ctx,t,x,start+i*lh,size,color,align,weight,maxW)); }

function fillCell(ctx, x1, y1, x2, y2, color='rgb(1,10,14)'){
  ctx.save(); ctx.fillStyle=color; ctx.fillRect(x1+0.5,y1+0.5,Math.max(0,x2-x1-1),Math.max(0,y2-y1-1)); ctx.restore();
}
function fillBox(ctx, x, y, w, h, color='rgb(0,0,0)'){
  ctx.save(); ctx.fillStyle=color; ctx.fillRect(x,y,w,h); ctx.restore();
}
function drawCellText(ctx, text, cx, cy, size, color, maxW, weight='800'){
  drawText(ctx, text, cx, cy, size, color, 'center', weight, maxW);
}

async function renderCanvas(){
  const canvas=$('canvas'); if(!canvas) return; const c=calc(), ctx=canvas.getContext('2d');
  if(!TEMPLATE){ TEMPLATE=new Image(); TEMPLATE.src=CFG.template; await TEMPLATE.decode(); }
  ctx.clearRect(0,0,1536,1024); ctx.drawImage(TEMPLATE,0,0,1536,1024);

  // 상단 배너: 템플릿에 박힌 예전 팀명/날짜를 먼저 지운 뒤 다시 그림
  fillBox(ctx, 178, 40, 270, 64, 'rgb(32,0,0)');
  fillBox(ctx, 1055, 40, 255, 64, 'rgb(0,10,35)');
  fillBox(ctx, 1392, 24, 132, 92, 'rgb(0,0,0)');
  drawText(ctx,c.ht,314,76,34,CFG.colors.home,'center','900',255);
  drawText(ctx,c.at,1182,76,34,CFG.colors.away,'center','900',240);
  drawMulti(ctx,[$('date').value,$('time').value,$('bo').value],1458,72,22,CFG.colors.white,'center',1.28,'800',112);
  drawText(ctx,$('bj').value,768,158,18,CFG.colors.white,'center','700',120);

  // 표 헤더 팀명 교체
  fillCell(ctx,185,136,457,184,'rgb(44,0,0)');
  fillCell(ctx,509,136,789,184,'rgb(0,14,45)');
  drawText(ctx,`${c.ht} (HOME)`,321,160,20,CFG.colors.white,'center','900',250);
  drawText(ctx,`${c.at} (AWAY)`,649,160,20,CFG.colors.white,'center','900',260);

  const col={
    map:[75,185], hp:[185,290], ht:[290,384], he:[384,457],
    ap:[509,615], at:[615,716], ae:[716,789],
    rrh:[789,878], rra:[878,966], h2h:[966,1053],
    rh:[1053,1149], ra:[1149,1246], mh:[1246,1333], ma:[1333,1420], win:[1420,1530]
  };
  const yLines=[215,290,365,440,515,590,665,728];
  const yCenters=[253,328,403,478,553,628,697];
  function cx(k){ return (col[k][0]+col[k][1])/2; }

  // 1~6SET 동적 영역 초기화 및 재출력
  c.rows.forEach((r,i)=>{
    const y1=yLines[i], y2=yLines[i+1], y=yCenters[i];
    ['map','hp','ht','he','ap','at','ae','rrh','rra','h2h','rh','ra','mh','ma','win'].forEach(k=>fillCell(ctx,col[k][0],y1,col[k][1],y2));
    drawCellText(ctx,r.map,cx('map'),y,18,CFG.colors.white,96,'800');
    drawCellText(ctx,r.h.name,cx('hp'),y-14,20,CFG.colors.home,96,'900');
    drawCellText(ctx,`${r.h.tier} / ${r.h.race}`,cx('ht'),y,17,CFG.colors.white,82,'700');
    drawCellText(ctx,String(r.h.elo),cx('he'),y,16,CFG.colors.white,62,'700');
    drawCellText(ctx,r.a.name,cx('ap'),y-14,20,CFG.colors.away,98,'900');
    drawCellText(ctx,`${r.a.tier} / ${r.a.race}`,cx('at'),y,17,CFG.colors.white,86,'700');
    drawCellText(ctx,String(r.a.elo),cx('ae'),y,16,CFG.colors.white,62,'700');
    drawCellText(ctx,wlOneLine(r.hStats.raceRecordLines),cx('rrh'),y,14,CFG.colors.white,82,'700');
    drawCellText(ctx,wlOneLine(r.aStats.raceRecordLines),cx('rra'),y,14,CFG.colors.white,82,'700');
    drawCellText(ctx,r.hStats.h2h,cx('h2h'),y,17,CFG.colors.white,72,'800');
    drawCellText(ctx,r.h.recent,cx('rh'),y,15,CFG.colors.white,84,'700');
    drawCellText(ctx,r.a.recent,cx('ra'),y,15,CFG.colors.white,84,'700');
    drawCellText(ctx,r.hStats.mapRecord,cx('mh'),y,15,CFG.colors.white,78,'700');
    drawCellText(ctx,r.aStats.mapRecord,cx('ma'),y,15,CFG.colors.white,78,'700');
    const winName=r.hp>=50?r.h.name:r.a.name,winPct=Math.max(r.hp,r.ap),wc=r.hp>=50?CFG.colors.home:CFG.colors.away;
    drawMulti(ctx,[winName,winPct+'%'],cx('win'),y,15,wc,'center',1.22,'900',92);
  });

  // ACE 행은 맵과 ACE 티어만 교체
  const ay1=yLines[6], ay2=yLines[7], ay=yCenters[6];
  ['map','hp','ht','he','ap','at','ae','win'].forEach(k=>fillCell(ctx,col[k][0],ay1,col[k][1],ay2));
  drawCellText(ctx,$('aceMap').value,cx('map'),ay,18,CFG.colors.white,96,'800');
  drawText(ctx,`ACE 티어 : ${$('aceTier').value}`,321,ay,18,CFG.colors.white,'center','800',250);
  drawText(ctx,`ACE 티어 : ${$('aceTier').value}`,649,ay,18,CFG.colors.white,'center','800',260);

  // 팀 예상 스코어 패널
  fillBox(ctx, 20, 812, 310, 108, 'rgb(0,0,0)');
  drawText(ctx,c.ht,100,905,18,CFG.colors.home,'center','900',130);
  drawText(ctx,c.at,286,905,18,CFG.colors.away,'center','900',130);
  drawText(ctx,String(c.homeScore),144,838,50,CFG.colors.home,'center','900',48);
  drawText(ctx,':',178,838,42,CFG.colors.white,'center','900',20);
  drawText(ctx,String(c.awayScore),216,838,50,CFG.colors.away,'center','900',48);

  // 세트별 예상 승자 패널
  fillBox(ctx, 359, 838, 456, 82, 'rgb(0,0,0)');
  const sx=[393,459,525,591,657,723,789];
  c.rows.forEach((r,i)=>{ const isHome = r.winner===c.ht; drawText(ctx,isHome?'HOME':'AWAY',sx[i],878,14,isHome?CFG.colors.home:CFG.colors.away,'center','900',60); });
  drawText(ctx,'-',sx[6],878,18,CFG.colors.gray,'center','900',35);

  // 오늘의 빅매치 패널 (FINAL: 예상 승률 가이드 삭제 후 우측 영역까지 확대)
  fillBox(ctx, 842, 744, 686, 224, 'rgb(0,0,0)');
  const b=c.big;
  drawText(ctx,'오늘의 빅매치',1185,768,30,CFG.colors.white,'center','900',360);
  drawText(ctx,`SET${b.set} · ${b.map}`,1185,810,22,CFG.colors.white,'center','800',300);
  drawText(ctx,b.h.name,1032,854,30,CFG.colors.home,'center','900',180);
  drawText(ctx,'VS',1185,858,32,CFG.colors.white,'center','900',60);
  drawText(ctx,b.a.name,1338,854,30,CFG.colors.away,'center','900',180);
  drawText(ctx,`${b.h.tier} / ${b.h.race}`,1032,890,19,CFG.colors.white,'center','700',140);
  drawText(ctx,`${b.a.tier} / ${b.a.race}`,1338,890,19,CFG.colors.white,'center','700',140);
  fillBox(ctx, 920, 924, 190, 38, 'rgb(70,0,0)');
  fillBox(ctx, 1260, 924, 190, 38, 'rgb(0,18,75)');
  drawText(ctx,b.hp+'%',1015,943,38,pctColor(b.hp),'center','900',150);
  drawText(ctx,b.ap+'%',1355,943,38,pctColor(b.ap),'center','900',150);
}
async function renderAll(){ renderPreviews(); await renderCanvas(); }
function downloadImage(){ renderCanvas().then(()=>{ const c=calc(); const name=`3050_PREVIEW_${c.ht}_vs_${c.at}_${$('date').value.replaceAll('.','')}_${$('time').value.replace(':','')}.png`; const a=document.createElement('a'); a.download=name; a.href=$('canvas').toDataURL('image/png'); a.click(); }); }
(async function init(){ CFG=await loadJSON('config.json'); buildUI(); await syncAll(); })();
