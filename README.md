# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/faniadifrihandoko1/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/faniadifrihandoko1/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a dark-console dashboard that ranks pre-token protocols by implied value and shows how to farm each one. It reads a sealed snapshot of the protocol universe, scores every protocol with no token on record (TVL × seven-day growth × age with no token × chain breadth), and writes a ranked board of 178 rows: the 40-protocol watchlist plus 138 early protocols below the floor. Each row carries a seven-step farm plan with costs and times, a momentum signal, and a detail view that recomputes the model in the page. Live-token protocols are set aside with their market caps, never mixed into the ranking. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. The program writes `board.json`, `data.js`, `dashboard/` and `screenshots/` to the output directory, plus `dossier.json` from `vendor/makefun-board.ts`. Run it twice on the same snapshot and the bytes are identical.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1c6jcmp6&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
