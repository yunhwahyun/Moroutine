#!/usr/bin/env node
// 오픈소스 라이선스 고지 데이터 생성 스크립트.
//
// "package.json의 dependencies 목록"이 아니라 "실제 배포 번들에 포함되는 코드"를 기준으로 삼는다.
// web(Vite)은 실제 production 빌드를 한 번, mobile(Expo/Metro)은 iOS/Android 두 플랫폼 각각
// 실제 production 빌드를 수행해 소스맵을 뽑고, 그 소스맵에 등장하는 node_modules 파일들만
// 대상으로 라이선스를 수집한다. mobile을 두 플랫폼 다 보는 이유: `.ios.js`/`.android.js` 같은
// 플랫폼별 분기 파일이 있어 이론적으로 번들 구성이 다를 수 있기 때문(2026-09-11 실측으로는
// 이 앱은 두 플랫폼이 동일했지만, 의존성이 바뀌면 달라질 수 있어 스크립트가 매번 둘 다 검증한다).
//
// 이렇게 하는 이유: mobile/package.json의 production dependency 트리를 그대로 쓰면 metro,
// jest, hermes-compiler, xcode 등 "expo 패키지가 내부적으로 요구하는 빌드 도구"까지 수백 개가
// 섞여 들어온다(실측: 트리 전체 454개 vs 실제 번들에 포함되는 것은 iOS/Android 각각 32개
// 패키지, 34~35개 항목 — 두 플랫폼 결과는 사실상 동일). 이 도구들은 npm 그래프상
// devDependencies가 아니라 "진짜" 개발 머신 전용 CLI 도구라 개발자가 눈으로 걸러낼 방법이
// 없고, 실제 빌드 결과물을 열어보는 것이 유일하게 정확한 방법이다.
//
// 사용법: node scripts/generate-oss-licenses.mjs
// 출력: web/public/licenses/oss-licenses.json (LicensesPage가 fetch로 읽는다)

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(REPO_ROOT, 'web');
const MOBILE_DIR = path.join(REPO_ROOT, 'mobile');
const OUT_PATH = path.join(WEB_DIR, 'public', 'licenses', 'oss-licenses.json');

const LICENSE_FILE_NAMES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'License',
  'LICENSE-MIT', 'LICENSE-MIT.txt',
  'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'license', 'license.md',
  'MIT-LICENSE.txt',
];
const NOTICE_FILE_NAMES = ['NOTICE', 'NOTICE.txt', 'NOTICE.md'];

// 라이선스 파일을 따로 배포하지 않는 패키지(주로 모노레포 서브패키지)를 위한 대체 텍스트 소스.
// name@version 단위가 아니라 "이 이름이 없으면 이 경로의 LICENSE를 대신 쓴다" 매핑.
const FALLBACK_LICENSE_SOURCE = {
  '@react-native/assets-registry': 'react-native',
  '@react-native/js-polyfills': 'react-native',
  '@react-native/normalize-colors': 'react-native',
  '@react-native/virtualized-lists': 'react-native',
};

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1024 * 1024 * 200 }).toString();
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function findPackageRoot(absoluteFilePath) {
  const parts = absoluteFilePath.split(path.sep);
  let idx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === 'node_modules') {
      idx = i;
      break;
    }
  }
  if (idx === -1) return null;
  if (parts[idx + 1] && parts[idx + 1].startsWith('@')) {
    return parts.slice(0, idx + 3).join(path.sep);
  }
  return parts.slice(0, idx + 2).join(path.sep);
}

function resolveSourceToAbsolute(mapAbsPath, projectDir, source) {
  const candidates = [];
  if (source.startsWith('/')) {
    candidates.push(path.join(projectDir, source.slice(1)));
  }
  candidates.push(path.resolve(path.dirname(mapAbsPath), source));
  candidates.push(path.join(projectDir, source));
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function normalizeLicenseField(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length) {
    return pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).filter(Boolean).join(' OR ');
  }
  return null;
}

function normalizeAuthor(pkg) {
  if (!pkg.author) return null;
  if (typeof pkg.author === 'string') return pkg.author;
  if (typeof pkg.author === 'object') {
    const parts = [pkg.author.name, pkg.author.email ? `<${pkg.author.email}>` : null].filter(Boolean);
    return parts.join(' ') || null;
  }
  return null;
}

function normalizeRepo(pkg) {
  if (pkg.repository) {
    if (typeof pkg.repository === 'string') return pkg.repository;
    if (typeof pkg.repository === 'object' && pkg.repository.url) return pkg.repository.url;
  }
  return pkg.homepage || null;
}

function readFirstExisting(dir, names) {
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      try {
        return { file: name, text: fs.readFileSync(p, 'utf8') };
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function collectPackageInfo(pkgRootDir, projectDir) {
  const pkgJson = readJsonSafe(path.join(pkgRootDir, 'package.json'));
  if (!pkgJson || !pkgJson.name || !pkgJson.version) return null;

  let licenseFile = readFirstExisting(pkgRootDir, LICENSE_FILE_NAMES);
  let licenseFileSourceNote = null;

  if (!licenseFile && FALLBACK_LICENSE_SOURCE[pkgJson.name]) {
    const fallbackDir = path.join(projectDir, 'node_modules', FALLBACK_LICENSE_SOURCE[pkgJson.name]);
    licenseFile = readFirstExisting(fallbackDir, LICENSE_FILE_NAMES);
    if (licenseFile) {
      licenseFileSourceNote = `이 패키지 자체에는 LICENSE 파일이 없어 같은 저장소(monorepo)의 ${FALLBACK_LICENSE_SOURCE[pkgJson.name]} 패키지 LICENSE 전문을 대신 표시합니다.`;
    }
  }

  const noticeFile = readFirstExisting(pkgRootDir, NOTICE_FILE_NAMES);

  return {
    name: pkgJson.name,
    version: pkgJson.version,
    license: normalizeLicenseField(pkgJson),
    author: normalizeAuthor(pkgJson),
    repository: normalizeRepo(pkgJson),
    homepage: pkgJson.homepage || null,
    licenseFileName: licenseFile ? licenseFile.file : null,
    licenseText: licenseFile ? licenseFile.text : null,
    licenseFileSourceNote,
    noticeFileName: noticeFile ? noticeFile.file : null,
    noticeText: noticeFile ? noticeFile.text : null,
  };
}

function collectFromSourceMap(mapAbsPath, projectDir) {
  const map = readJsonSafe(mapAbsPath);
  if (!map || !Array.isArray(map.sources)) {
    throw new Error(`sourcemap을 읽을 수 없습니다: ${mapAbsPath}`);
  }
  const seenPkgRoots = new Set();
  const entries = new Map(); // `${name}@${version}` -> info

  for (const source of map.sources) {
    if (!source || !source.includes('node_modules')) continue;
    const abs = resolveSourceToAbsolute(mapAbsPath, projectDir, source);
    if (!abs) continue;
    const pkgRoot = findPackageRoot(abs);
    if (!pkgRoot || seenPkgRoots.has(pkgRoot)) continue;
    seenPkgRoots.add(pkgRoot);

    const info = collectPackageInfo(pkgRoot, projectDir);
    if (!info) continue;
    const key = `${info.name}@${info.version}`;
    if (!entries.has(key)) entries.set(key, info);
  }
  return entries;
}

// 번들러가 재-export만 하는 패키지(react-router-dom 등)를 완전히 인라인하면서 소스맵에
// 그 패키지 자신의 파일 경로를 하나도 남기지 않는 경우가 있다(실측: react-router-dom).
// 그 결과 코드는 분명 번들에 포함돼 있는데 소스맵만으로는 존재를 알 수 없다. 이를 놓치지 않도록
// 프로젝트 자신의 package.json "dependencies"(직접 의존성, 전이 의존성 제외)에 한해서만
// 안전망으로 보강한다 — 전이 의존성까지 이 방식으로 보강하면 사실상 npm ls 전체 트리로
// 되돌아가 버려 이 스크립트를 쓰는 의미가 없어진다.
function reconcileDirectDependencies(entries, projectDir) {
  const pkgJson = readJsonSafe(path.join(projectDir, 'package.json'));
  if (!pkgJson || !pkgJson.dependencies) return;
  const alreadyHaveName = new Set([...entries.values()].map((e) => e.name));
  for (const depName of Object.keys(pkgJson.dependencies)) {
    if (alreadyHaveName.has(depName)) continue;
    const pkgRoot = path.join(projectDir, 'node_modules', ...depName.split('/'));
    const info = collectPackageInfo(pkgRoot, projectDir);
    if (!info) continue;
    info.note =
      '이 패키지 자신의 코드가 번들러에 의해 다른 모듈에 완전히 인라인되어 소스맵에 별도 파일로 나타나지 않지만, ' +
      '프로젝트가 직접 의존하고 있어 목록에 보강했습니다.';
    entries.set(`${info.name}@${info.version}`, info);
  }
}

function buildWeb() {
  console.log('[web] vite build --sourcemap 실행 중...');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moroutine-oss-web-'));
  sh(`npx vite build --outDir ${JSON.stringify(outDir)} --emptyOutDir --sourcemap`, WEB_DIR);
  const assetsDir = path.join(outDir, 'assets');
  const mapFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js.map'));
  if (mapFiles.length === 0) throw new Error('web 빌드 산출물에서 .js.map 파일을 찾지 못했습니다.');

  const combined = new Map();
  for (const f of mapFiles) {
    const entries = collectFromSourceMap(path.join(assetsDir, f), WEB_DIR);
    for (const [k, v] of entries) combined.set(k, v);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  reconcileDirectDependencies(combined, WEB_DIR);
  console.log(`[web] 실제 번들 포함 패키지 ${combined.size}개 확인`);
  return combined;
}

// iOS/Android는 .ios.js / .android.js 같은 플랫폼별 분기 파일이 있어 이론적으로 번들 구성이
// 다를 수 있다(실측 결과 이 앱은 동일했지만, 스크립트는 매번 재검증되도록 둘 다 본다).
function exportMobilePlatform(platform) {
  console.log(`[mobile/${platform}] expo export --source-maps external 실행 중... (다소 시간이 걸립니다)`);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `moroutine-oss-mobile-${platform}-`));
  sh(
    `npx expo export --platform ${platform} --output-dir ${JSON.stringify(outDir)} --no-bytecode --no-minify --source-maps external --clear`,
    MOBILE_DIR,
  );
  const jsDir = path.join(outDir, '_expo', 'static', 'js', platform);
  const mapFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js.map'));
  if (mapFiles.length === 0) throw new Error(`mobile(${platform}) 빌드 산출물에서 .js.map 파일을 찾지 못했습니다.`);

  const entries = new Map();
  for (const f of mapFiles) {
    const found = collectFromSourceMap(path.join(jsDir, f), MOBILE_DIR);
    for (const [k, v] of found) entries.set(k, v);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(`[mobile/${platform}] 실제 번들 포함 패키지 ${entries.size}개 확인`);
  return entries;
}

function buildMobile() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 22) {
    console.warn(
      `[mobile] 경고: 현재 Node ${process.versions.node}. mobile/package.json은 Node 22 계열을 요구합니다. ` +
        `'nvm use 22.14.0' 이후 다시 실행하세요.`,
    );
  }

  const iosEntries = exportMobilePlatform('ios');
  const androidEntries = exportMobilePlatform('android');

  const onlyIos = [...iosEntries.keys()].filter((k) => !androidEntries.has(k));
  const onlyAndroid = [...androidEntries.keys()].filter((k) => !iosEntries.has(k));
  if (onlyIos.length || onlyAndroid.length) {
    console.log('[mobile] iOS/Android 번들 패키지 구성 차이 발견:');
    if (onlyIos.length) console.log('  iOS에만 포함:', onlyIos);
    if (onlyAndroid.length) console.log('  Android에만 포함:', onlyAndroid);
  } else {
    console.log('[mobile] iOS/Android 번들 패키지 구성 동일함을 확인');
  }

  const combined = new Map([...iosEntries, ...androidEntries]);
  reconcileDirectDependencies(combined, MOBILE_DIR);
  console.log(`[mobile] 최종 실제 번들 포함 패키지(iOS+Android 합집합) ${combined.size}개 확인`);
  return combined;
}

function main() {
  const webEntries = buildWeb();
  const mobileEntries = buildMobile();

  const merged = new Map();
  for (const [key, info] of webEntries) {
    merged.set(key, { ...info, apps: ['web'] });
  }
  for (const [key, info] of mobileEntries) {
    if (merged.has(key)) {
      merged.get(key).apps.push('mobile');
    } else {
      merged.set(key, { ...info, apps: ['mobile'] });
    }
  }

  const list = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  const licenseCounts = {};
  const unknown = [];
  const reviewNeeded = [];
  const REVIEW_PATTERNS = /GPL|AGPL|LGPL|MPL|CDDL|EPL|EUPL/i;
  for (const item of list) {
    const lic = item.license || 'UNKNOWN';
    licenseCounts[lic] = (licenseCounts[lic] || 0) + 1;
    if (!item.license) unknown.push(`${item.name}@${item.version}`);
    else if (REVIEW_PATTERNS.test(item.license)) reviewNeeded.push(`${item.name}@${item.version} (${item.license})`);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalCount: list.length,
        licenseCounts,
        packages: list,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('\n=== 요약 ===');
  console.log(`총 패키지 수: ${list.length}`);
  console.log('라이선스별 개수:', licenseCounts);
  if (unknown.length) console.log('UNKNOWN 라이선스:', unknown);
  if (reviewNeeded.length) console.log('⚠️  추가 검토 필요(GPL/AGPL/LGPL/MPL 등):', reviewNeeded);
  console.log(`출력 파일: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main();
