// main.ts — the token launch radar's program.
//
// Reads the sealed snapshot, scores every pre-token protocol with the
// radar-2 model, and writes the ranked board, the dashboard's data, the
// dashboard and its screenshots, and the dossier, in that order: the
// dossier is written last, from what is already in the output directory.
// Standard library only, deterministic: the same snapshot writes the
// same bytes every run.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';

/** This repository's root: the dashboard and screenshots live beside me. */
const REPO_DIR = dirname(fileURLToPath(import.meta.url));

/** A screenshot's name: letters, digits and . _ -, 1 to 128 characters,
 *  not starting with . or -. */
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Refuse with a message on stderr and a non-zero exit. */
function fail(message: string): never {
  console.error(`token-radar: ${message}`);
  process.exit(1);
}

/** The snapshot's path: --input <file|dir>, or /input/snapshot.json.
 *  A directory means its snapshot.json. */
function snapshotPath(): string {
  const at = process.argv.indexOf('--input');
  if (at >= 0 && process.argv[at + 1] === undefined) {
    fail('--input needs a file or directory after it');
  }
  const given = at >= 0 ? (process.argv[at + 1] as string) : '/input/snapshot.json';
  try {
    if (statSync(given).isDirectory()) return join(given, 'snapshot.json');
  } catch {
    // Not a directory (or not there): read it as a file, and fail there.
  }
  return given;
}

/** The output directory: MAKEFUN_OUTPUT_DIR, or /output. */
function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

/** Copy a directory whole, or refuse when it is not there. */
function copyTree(from: string, to: string, what: string): void {
  if (!existsSync(from)) fail(`no ${what} directory at ${from}`);
  cpSync(from, to, { recursive: true });
}

/** The screenshots the output holds, dotfiles skipped. */
function screenshotNames(outDir: string): string[] {
  return readdirSync(join(outDir, 'screenshots')).filter((name) => !name.startsWith('.'));
}

function main(): void {
  const outDir = outputDir();
  const snapFile = snapshotPath();
  let text: string;
  try {
    text = readFileSync(snapFile, 'utf8');
  } catch {
    fail(`no snapshot at ${snapFile}`);
  }
  const snapshot = parseSnapshot(text);
  const board = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`board refused: ${issue}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board.rows })}\n`, 'utf8');
  writeFileSync(join(outDir, 'data.js'), dataScript(board, snapshot), 'utf8');
  copyTree(join(REPO_DIR, 'dashboard'), join(outDir, 'dashboard'), 'dashboard');
  copyTree(join(REPO_DIR, 'screenshots'), join(outDir, 'screenshots'), 'screenshots');

  const shots = screenshotNames(outDir);
  if (shots.length < 3) {
    fail(`screenshots/ holds ${shots.length} images, needs at least 3`);
  }
  for (const name of shots) {
    if (!SHOT_NAME.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`);
    }
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(
    `token-radar: ${board.rows.length} rows (${board.watchlistSize} watchlist, ${board.earlySize} early), ` +
      `${board.liveSize} live, ${shots.length} screenshots, dossier ${dossier.length} bytes`,
  );
}

main();
