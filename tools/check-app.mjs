// 브라우저 없이 도는 앱 상태 점검: node tools/check-app.mjs
// 클라우드 루틴(주 1회)과 사람이 같은 명령으로 돌린다. 화면 동작 검사는 로컬의 ~/deadline-planner-tests/run-all.sh가 따로 한다.
// 보는 것: 스크립트 문법 · 공휴일 계산 · 날짜/시각 읽기 · 값 정리 함수 · 민감 문자열 · 매니페스트 · 운영 주소가 저장소와 같은지
import fs from 'fs';

const here = new URL('.', import.meta.url);
const html = fs.readFileSync(new URL('../deadline-planner.html', here), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', here), 'utf8');
const PROD = 'https://kor-streetcat.github.io/deadline-planner';

let bad = 0, good = 0;
const ok = (n, c, x) => { c ? good++ : bad++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '\n   ' + (x ?? ''))); };
const eq = (n, got, exp) => ok(n, JSON.stringify(got) === JSON.stringify(exp), 'got ' + JSON.stringify(got) + '\n   exp ' + JSON.stringify(exp));

// ---- 1) 스크립트 문법 ----
{
  const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0, err = '';
  while ((m = re.exec(html))) {
    try { new Function(m[1].replace(/^\s*import[\s\S]*?from [^\n]*\n/gm, '')); n++; } catch (e) { err += e.message + ' '; }
  }
  ok(`앱 스크립트 ${n}개 문법 이상 없음`, !err && n >= 4, err);
  try { new Function(sw); ok('sw.js 문법 이상 없음', true); } catch (e) { ok('sw.js 문법 이상 없음', false, e.message); }
}

// ---- 공용: 앱에서 함수 꺼내 오기 ----
const isoOfDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cleanText = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const grab = (from, to) => { const a = html.indexOf(from), b = html.indexOf(to, a); if (a < 0 || b < 0) throw new Error('코드 블록을 찾지 못함: ' + from); return html.slice(a, b); };

// ---- 2) 공휴일 계산 ----
{
  const { krHolidaysOf, KR_EXTRA, KR_LUNAR } = new Function('isoOfDate', grab('const KR_LUNAR', 'function krHoliday(iso)') + '; return { krHolidaysOf, KR_EXTRA, KR_LUNAR };')(isoOfDate);
  const dates = (y) => Object.keys(krHolidaysOf(y)).sort().map(d => d.slice(5)).join(',');
  // 공식 발표 기준(임시공휴일·선거일은 KR_EXTRA에서 더해지므로 그것도 포함한 값)
  const OFFICIAL = {
    2026: '01-01,02-16,02-17,02-18,03-01,03-02,05-01,05-05,05-24,05-25,06-03,06-06,07-17,08-15,08-17,09-24,09-25,09-26,10-03,10-05,10-09,12-25',
    2027: '01-01,02-06,02-07,02-08,02-09,03-01,05-01,05-03,05-05,05-13,06-06,07-17,07-19,08-15,08-16,09-14,09-15,09-16,10-03,10-04,10-09,10-11,12-25,12-27',
  };
  for (const y of Object.keys(OFFICIAL)) {
    const got = new Set(dates(+y).split(','));
    const missing = OFFICIAL[y].split(',').filter(d => !got.has(d));
    ok(`${y}년 공휴일이 기준 목록을 모두 담고 있음`, missing.length === 0, '빠짐: ' + missing.join(','));
  }
  ok('대체공휴일이 토·일요일에 잡히지 않음(2024~2035)', [...Array(12)].every((_, i) => Object.entries(krHolidaysOf(2024 + i)).filter(([, v]) => v.sub).every(([d]) => { const w = new Date(d + 'T12:00:00').getDay(); return w !== 0 && w !== 6; })));
  ok('음력 표가 2024~2035년 12개 해를 담고 있음', Object.keys(KR_LUNAR).length === 12 && Object.values(KR_LUNAR).every(a => a.length === 3));
  for (const [iso, name] of Object.entries(KR_EXTRA)) {
    const v = krHolidaysOf(+iso.slice(0, 4))[iso];
    ok(`임시공휴일·선거일 표: ${iso} ${name}`, /^\d{4}-\d{2}-\d{2}$/.test(iso) && !!v && v.name.includes(name));
  }
}

// ---- 3) 날짜·시각 읽기(먼저 등록 경로) ----
{
  const TODAY = '2026-09-21';   // 월요일
  const normTime = (v) => { const m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})$/); if (!m) return ''; const hh = +m[1], mi = +m[2]; return hh > 23 || mi > 59 ? '' : String(hh).padStart(2, '0') + ':' + m[2]; };
  const seg = grab('function isoOfDate', 'function aiBusyHtml');
  const { readLocalWhen, readLocalPlan } = new Function('cleanText', 'normTime', 'todayISO', seg + '; return { readLocalWhen, readLocalPlan };')(cleanText, normTime, () => TODAY);
  const w = (x) => { const r = readLocalWhen(x, TODAY); return r && [r.date, r.title]; };
  eq('"보고서 10/3까지" 읽기', w('보고서 10/3까지'), ['2026-10-03', '보고서']);
  eq('"내일 발표 준비" 읽기', w('내일 발표 준비'), ['2026-09-22', '발표 준비']);
  eq('"10월 3일 논문 초안" 읽기', w('10월 3일 논문 초안'), ['2026-10-03', '논문 초안']);
  eq('"다음주 금요일 세미나" 읽기', w('다음주 금요일 세미나'), ['2026-10-02', '세미나']);
  eq('날짜가 없으면 안 읽음', w('ALD 공부'), null);
  eq('두 건을 쉼표로', readLocalPlan('보고서 10/3까지, 치과 화요일 3시').map(r => [r.title, r.date, r.time]), [['보고서', '2026-10-03', ''], ['치과', '2026-09-22', '15:00']]);
}

// ---- 4) 값 정리 함수 ----
{
  const seg = grab('function normTime(v)', 'function ddayHtml');
  const f = new Function('cleanText', 'todayISO', 'PRIORITY_RANK', seg + '; return { normTime, normDuration, fmtTime, fmtDuration };')(cleanText, () => '2026-09-21', { high: 0, medium: 1, low: 2 });
  eq('normTime', ['9:05', '24:00', '12:60', 'abc', '23:59'].map(f.normTime), ['09:05', '', '', '', '23:59']);
  eq('normDuration', [4, 5, '90', 1441, NaN].map(f.normDuration), [0, 5, 90, 0, 0]);
  eq('fmtTime·fmtDuration', [f.fmtTime('15:30'), f.fmtDuration(90)], ['오후 3:30', '1시간 30분']);
  const seg2 = grab('function parseTimeParam(v)', 'async function handleUrlAdd');
  const g = new Function('normTime', 'normDuration', seg2 + '; return { parseTimeParam, parseDurationParam };')(f.normTime, f.normDuration);
  eq('주소 time= 읽기', ['15:30', '오후 3시', '3pm', '25:00'].map(g.parseTimeParam), ['15:30', '15:00', '15:00', '']);
  eq('주소 min= 읽기', ['90', '2시간', 'abc'].map(g.parseDurationParam), [90, 120, 0]);
}

// ---- 5) 민감 문자열 ----
{
  const PUBLIC_FIREBASE = 'AIzaSyDZRVl5lGE-kXYL-yRJwTKkTWnp0H5ZN1E';   // 공개용 Firebase 웹 키(공개돼도 되는 값)
  const hits = [];
  for (const f of ['deadline-planner.html', 'sw.js', 'index.html', 'manifest.json']) {
    let t; try { t = fs.readFileSync(new URL('../' + f, here), 'utf8'); } catch (e) { continue; }
    t.split('\n').forEach((line, i) => {
      const m = line.match(/sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY|AIza[0-9A-Za-z_-]{30,}/);
      if (m && m[0] !== PUBLIC_FIREBASE) hits.push(`${f}:${i + 1} ${m[0].slice(0, 12)}…`);
    });
  }
  ok('저장소 파일에 키·토큰이 없음', hits.length === 0, hits.join(' | '));
}

// ---- 6) 매니페스트 ----
{
  let mf = null;
  try { mf = JSON.parse(fs.readFileSync(new URL('../manifest.json', here), 'utf8')); } catch (e) {}
  ok('매니페스트에 이름·시작 주소·아이콘이 있음', !!mf && !!mf.name && !!mf.start_url && Array.isArray(mf.icons) && mf.icons.length > 0, JSON.stringify(mf).slice(0, 120));
  ok('아이콘 파일이 실제로 있음', ['icon-180.png', 'icon-192.png', 'icon-512.png'].every(f => fs.existsSync(new URL('../' + f, here))));
}

// ---- 7) 운영 주소가 저장소와 같은지 (네트워크가 되면) ----
{
  const localVer = (html.match(/APP_VERSION = '([^']+)'/) || [])[1];
  const localCache = (sw.match(/CACHE = '([^']+)'/) || [])[1];
  ok('APP_VERSION과 sw.js 캐시 이름을 읽을 수 있음', !!localVer && !!localCache, `${localVer} / ${localCache}`);
  try {
    const t = await (await fetch(PROD + '/deadline-planner.html?cb=' + Date.now(), { signal: AbortSignal.timeout(25000) })).text();
    const s2 = await (await fetch(PROD + '/sw.js?cb=' + Date.now(), { signal: AbortSignal.timeout(25000) })).text();
    const pv = (t.match(/APP_VERSION = '([^']+)'/) || [])[1], pc = (s2.match(/CACHE = '([^']+)'/) || [])[1];
    ok('운영 주소가 열리고 앱 버전을 읽을 수 있음', !!pv, String(pv));
    if (pv === localVer) ok(`운영 주소가 저장소와 같음 (${pv} / ${pc})`, pc === localCache, `캐시 이름이 다름: 운영 ${pc} / 저장소 ${localCache}`);
    else console.log(`SKIP 운영(${pv})과 저장소(${localVer}) 버전이 다름 — 아직 배포 전이거나 배포 반영 중`);
  } catch (e) {
    console.log('SKIP 운영 주소 확인 건너뜀 (네트워크 안 됨): ' + (e && e.message));
  }
}

console.log(bad ? `\n${good}개 통과 / ${bad}개 실패` : `\n${good}개 모두 통과`);
process.exit(bad ? 1 : 0);
