// Builds release/MultiTwitchViewer.exe: the web app embedded in a small Go
// launcher. Runs on Windows, macOS or Linux (it cross-compiles); needs Go 1.24+.
//
//   npm run build:windows
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const launcher = join(root, 'launcher');
const web = join(launcher, 'web');
const out = join(root, 'release', 'MultiTwitchViewer.exe');

const run = (cmd, args, opts = {}) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
};

try {
  execFileSync('go', ['version'], { stdio: 'ignore', shell: process.platform === 'win32' });
} catch {
  console.error('Go is needed to build the launcher: https://go.dev/dl/');
  process.exit(1);
}

// 1. Build the web app.
run('npx', ['vite', 'build']);

// 2. Copy it into the launcher (keeping web/README.md).
for (const entry of readdirSync(web)) {
  if (entry !== 'README.md') rmSync(join(web, entry), { recursive: true, force: true });
}
cpSync(join(root, 'dist'), web, { recursive: true });

// 3. Icon, version info and manifest.
run(
  'go',
  [
    'run',
    'github.com/tc-hib/go-winres@v0.3.3',
    'make',
    '--in',
    'winres/winres.json',
    '--arch',
    'amd64',
  ],
  {
    cwd: launcher,
  },
);

// 4. Compile a GUI (no console window) Windows executable, stamped with the
//    version and commit so the app can tell when a newer release exists.
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
let commit = process.env.GITHUB_SHA ?? 'dev';
if (commit === 'dev') {
  try {
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString().trim();
    if (!dirty)
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  } catch {
    // not a git checkout: stays "dev" (update checks are skipped)
  }
}
const ldflags = `-H windowsgui -s -w -X main.version=${version} -X main.commit=${commit}`;
mkdirSync(join(root, 'release'), { recursive: true });
run('go', ['build', '-trimpath', '-ldflags', ldflags, '-o', out, '.'], {
  cwd: launcher,
  env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
});

if (!existsSync(out)) process.exit(1);
console.log(`\nBuilt ${out}`);
