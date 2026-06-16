# THE PREDICTOR

A roguelike where the antagonist is trained on you. Every unit hunting you maintains a live,
visible model of your behavior; the persistent Core trains on every move across every run and
never resets on death. Legibility is the central currency: it gets you zapped by adversaries
and trusted by everything else.

## Run it

No build step, no dependencies. Either:

- Open `index.html` directly in a browser, or
- Serve the folder (`npx serve .` or `python3 -m http.server`) and open the printed URL.

Progress (the Core's memory of you, floor checkpoints, settings) persists via the best
available backend: Claude artifact storage → `localStorage` → in-memory for the session.
The main menu shows which backend is live.

First time: take **CALIBRATION** from the menu — five short sandboxed rooms (~2 minutes).

## Controls

| Input | Action |
|---|---|
| Arrows / WASD / swipe | move (moving into a unit attacks it) |
| Space / `.` / tap @ | wait |
| Tap a unit | probe its objective and model |
| `Esc` | menu / resume |
| `R` (when dead) | run again |

• Between floors: choose a **PROTOCOL** to override station logic.

## Reading the board

Orange stains mark where each unit predicts you'll be — intensity is confidence, the dashed
cell is the strongest belief on the board. Stand where it expected, in range, and you're zapped;
strike from a vector it didn't predict and it dies. `LEG%` is how often recent predictions about
you were right. `≡` vaults open only above 60% — trust requires being modelable. The eye `◉/○`
marks whether the floor is monitored; `▣` caches are free to take either way, and the game keeps
two ledgers. The Warden waits on floor 5 with two containers it filled before you arrived. The
Avatar waits on floor 10 with everything the Core knows.

## Repo

```
index.html       app shell
css/style.css    presentation
js/              save, audio, core (the persistent model), game, render,
                 tutorial, menu, input, main — classic scripts, load order matters
docs/SPEC.md     full design specification: implemented systems + roadmap
```

See `docs/SPEC.md` for the design rationale, exact numbers, balance notes, and the
proposed-systems roadmap (persona masks, contracts, mesa-spawners, neural core, daily seeds).
