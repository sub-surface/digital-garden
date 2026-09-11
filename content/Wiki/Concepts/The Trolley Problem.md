---
title: "The Trolley Problem"
description: "Classical ethical dilemma distinguishing between deontological moral constraints and utilitarian outcome maximization in life-and-death trade-offs."
tags: [wiki, concept, ethics, normative-ethics, value-theory]
type: concept
layout: article
---

# Concept: The Trolley Problem

<div className="dropcap">

**The Trolley Problem** is a foundational ethical thought experiment introduced by British moral philosopher [[Philippa Foot]] in 1967 and substantially formalized by American philosopher [[Judith Jarvis Thomson]]. Originally devised to investigate the moral permissibility of abortion and the scholastic **Doctrine of Double Effect**, the scenario probes the irreconcilable tension between consequentialist welfarism (maximizing aggregate lives saved) and deontological rights constraints (the strict prohibition against using an innocent human being as a mere physical instrument).

</div>

---

## 1. Classical Formulations and Dilemmas

```
                         THE ARCHITECTURE OF TROLLEY DILEMMAS
       ┌────────────────────────────────────────────────────────────────────────┐
       │                          THE RUNAWAY TROLLEY                           │
       │           A brake failure sends a runaway train toward 5 workers.      │
       └───────────────────────────────────┬────────────────────────────────────┘
                                           │
             ┌─────────────────────────────┴─────────────────────────────┐
             ▼                                                           ▼
    [CASE 1: THE SWITCH]                                       [CASE 2: THE FOOTBRIDGE]
  Divert to spur with 1 worker?                              Push heavy stranger off bridge?
  - Action: Deflecting an existing threat                     - Action: Creating a new lethal impact
  - Intuition: ~85% Permissible                              - Intuition: ~85% Impermissible
  - Mechanism: Foreseen side-effect                          - Mechanism: Intended physical means
             │                                                           │
             └─────────────────────────────┬─────────────────────────────┘
                                           ▼
                                [CASE 3: THE LOOP VARIANT]
                     Does the track loop back behind the five?
                     - If spur loops back, the body of the 1 is
                       INDISPENSABLE to stop the trolley.
                     - Shatters the classical Doctrine of Double Effect!
```

### Case 1: The Switch (Foot, 1967)
A runaway trolley hurtles toward five track workers. A bystander stands beside a switch lever. If pulled, the trolley diverts onto a sidetrack where a single worker is standing.
* Foot formulated the dilemma in *"The Problem of Abortion and the Doctrine of the Double Effect"*:
  > "He can turn the tram on to one track and kill one man, or on to the other and kill five... The driver had to steer toward the one man to save the five; here it is a matter of saving five men at the cost of one life, but we should not say that he does it by killing the one."[^foot-trolley-67]
* **Empirical Consensus**: Over 85% of survey respondents—and 70% of professional philosophers in the 2020 PhilPapers Survey—judge that pulling the lever is morally permissible (or obligatory).

### Case 2: The Footbridge / Fat Man (Thomson, 1976, 1985)
The same runaway trolley hurtles toward five workers. You are standing on a footbridge above the track next to a very heavy stranger. Pushing him onto the tracks will stop the train with his bulk, saving the five, but killing him.
* Thomson demonstrated the asymmetrical recoil:
  > "If you push the man off the bridge, you do something to him which results in his death... You use him as a means to saving five. You violate his right to life."[^thomson-trolley-85]
* **Empirical Consensus**: Over 85% judge pushing the man to be strictly **impermissible**, even though the arithmetic of casualties (one death versus five lives) is identical to *The Switch*.

### Case 3: The Organ Transplant Surgeon
A surgeon has five patients dying of acute organ failure. A healthy patient enters for a routine medical checkup. The surgeon could painlessly kill the visitor, harvesting his organs to save the five.
* Universally condemned as abhorrent murder, illustrating that consequentialist aggregation collapses when it violates fundamental bodily integrity.

---

## 2. Theoretical Solutions & The Thomson Loop Case

### 1. The Doctrine of Double Effect (DDE)
Originating in Thomas Aquinas's *Summa Theologiae* (II-II, q. 64, a. 7), the DDE posits that an agent may permissibly cause a grave harm as an unintended, foreseen **side-effect** of pursuing a good end, provided:
1. The act itself is morally good or indifferent.
2. The agent intends the good end and does not intend the bad effect as either an end or a means.
3. The good end is proportional to the bad effect.

$$\text{DDE Condition: } \neg \text{Intends}(A, \text{Harm}) \land \text{Foresees}(A, \text{Harm}) \land (\text{Good} \ge \text{Bad})$$

In *The Switch*, the death of the lone worker is an unintended side-effect: if he miraculously lept off the spur, the bystander would rejoice. In *The Footbridge*, his physical destruction is the necessary physical mechanism: if he moved, the plan would fail.

### 2. Thomson's Loop Case: The Refutation of Classical DDE
In her landmark 1985 paper *"The Trolley Problem"*, Judith Jarvis Thomson devised the **Loop Case** to dismantle the Doctrine of Double Effect:
* The sidetrack is not a dead-end; it loops back and rejoins the main track right behind the five workers.
* The only reason the five survive if you pull the lever is that the train's momentum is halted by the dense physical bulk of the single worker on the loop! If he were not there, the trolley would travel around the loop and kill the five from behind anyway.
* Therefore, the single worker's body is **used as an indispensable means** to stop the train.
* Under the classical DDE, pulling the switch in the Loop Case must be impermissible. Yet almost everyone intuitively judges that pulling the switch in the Loop Case remains **permissible**!
* Thomson concluded that whether someone is used as a means cannot be the sole factor determining permissibility.

### 3. Frances Kamm's Principle of Permissible Harm (PPH)
To resolve the Loop paradox, Frances Kamm proposed the **Principle of Permissible Harm (PPH)** and the **Doctrine of Triple Effect** (*Intricate Ethics*, 2007):
* Harm is permissible if it is an aspect of, or caused by, the greater good itself.
* Harm is impermissible if the greater good is causally produced *by* the harm to the victim.
* In the Loop, diverting the train to the side track is already an act of saving the five; the contact with the worker is an effect of the redirective good, rather than the moral justification of the redirective act.

### 4. Foot's Negative versus Positive Duties
Philippa Foot explained the divergence through the asymmetry between:
* **Negative Duty**: The duty to abstain from injuring or killing ($O(\neg \text{Kill})$).
* **Positive Duty**: The duty to provide aid or rescue ($O(\text{Aid})$).
* In the transplant case, the surgeon's negative duty not to kill the healthy visitor trumps the positive duty to save five patients.
* In *The Switch*, the threat is already unloosed in the world, and redirecting it involves a conflict between two negative duties of minimizing the impact of a runaway hazard.

---

## 3. Formal Deontic Representation

The problem can be modeled in deontic modal logic ($O$ = Obligatory, $P$ = Permissible, $F$ = Forbidden):

$$
\begin{aligned}
\text{Consequentialist Axiom:} & \quad \forall a, a' \in \text{Actions}, \, [U(a) > U(a')] \implies O(a) \\
\text{Kantian Constraint:} & \quad \forall x, \, \text{Person}(x) \implies F\big(\text{TreatAsMeans}(x)\big) \\
\text{Foot's Priority Rule:} & \quad \text{Weight}\big(O(\neg \text{Harm})\big) \gg \text{Weight}\big(O(\text{Aid})\big)
\end{aligned}
$$

The tension arises because the consequentialist axiom prescribes pulling the lever in *both* Switch and Footbridge, whereas pure Kantian deontology struggles to explain why turning the switch does not count as killing the one worker.

---

## 4. Neuroscience & Autonomous Systems

* **Dual-Process Moral Theory**: Neuroscientist Joshua Greene demonstrated with fMRI that *The Footbridge* triggers emotional centers (amygdala, medial prefrontal cortex) associated with "personal" moral violence, issuing an automatic deontological veto. *The Switch* activates the dorsolateral prefrontal cortex, computing impersonal utilitarian trade-offs.
* **Autonomous Vehicle Algorithms**: Modern machine ethics applies the trolley problem to autonomous driving systems (e.g., MIT's *Moral Machine* experiment). When an inevitable collision occurs, should autonomous vehicles prioritize passenger survival, pedestrian protection, or strict minimize-casualty algorithms?

---

## 5. In Phil Chat

In Philchat, the Trolley Problem serves as the canonical battleground between channel welfarists and rights theorists:
* In Volume I, debates over **[[The Pleasure Box]]** mirrored the Footbridge dilemma: [[jere|Jere]] argued that aggregate utils override individual autonomy, while [[chair|Chair]] invoked Kantian moral side-constraints to argue that using persons as instruments is categorically illegitimate.
* The loop case is frequently weaponized by [[janne|Janne]] to demonstrate that intuitive utilitarian claims covertly rely on arbitrary causal framing.

---

## References

[^foot-trolley-67]: Foot, Philippa. "The Problem of Abortion and the Doctrine of the Double Effect." *Oxford Review* 5 (1967): 5–15. See [[Bibliography#Foot-Trolley-1967]].
[^thomson-trolley-85]: Thomson, Judith Jarvis. "The Trolley Problem." *Yale Law Journal* 94, no. 6 (1985): 1395–1415. See [[Bibliography#Thomson-Trolley-1985]].

* Kamm, Frances. *Intricate Ethics: Rights, Responsibilities, and Permissible Harm*. Oxford University Press, 2007. See [[Bibliography#Kamm-Ethics-2007]].
* Greene, Joshua D., et al. "An fMRI Investigation of Emotional Engagement in Moral Judgment." *Science* 293, no. 5537 (2001): 2105–2108.

## See Also

* [[Philippa Foot]]
* [[Utilitarianism]]
* [[Deontology]]
* [[The Experience Machine]]
* [[The Pleasure Box]]
* [[Humes Guillotine|Hume's Guillotine]]
