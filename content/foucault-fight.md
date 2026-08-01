---
title: I could take Foucault in a fight
description: A rigorous combat assessment. Ten thousand simulated bouts. The results are not encouraging and the reasons are structural.
tags:
  - thoughts
  - philosophy
created: 2026-08-01
id: blog
layout: article
growth: becoming
---

The claim has been made, at this point, several times and in several rooms, and it has never once been examined. So let us examine it.

The proposition: **that I, an ordinary person of average build, could defeat [[Michel Foucault]] in unarmed single combat.**

I want to say at the outset that I believed this. I no longer do, and I want to be precise about where the belief failed, because it did not fail where I expected.

---

## Tale of the tape

| | Challenger | M. Foucault |
|---|---|---|
| **Height** | 5′ 11″ | 5′ 8″ |
| **Reach** | Adequate | Shorter, and irrelevant — see §3 |
| **Weight class** | Middleweight, self-assessed | Unclassifiable |
| **Stance** | Orthodox | Refuses the category |
| **Training** | Two months of boxing in 2019 | The Collège de France |
| **Headwear** | None | None. Decisively none. |
| **Documented aggression** | One incident, aged 14, unresolved | Institutional, sustained, total |

The bald head is not a joke and I will not treat it as one. There is nothing to grab. Twenty percent of my improvised strategy was hair and it evaporated during the weigh-in.

---

## Stat block

**MICHEL FOUCAULT** — *Medium humanoid (theorist), chaotic lawful*

**AC** 17 (turtleneck, discourse)
**HP** 112
**Speed** 30 ft., plus a reaction he is always taking

> **Panopticon** *(passive).* Foucault cannot be surprised. He does not need to see the punch; it is sufficient that the punch could be seen. The challenger, aware of this, begins modifying his own strikes before they are thrown. Attacks made against Foucault have disadvantage, applied by the attacker to himself, voluntarily, which is the point.

> **Genealogy** *(1/turn).* Rather than parry, Foucault attacks the *origin* of the stance. The challenger's guard is revealed to be a contingent nineteenth-century development arising from specific institutional pressures and not, as assumed, the natural way a body protects itself. The guard drops. It does not come back up.

> **Power Is Everywhere** *(passive).* The referee is compromised. The ring is compromised. The rules under which a "fight" can be "won" were written by the same apparatus that produced the challenger's desire to win it. There is no neutral corner. There was never a neutral corner.

> **Reaction — Docile Bodies.** When the challenger successfully lands a blow, Foucault may, as a reaction, note that the challenger has been trained to do that.

---

## Method

Ten thousand bouts, three rounds each, resolved with the standard scoring model. Fighter strength is expressed as an Elo rating and the expected score of the challenger against Foucault is the usual logistic:

$$E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}$$

I entered the challenger at $R_A = 1500$ — the default, and generous, since the default is what you assign to someone about whom nothing is known, and something is known. Foucault I entered at $R_B = 1500$ also, on the grounds that he was a scholar in his fifties and I was not going to insult the man.

This gives $E_A = 0.5$. An even fight. That is what the model says and the model is wrong, and finding out *why* it was wrong was the entire value of the exercise.

## Results

| Outcome | Bouts | % |
|---|---|---|
| Challenger wins by decision | 402 | 4.0 |
| Challenger wins by stoppage | 61 | 0.6 |
| Draw | 118 | 1.2 |
| Foucault wins by decision | 1,247 | 12.5 |
| Foucault wins by stoppage | 0 | 0.0 |
| **Bout reclassified as a disciplinary procedure mid-round** | **6,904** | **69.0** |
| Challenger concedes the frame and begins asking questions | 1,268 | 12.7 |

Note the empty row. **He never knocks me out.** Not once in ten thousand. He does not have to and it is not the kind of thing he does.

Note also the row that ate the distribution. In sixty-nine percent of bouts the fight *stops being a fight* — not by anyone's decision, but because the apparatus surrounding it (the ring, the count, the judges' cards, the ranking that follows) is recognised, mid-round, as the same apparatus that sorts, times, measures and files people everywhere else. Once seen it cannot be unseen. The challenger is still swinging. The swinging has become data.

## Sensitivity analysis

I re-ran it with the challenger at 1800 — a genuine fighter, which I am not.

The win rate moves from 4.6% to 7.1%. The reclassification rate does not move at all. It is invariant to how hard I can punch, which is the finding, and which took ten thousand bouts to produce a result that [[Gilles Deleuze]] would have given me over lunch.[^deleuze]

---

## Conclusion

I could not take Foucault in a fight, and the reason is not that he was stronger. He was not stronger. The reason is that "a fight" is a thing with rules, a winner, a record, and a judge, and I would be the only one of us in there who still believed in all four.

You cannot beat a man in a contest he has already described.

I maintain, for the record, that I could take Wittgenstein.[^witt]

[^deleuze]: He would also have declined to score it, which is its own kind of loss.
[^witt]: I have run this. It is worse. He does not fight; he asks what I mean by "fight," accepts my answer, and then demonstrates that under it the bout concluded some minutes ago and I have been shadow-boxing a grammatical error. I do not intend to publish those numbers.
