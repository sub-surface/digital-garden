---
title: HeXO Theory
description: Notes on infinite Connect-6 on a hexagonal board, and the conjecture that perfect play is a quasicrystal.
tags:
  - thoughts
  - games
created: 2026-06-14
layout: article
id: blog
growth: seedling
---

HeXO is a game I've been playing and picking apart for a while: **infinite
Connect-6 on a hexagonal board**. No edges, no corners — just an endless field of
hexagons and a single rule about getting six in a row. It looks simple. It is not.

The short version of what follows: there is good evidence that *perfect play in
HeXO draws a quasicrystal* — an aperiodic, six-fold-symmetric pattern of the same
mathematical family as a Penrose tiling. This page is the readable tour. The
technical scaffolding is folded into the `+/-` blocks; expand them if you want the
numbers.

![[hexo-strategy-fractal.png]]
> —*A verified recursive strategy pattern (depth 2, inflation 5). Six-fold
> symmetry radiating from a single origin stone — exactly the shape the central
> conjecture predicts.*

## The rules, in plain terms

Picture the infinite hex grid as the **Eisenstein integers**, `Z[ω]` — the natural
number system for a triangular lattice. Two players take turns placing stones.
Black opens with **one** stone; after that, everyone places **two** stones per
turn (the "1-2-2" rule). You win by making **six stones in a line** along any of
the three hex axes.

That win condition is secretly a piece of number theory: six in a row is exactly a
*length-6 arithmetic progression with unit step* in `Z[ω]`. The whole game is the
combinatorics of those progressions.

```telescopic
- The three winning axes are the unit directions of the lattice:
	- `u1 = (1, 0)` — the q-axis
	- `u2 = (0, 1)` — the r-axis
	- `u3 = (1, -1)` — the diagonal
		- A win is any six consecutive cells along one of these,
		- starting anywhere on the infinite board.
- The 1-2-2 turn rule matters more than it looks:
	- Black's single opening stone breaks the board's symmetry,
		- and the defender's "budget" of 2 stones per turn
		- is the number that decides whether a threat can be answered.
```

## Why it's interesting

Most of the depth comes from one tension. The board is perfectly symmetric — you
can rotate it by 60° or reflect it and nothing changes. But the *game* isn't:
Black's first stone picks a centre, and from then on every forced reply propagates
that asymmetry outward. **A symmetric arena, played asymmetrically.**

A periodic, repeating pattern can't be optimal — any repeat gives your opponent a
period to exploit. But total disorder can't be optimal either; the threats are too
structured for that. What's left in between is the interesting case: **aperiodic
order**. Order without repetition. That's a quasicrystal.

## The central conjecture

> **Perfect play in HeXO produces a quasi-crystalline pattern: aperiodic,
> six-fold (D6) symmetric, built from a substitution rule whose growth constant is
> a Pisot number.**

In words: optimal play tiles the plane with a small set of recurring local shapes,
each of which "inflates" into a larger copy of the whole at a fixed ratio — and
that ratio is a special kind of algebraic number (a *Pisot* number) that forces the
pattern to be aperiodic with a sharp, point-like diffraction spectrum. The same
mathematics that explains real physical quasicrystals.

```telescopic
- The argument has four moves:
	- **No translation symmetry** — the origin stone rules out any repeating period.
	- **D6 symmetry survives** — rotations/reflections are symmetries of both the
		lattice and the rules, so a unique optimal strategy is six-fold symmetric.
	- **Self-similarity** — a threat at radius r forces a reply at r+5 (six minus
		one), which forces another at r+10... If the local shapes are finite in
		number, this *is* a substitution tiling.
	- **Pisot property** — by the Thurston-Kenyon theorem, a Pisot inflation
		constant guarantees aperiodicity plus a pure-point (Bragg) spectrum.
- Candidate constants in the right range:
	- the tribonacci constant (~1.3247),
	- the plastic number (~1.3247),
	- the golden ratio (~1.618).
```

## What the bots actually show

I've built a small zoo of bots — hand-crafted threat-players, a pairing
"mirror" strategy, and neural cellular automata — and had them play millions of
games against each other. The point of all that self-play is to *look at the
patterns* the strong agents leave behind and ask whether the quasicrystal shows up.

It does, at least partly.

![[hexo-diffraction.png]]
> —*Diffraction pattern of strong self-play (Combo-v2). The bright, periodic-looking
> peaks are the signature of long-range order — a random scatter of stones would be
> a featureless blur instead.*

When you take the stone positions from strong self-play and compute their
diffraction spectrum — literally, treat the stones like atoms and shine maths at
them — you get **sharp Bragg peaks**, the fingerprint of a quasicrystal. Random
placement gives nothing.

```telescopic
- The headline numbers (all from self-play, with confidence intervals):
	- **Bragg99 ~ 0.51** (pure-point fraction) in long Combo-v2 self-play,
		- versus **0.055** for random placement. The order is real.
	- The stone set is a **Delone / Meyer set** — gaps stay bounded, spacing
		stays uniform as games grow (the formal precondition for a quasicrystal).
	- Black has a **first-player advantage** (~0.53 win share once a centre-bias
		bug was fixed), and a **pairing strategy** (reflect every move through the
		origin) never loses to a random opponent.
	- Strong play is **decisive, not drawish** — unlike infinite Hex, which is a
		draw, HeXO games end. That difference is the key to which maths applies.
- The one thing *not* yet settled is the headline: does the description length of
	a self-play corpus grow slowly (quasicrystal) or fast (no finite structure)?
	That measurement is the whole ballgame.
```

## Where it sits in the zoo of infinite games

There's a beautiful result by Joel David Hamkins and Davide Leonessi that
**infinite Hex is a draw** — the second player can always mirror their way to a
stalemate. HeXO is its more tractable cousin. The reason is a precise one from
descriptive set theory: in HeXO you can *see* a win the moment it happens, so the
classical determinacy theorems apply directly. In infinite Hex a "win" is an
infinite path you can never finish observing, which is why it needs much heavier
machinery — and ends in a draw.

```telescopic
- In the Borel hierarchy:
	- HeXO's payoff ("someone has six in a row") is **Σ⁰₁ (open)** —
		- observable in finite time, so **Gale-Stewart determinacy** applies directly.
	- Infinite Hex's payoff ("someone has an infinite path") sits much higher, at
		**Σ⁰₇** — irreducibly infinitary, hence a draw.
	- HeXO is *two-plus levels lower*. That's not a weakness — it's the reason
		**finite-horizon measurement** (diffraction, description length) is the right
		tool here, rather than infinitary determinacy arguments.
```

## A second way in: the algebra of threats

Running alongside the "global pattern" view is a more local one I find just as
beautiful. Every position generates a hypergraph of *obligations* — threats the
defender must answer. The key quantity is the **transversal number** τ: the
smallest number of moves that kills every threat at once. Since the defender only
has two stones per turn, **a position forces a win exactly when τ > 2.**

The surprise from sweeping Connect-k for many k: **parity rules everything**.
Whether the urgent layer of threats lands on the attacker or the defender flips
cleanly with whether k is odd or even. (Primality turns out to be only a faint
second-order effect.) Connect-5 and Connect-7 are the cleanest "prime
laboratories" for studying it.

```telescopic
- The local picture is a "periodic table" of forcing **atoms**:
	- minimal threat-shapes with τ > 2, mined directly from play.
	- Openings get scored as *compositions* of these atoms.
	- These atoms are almost certainly the **substitution tiles** of the global
		conjecture — the local generator of the global quasicrystal. Same object,
		two ends of the telescope.
- A related thread builds quasicrystals *algebraically* on the same lattice,
	using the construction from the 2025 disproof of the Erdős unit-distance
	conjecture — and small cases come out strongly Bragg-ordered (~0.84).
```

## Open questions

This is very much a [[getting lost|work in progress]]. The live questions:

- **The headline test.** Does the description length of strong self-play grow like
  `log N` (finite structure → quasicrystal confirmed) or like `N` (no finite
  structure → conjecture refuted)? This is the experiment everything is built to
  settle.
- **Two routes, one number.** The inflation constant can be estimated two
  independent ways — from description-length scaling, and from the spacing of the
  diffraction peaks. Do they agree? If they do, that's the strongest possible
  evidence.
- **Is it actually NP-hard?** Someone in the Discord sketched a reduction from
  3-SAT suggesting HeXO is NP-hard. I haven't seen a formal proof yet — and it's a
  *different* axis of difficulty from the set-theory result above. The threat-atom
  framework feels like the natural place to build the gadgets. Genuinely open.
- **A bot you can play.** I want a lightweight HeXO bot living right here on the
  site, with a leaderboard. The engine exists; it needs a friendlier face.

---

If any of this is your kind of thing, the bots, experiments, and the full write-up
live on [GitHub](https://github.com/sub-surface/hexo-theory). Come [[getting
lost|get lost]] in it.
