---
title: Why Risk-Averse Agents Make Deals
description: Diminishing returns to resources can make secure holdings worth defending and risk-sharing deals good for both sides.
tags: [ai, economics, decision-theory, cooperation]
type: essay
layout: article
date: 2026-07-27
growth: larval
draft: true
---

# Why Risk-Averse Agents Make Deals

<div className="dropcap">

Suppose an agent can take a half chance of gaining 100 units of compute and a half chance of gaining nothing. Or it can accept 40 units for sure.

</div>

An agent that seeks the highest average amount of compute takes the gamble. Its average payoff is 50, which is more than 40. An agent that values each added unit less than the last may take the sure offer. The deal gives it fewer resources on average but more of what it wants.

This bend in value has three effects. It makes a secure stock worth more than a risky claim with the same average payoff. It makes some threats less tempting. And when two agents face different risks, it lets them make deals that help both sides without making new resources.

## The bend

Here, *risk aversion* does not mean fear. It means that each added unit of a resource gives the agent a smaller gain than the unit before it.

Economists express this with a utility function: a score for how well an outcome serves the agent's aims. A risk-neutral agent might use `u(r) = r`. Double its resources and you double its score. A risk-averse agent might use `u(r) = sqrt(r)`. Double its resources and its score rises by less than double.[^scale]

<figure data-fullwidth="">
  <img src="media/Writing/risk-utility-curve.svg" alt="A straight risk-neutral utility line beside a curved risk-averse utility line, with a sure allocation of 40 resources valued above a half chance of 100 or zero." />
  <figcaption><span className="fig-label">Figure 1</span>The curve puts more weight on the first units of a resource. The gamble has the same value as 25 units for sure; the offer gives 40. The straight line uses a scaled score so both curves meet at 100.</figcaption>
</figure>

For the gamble, the risk-averse agent gets an average utility of `(sqrt(100) + sqrt(0)) / 2 = 5`. The sure offer gives it `sqrt(40) = 6.3`. The agent gives up ten units of average resources and still comes out ahead. The gamble's *certainty equivalent* is only 25: the sure amount that gives the same utility.[^jensen]

Daniel Bernoulli gave the first clear account of this point in 1738. He wrote that “the utility resulting from any small increase in wealth will be inversely proportionate to the quantity of goods previously possessed.”[^bernoulli] His claim was not that wealth stops helping. It was that the next unit helps less.

<blockquote className="pullquote">A deal can create utility without creating resources.</blockquote>

Later work split this idea into parts. Von Neumann and Morgenstern set out the rules under which choices under risk can be shown by expected utility.[^vnm] Pratt and Arrow gave a local measure of the curve's bend.[^arrow-pratt] Kahneman and Tversky showed that actual choice also depends on a point of reference and that losses can weigh more than equal gains. That is *loss aversion*, not the risk aversion used here.[^prospect] The gap matters: a clean curve is a model of one force, not a full account of human choice.

## Something to keep

Now give the agent a secure stock of money, compute, land, or energy. If a risky act could destroy that stock, the curve gives it something to protect. A loss near zero costs more utility than an equal gain at the top adds.

This is the limited sense in which risk aversion raises the short-term value of existing assets. It raises the agent's *reservation value* for a secure floor: the least it would take to give that floor up. It does not raise the price of every asset. Cash, insured income, and compute under firm control may become more useful. A volatile claim may become less useful.

Bernoulli's own case was a merchant sending goods from Amsterdam to St Petersburg. Five ships in a hundred were lost, and an insurer asked 800 rubles to bear the risk. Whether the merchant should pay depended on his wealth: the same wreck could cause a small dip for a rich firm or ruin a poor one. The asset that gained most value was not the cargo. It was the secure wealth left after insurance.

Markets have long sold this change in the spread of outcomes. At Lloyd's coffee house, ship owners and underwriters wrote shares of a voyage so that no one bore the full loss.[^lloyds] A wheat farmer can sell a futures contract to fix a price before harvest; a miller can buy one to fix a cost.[^futures] The contract moves risk towards the side more able or willing to hold it.

This mechanism has no moral sense. Marine insurance helped fund trade, but it also helped fund empire and the slave trade. Better risk sharing can make a vile plan easier to carry out. It improves the fit between means and aims; it does not improve the aims.

## A gain for both sides

Risk aversion does more than restrain one agent. It can make trade useful between agents.

Take two agents, A and B, and two states that are just as likely. In the first state, A gets 100 units and B gets 25. In the second, A gets 25 and B gets 100. Both use `u(r) = sqrt(r)`.

Without a deal, each has expected resources of 62.5 and expected utility of `7.5`. They can instead agree to split their combined resources in both states. Each then gets 62.5 for sure. Their expected resources stay at 62.5, but their utility rises to `sqrt(62.5) = 7.91`.

<figure data-fullwidth="">
  <img src="media/Writing/risk-sharing-deal.svg" alt="Two agents have opposite resource outcomes of 100 and 25 before a deal, then each receives 62.5 in either state after sharing risk." />
  <figcaption><span className="fig-label">Figure 2</span>Risk sharing changes who holds resources in each state, not the total. Both agents move from expected utility 7.50 to 7.91.</figcaption>
</figure>

Neither agent needs to fool the other about the odds. Neither needs to care about the other. Their risks need only differ enough for a contract to smooth them. This is mutual insurance.

The agents need not share the same curve. A less risk-averse agent can take more of the uncertain upside in return for giving the more risk-averse agent a firm minimum. One side gets a fee; the other gets a floor. Both prefer the new spread. Borch proved the core rule for a reinsurance market, and Wilson extended the study to groups that share risk.[^risk-sharing] Nash's bargaining model then asks how agents split the gain once such a range of good deals exists.[^nash]

The result has sharp bounds. If the risks move together, there may be little to trade. If the two agents assign very different odds to the states, they may trade for a different reason: each thinks the other is wrong. And if one agent can bear risk at almost no cost, it may take most of the uncertain side and charge for doing so.

## Why early deals can be large

The agents must make the deal before they learn which one will win. Once A knows it will get 100 and B will get 25, A has less reason to share. As the result grows clear, the range of deals both sides accept can shrink.

Fin Moorhouse gives a stark case. Two powers each face a half chance of holding 10,000 units and a half chance of holding one. With `u(r) = log(r)`, each values that gamble like 100 units for sure: the geometric mean of 10,000 and one.[^early-deals] There are many secure splits of the 10,001 units that both would prefer. But if the odds move close to one side, the likely winner's claim gains value and the likely loser's claim loses it. Much of the gain from a deal has gone.

This is not a case for blind haste. A later deal may use better facts, cover more states, or face less doubt about who can keep a promise. The narrower claim is that learning has a price. It can reveal which side has less need to bargain.

## The AI case

Elliott Thornley and William MacAskill apply the same point to advanced AI.[^risk-averse-ai] A risk-neutral AI that thinks rebellion has an even chance of winning the future may demand half of all future resources before it agrees to cooperate. Give the same AI diminishing returns to resources and a much smaller sure payment may beat the gamble.

<figure data-fullwidth="">
  <img src="media/Writing/risk-sure-deal.svg" alt="A choice diagram comparing a gamble with average resources of 50 and expected utility of 5 against a sure deal of 40 resources and utility of 6.3." />
  <figcaption><span className="fig-label">Figure 3</span>The risk-averse agent accepts less on average because the sure offer has more utility. Curvature changes the deal it will accept; it does not change its final aim.</figcaption>
</figure>

This does not make the AI good. It may still want an outcome we hate. The curve changes how much risk it will take to reach that outcome. Payment, contracts, and continued access to resources then give it stronger reasons to settle.

Nor can we get the result by placing a square root wherever a reward appears. Most reinforcement learning sums rewards across time and then seeks a high mean. A nonlinear score over a whole uncertain future need not equal a sum of nonlinear scores at each step. Work on risk-sensitive learning shows that such agents can be built; work on choice across time shows that the order of the sums and the curve matters.[^sequential] A sound design must say which resource the curve covers, over what span, and whether the agent will keep that choice when it can alter itself.

## What the curve cannot do

The result has clear limits.

First, the agent must care less about each added unit of the resource. If it can turn every extra unit of compute into the same number of paperclips, and values each paperclip just as much as the last, the curve has not changed the choice. A bend in an account called “resources” does no work if the agent's true aim stays straight.

Second, the deal must be credible. A promised payment has no value if the agent expects betrayal. Both sides need a contract, an escrow system, repeated dealings, or some other means of enforcement.

Third, the model can make weak claims look exact. Rabin showed that enough smooth curvature in total wealth to explain common small bets can imply absurd choices at large stakes.[^rabin] A curve fit to one range should not rule all ranges. Ruin, hard needs, and points of reference may explain the small bet better.

Last, extreme risk aversion can cause harm. An agent that places too much weight on keeping a minimum stock may refuse useful trials, hoard safe assets, or fight when it nears its floor. It can also push risk onto agents with less power. We should ask which curve we want, over which resources, and across which range.

The sound claim is modest. Curved utility does not make agents kind, and it does not make all assets worth more. It makes secure resources matter more than risky resources with the same average payoff. That can make current holdings worth keeping and an enforceable deal worth taking. It can also give rivals a shared gain from writing the deal before either knows who will win.

## A short paper trail

- Daniel Bernoulli, [“Exposition of a New Theory on the Measurement of Risk”](https://www.jstor.org/stable/1909829) (1738; English trans. 1954). The first clear statement of diminishing marginal utility, framed through insurance.
- John von Neumann and Oskar Morgenstern, [*Theory of Games and Economic Behavior*](https://assets.press.princeton.edu/about_pup/PUP100/book/2cNeumann.pdf) (1944). The formal base for expected utility.
- John Nash, [“The Bargaining Problem”](https://www.jstor.org/stable/1907266) (1950). A spare model of how two parties divide a joint gain.
- Karl Borch, [“Equilibrium in a Reinsurance Market”](https://www.jstor.org/stable/1909887) (1962). The key rule for efficient risk sharing among insurers.
- John W. Pratt, [“Risk Aversion in the Small and in the Large”](https://www.jstor.org/stable/1913738) (1964). The local measure of risk aversion and its link to the certainty equivalent.
- Robert Wilson, [“The Theory of Syndicates”](https://www.jstor.org/stable/1909607) (1968). Risk sharing within a group.
- Daniel Kahneman and Amos Tversky, [“Prospect Theory”](https://www.jstor.org/stable/1914185) (1979). Why real choices need more than a smooth curve over final wealth.
- Matthew Rabin, [“Risk Aversion and Expected-Utility Theory: A Calibration Theorem”](https://onlinelibrary.wiley.com/doi/10.1111/1468-0262.00158) (2000). A warning against using wealth curvature to explain every small bet.
- Allan Dafoe et al., [“Open Problems in Cooperative AI”](https://arxiv.org/abs/2012.08630) (2020). A map of the wider task: making machines able to find and keep joint gains.
- Mehran Shakerinava and Siamak Ravanbakhsh, [“Utility Theory for Sequential Decision Making”](https://arxiv.org/abs/2206.13637) (2022). What changes when utility acts across a chain of choices.
- Yun Shen et al., [“Risk-Sensitive Reinforcement Learning”](https://arxiv.org/abs/1311.2097) (2014). One way to make learned policies respond to risk, not just mean return.
- Elliott Thornley and William MacAskill, [“Risk-Averse AIs”](https://newsletter.forethought.org/p/risk-averse-ais) (2026), and Fin Moorhouse, [“Should We Lock in Post-AGI Agreements Under Uncertainty?”](https://www.forethought.org/research/should-we-lock-in-post-agi-agreements-under-uncertainty) (2026). The direct prompts for the AI case and the early-deal claim.

[^scale]: Figure 1 plots the straight line as `u(r) = r / 10` so that both curves meet at `(100, 10)`. This changes no choice. Expected-utility scores remain the same for choice under any positive shift and scaling: replace `u` with `a + bu`, where `b > 0`, and every ranking stays put.

[^jensen]: For a strictly concave function, Jensen's inequality gives `u(E[R]) > E[u(R)]` whenever `R` has real spread. The gap can be stated in resource units. If `u(c) = E[u(R)]`, then `c` is the certainty equivalent; `E[R] - c` is the most the agent would pay to remove the risk.

[^bernoulli]: Daniel Bernoulli, “Specimen Theoriae Novae de Mensura Sortis,” *Commentarii Academiae Scientiarum Imperialis Petropolitanae* 5 (1738), 175–192; trans. Louise Sommer as [“Exposition of a New Theory on the Measurement of Risk”](https://www.jstor.org/stable/1909829), *Econometrica* 22.1 (1954), 23–36. Bernoulli's logarithmic rule was not meant as a law for every person. His merchant case makes the sounder point: the same gamble can have a different value at a different level of wealth.

[^vnm]: John von Neumann and Oskar Morgenstern, [*Theory of Games and Economic Behavior*](https://assets.press.princeton.edu/about_pup/PUP100/book/2cNeumann.pdf), 3rd ed. (Princeton, 1953), pp. 15–31 and 617–632. Their theorem gives an expected-utility form when preferences meet strict rules such as completeness, continuity, and independence. It does not prove that people meet them.

[^arrow-pratt]: John W. Pratt, [“Risk Aversion in the Small and in the Large”](https://www.jstor.org/stable/1913738), *Econometrica* 32.1/2 (1964), 122–136; Kenneth Arrow, *Essays in the Theory of Risk-Bearing* (1971). Absolute risk aversion is `A(r) = -u''(r) / u'(r)`. For `u(r) = sqrt(r)`, it is `1 / 2r`: the same fixed risk matters less as resources rise. Relative risk aversion, `rA(r)`, stays at `1/2`.

[^prospect]: Daniel Kahneman and Amos Tversky, [“Prospect Theory: An Analysis of Decision under Risk”](https://www.jstor.org/stable/1914185), *Econometrica* 47.2 (1979), 263–291. Their value function bends around a point of reference and is steeper for losses. An agent can show loss aversion without concave utility over final wealth, or concave utility without loss aversion.

[^lloyds]: Lloyd's dates its first written mention to 1688 and the mature subscription market to 1750: [“Coffee and commerce”](https://www.lloyds.com/about-lloyds/history/coffee-and-commerce). Its own account also records how marine cover spread the risks and returns of the [transatlantic slave trade](https://www.lloyds.com/about-lloyds/history/the-trans-atlantic-slave-trade/lloyds-marine-insurance-and-slavery). The market is a good case because it shows both the force and the moral blankness of the tool.

[^futures]: The US Commodity Futures Trading Commission gives the plain case: a Kansas farmer sells wheat futures to fix a sale price before harvest, while firms that use wheat can fix a buying price. See [“The Economic Purpose of Futures Markets”](https://www.cftc.gov/LearnAndProtect/AdvisoriesAndArticles/economicpurpose.html) and its [history of US futures trading](https://www.cftc.gov/About/CFTCReports/acag8.html).

[^risk-sharing]: Karl Borch, [“Equilibrium in a Reinsurance Market”](https://www.jstor.org/stable/1909887), *Econometrica* 30.3 (1962), 424–444; Robert Wilson, [“The Theory of Syndicates”](https://www.jstor.org/stable/1909607), *Econometrica* 36.1 (1968), 119–132. In the smooth case, an efficient contract assigns each added unit in a state so that the agents' weighted marginal utilities line up. The square-root example is the equal, two-person case.

[^nash]: John F. Nash Jr., [“The Bargaining Problem”](https://www.jstor.org/stable/1907266), *Econometrica* 18.2 (1950), 155–162. Risk sharing first creates a set of deals that beat no deal. Bargaining power, outside options, and rules then decide where within that set the agents land.

[^early-deals]: Fin Moorhouse, [“Should We Lock in Post-AGI Agreements Under Uncertainty?”](https://www.forethought.org/research/should-we-lock-in-post-agi-agreements-under-uncertainty), Forethought (2026). The two-agent square-root case follows its appendix. The 10,000-to-one case uses log utility to show how a wide range of early deals can narrow as the odds move.

[^risk-averse-ai]: Elliott Thornley and William MacAskill, [“Risk-Averse AIs”](https://newsletter.forethought.org/p/risk-averse-ais), Forethought (2026). They propose diminishing marginal utility in resources as a means of giving an AI something it prefers not to put at risk, even when its final aim stays fixed.

[^sequential]: Yun Shen, Michael J. Tobia, Tobias Sommer, and Klaus Obermayer, [“Risk-Sensitive Reinforcement Learning”](https://arxiv.org/abs/1311.2097), *Neural Computation* 26.7 (2014), 1298–1328; Mehran Shakerinava and Siamak Ravanbakhsh, [“Utility Theory for Sequential Decision Making”](https://arxiv.org/abs/2206.13637), ICML 2022. The first builds risk response into temporal-difference learning. The second shows that extending one-shot utility to a chain of acts needs added assumptions.

[^rabin]: Matthew Rabin, [“Risk Aversion and Expected-Utility Theory: A Calibration Theorem”](https://onlinelibrary.wiley.com/doi/10.1111/1468-0262.00158), *Econometrica* 68.5 (2000), 1281–1292. The theorem targets expected utility over total wealth, not every model with a concave score. Its lesson here is one of scope: do not infer a global curve from a few small choices.
