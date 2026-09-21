// 공휴일 표(KR_EXTRA 등)를 고친 뒤 반드시 실행하는 확인 스크립트: node tools/check-holidays.mjs
// 1) 앱의 모든 스크립트 문법  2) 공휴일 계산이 알려진 기준 날짜를 그대로 내는지  3) KR_EXTRA의 모든 날짜가 실제로 공휴일로 나오는지
import fs from 'fs';
const html = fs.readFileSync(new URL('../deadline-planner.html', import.meta.url), 'utf8');
let bad = 0;
const fail = (m) => { bad++; console.log('FAIL ' + m); };
const pass = (m) => console.log('PASS ' + m);

// 1) 문법
const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g; let m, n = 0;
while ((m = re.exec(html))) { try { new Function(m[1].replace(/^\s*import[\s\S]*?from [^\n]*\n/gm, '')); n++; } catch (e) { fail('스크립트 문법 오류: ' + e.message); } }
if (!bad) pass(`스크립트 ${n}개 문법 이상 없음`);

// 2) 공휴일 블록 로드
const a = html.indexOf('const KR_LUNAR'), b = html.indexOf('function krHoliday(iso)');
if (a < 0 || b < 0) { fail('공휴일 코드 블록을 찾지 못함'); process.exit(1); }
const isoOfDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const { krHolidaysOf, KR_EXTRA } = new Function('isoOfDate', html.slice(a, b) + '; return { krHolidaysOf, KR_EXTRA };')(isoOfDate);

// 공식 발표 기준 날짜(임시공휴일·선거일 제외): 이 날짜들은 항상 포함돼야 한다
const BASE = {
  2026: '01-01,02-16,02-17,02-18,03-01,03-02,05-05,05-24,05-25,06-06,08-15,08-17,09-24,09-25,09-26,10-03,10-05,10-09,12-25',
  2027: '01-01,02-06,02-07,02-08,02-09,03-01,05-05,05-13,06-06,08-15,08-16,09-14,09-15,09-16,10-03,10-04,10-09,10-11,12-25,12-27',
};
for (const y of Object.keys(BASE)) {
  const got = new Set(Object.keys(krHolidaysOf(+y)).map(d => d.slice(5)));
  const missing = BASE[y].split(',').filter(d => !got.has(d));
  missing.length ? fail(`${y}년 기준 공휴일이 빠짐: ${missing.join(',')}`) : pass(`${y}년 기준 공휴일이 모두 있음`);
}

// 3) KR_EXTRA 형식과 반영
for (const [iso, name] of Object.entries(KR_EXTRA)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(new Date(iso + 'T12:00:00'))) { fail(`KR_EXTRA 날짜 형식 오류: ${iso}`); continue; }
  if (!name || typeof name !== 'string') { fail(`KR_EXTRA 이름이 비어 있음: ${iso}`); continue; }
  const v = krHolidaysOf(+iso.slice(0, 4))[iso];
  v && v.name.includes(name) ? pass(`KR_EXTRA ${iso} ${name} 반영됨`) : fail(`KR_EXTRA ${iso} ${name} 이 공휴일로 나오지 않음`);
}
console.log(bad ? `\n${bad}개 실패` : '\n모두 통과');
process.exit(bad ? 1 : 0);
