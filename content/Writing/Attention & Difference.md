---
title: Attention & Difference
description: Thoughts on philosophy & computation
tags: [writing, philosophy, AI]
type: essay
layout: article
date: 2026-07-10
growth: larval
published: "true"
quote: The soul never thinks without a mental image.
quote-author: — Aristotle, De Anima
---

  

# ⁙ Zero

<blockquote className="pullquote"> 
Catastrophe is the past coming apart. <br />
Anastrophe is the future coming together. <br />  
—Nick Land & Sadie Plant, *Cyberpositive.*[^landplant]
</blockquote>  


<div className="dropcap">

What a strange time it is, to be caught between informational, cultural, political revolutions. Better yet, what awaits the [[rosi-braidotti|convergence]] between a billion micro-revolutions each anastrophising molecular orderings, coalescing into broiling molar [reconfigurations](https://pdoom.subsurfaces.net) at every opportunity. 
<br />
Have we seen something yet?  
have you been paying attention?  
</div>  

---
>[!note] attention(n.)
> > late 14c., _attencioun_, "a giving heed, active direction of the mind upon some object or topic," from Old French _attencion_ and directly from Latin _attentionem_ (nominative _attentio_) "attention, attentiveness," noun of action from past-participle stem of _attendere_ "give heed to," literally "to stretch toward," from _ad_ "to, toward" + _tendere_ to stretch".
> —[Online Etymology Dictionary](https://www.etymonline.com/word/attention)

---

## ⁞ A Tension Is All You Need

<blockquote className="pullquote"> 
Not much attention is paid to indexes, in other words, the territorial states of things constituting the designatable. Not much attention is paid to icons, that is, operations of reterritorialization constituting the signifiable. Thus the sign has already attained a high degree of relative deterritorialization; it is thought of as a symbol in a constant movement of referral from sign to sign. <br />
—Deleuze & Guattari, *A Thousand Plateaus*.
</blockquote>   

The title of Vaswani et al.’s pivotal 2017 paper[^1] is an anastrophe of, "All You Need Is Love" by The Beatles - and boy, did it come together. With over 258k citations, AIAYN is one of the most-cited papers in the 21st century. It signals, "insider" to any of your tech-minded friends, and functions as a "eureka!" quip whenever your home-grown gpt-2 discovers rhyming couplets.  

On the [Stanford Encyclopedia](https://plato.stanford.edu/entries/attention/), Attention is described as *"the selective directedness of our mental lives"*, and it's highlighted that scholars differ on the appropriate mode to take when talking about attention - it remains conceptually unstable, naming many things, which motivated me to write this essay. 

Of the infinite possible distinctions one could make, at least three distinct modes of attention emerge here, each blending by analogy into the others as and when they occur together:

I. Transformer Attention  
	- A field of keys and values through which a query is differentially routed.  
II. Cognitive Attention  
	- The immanent directionality of a subject's cognitive gaze.  
III. Photographic Attention  
	- The interplay of image and imaged in the production of a spectatorial event.  

> Instances of attention differ along several dimensions. In some of its instances attention is a _perceptual_ phenomenon; in some it is a phenomenon related to _action_; and in others it is a purely _intellectual_ matter of giving thought to some question. In some instances the selectivity of attention is _voluntary_. In others it is driven, independently of the subject’s volition, by the high salience of attention-grabbing items in the perceptual field. The difficulty of giving a unified theory of attention that applies to all of these instances makes attention a topic of philosophical interest in its own right. 
> —[[Attention (Stanford Encyclopedia of Philosophy)]].  

Meanwhile, by analogy,

> An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of the values, where the weight assigned to each value is computed by a compatibility function of the query with the corresponding key.

Is there a tension here? Is it reasonable to try and interpret the functional description of a machine-learning term back to its anthropomorphic root?  Well, while there may be no Husserlian intentionality here (we'll get to that), our [[Roland Barthes|dead author]] insists, zombified, that perhaps it is not that which does the intending we should care about, but what is attended to:

> [...] for *punctum* is also: sting, speck, cut, little hole—and also a cast of the dice. 
> A photograph's punctum is that accident which pricks me (but also bruises me, is poignant to me).

or elsewhere

> [...] my attention is distracted from her by accessories which have perished; for clothing is perishable, it makes a second grave for the loved being. In order to "find" my mother, fugitively alas, and without ever being able to hold on to this resurrection for long, I must, much later discover in several photographs the objects she kept or her dressing table, an ivory powder box (I loved the sound of its lid), a cut-crystal flagon, or else a low chair which is now near my own bed, or again, the raffia panel she arranged above the divan, the large bags she loved.

These expressions from *[[Camera Lucida]]* (one of the great works on photography), if we are to take [[the image as supreme metaphor for knowledge]], suggest that it cannot merely be the intending act of the eye or the machine which picks out the mother from an assortment of belongings, nor distinguishes a disjunction in its subject, but is cut out by the very thing we set our attention to, that we are pierced, stung, bruised and left changed. In this, I recognise a familiar, if unfortunate analogue, to a [[the noumenon has fangs|fanged noumenon]]; an outside with its own ideas of what I will become.  

> ![](https://upload.wikimedia.org/wikipedia/commons/8/8f/The-Transformer-model-architecture.png)  
> *"Attention is all you need."


[^1]: For the uninitiated: see [here](https://proceedings.neurips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf) ([alt](https://arxiv.org/abs/1706.03762) | [wiki](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need))

---

## ⨝ Attending to Difference 
### (That Makes a Difference)


> Many photographs are, alas, inert under my gaze. But even among those which have some existence in my eyes, most provoke only a general and, so to speak, polite interest: they have no *punctum* in them: they please or displease me without pricking me: they are invested with no more than *studium*. 
> The *studium* is that very wide field of unconcerned desire, of various interest, of inconsequential taste: *I like / I don't like*. The *studium* is of the order of *liking*, not of *loving*; it mobilizes a half desire, a demi-volition; it is the same sort of vague, slippery, irresponsible interest one takes in the people, the entertainments, the books, the clothes one finds "all right."    
> 
> [...]
> 
> Since the Photograph is pure contingency and can be nothing else (it is always something, that is represented) —contrary to the text by which, by the sudden action of a single word, can shift a sentence from description to reflection—it immediately yields up those "details" which constitute the very raw material of ethnological knowledge.  
> —Roland Barthes, *Camera Lucida.*

> There is a false profundity in conflict, but underneath conflict, the space of the play of differences. The negative is the image of difference, but a flattened and inverted image, like the candle in the eye of the ox - the eye of the dialectician dreaming of a futile combat?
> —Gilles Deleuze, *Difference and Repetition*

*If attention is one operation wearing three costumes, what is the operation? What supplies the difference — the attender or the field? Which differences fail to register at all?*

Bateson, hunting the elementary unit of [[information]], lands on a phrase that has since escaped into the wild: *"a difference which makes a difference."*[^bateson] 

In the transformer, the mechanism is almost embarrassingly literal. Queries score their compatibility with keys; softmax converts scores into weights; the weighted sum of values is what the token comes to see. And here is a small algebraic fact with outsized consequence: softmax is translation-invariant. Shift every score by the same amount and nothing whatsoever changes.[^softmax] The mechanism cannot see absolute values — only differences register. Attention is a difference-detector that spends its entire budget (the weights must sum to one) on what differs. That's it; that's the whole trick.

![[Neuronpedia_AIAYN.png]]
> *"Attention is all you need" - Neuronpedia Circuit Tracer (Explore it [here](https://www.neuronpedia.org/gemma-2-2b/graph?slug=attentionisallyo-1783800951646))*

Phenomenology got both directions of this before the machine did. Husserl's early figure is the *ray* — attention as a beam of regard emanating from the ego toward its object.[^husserlray] But the later Husserl of the passive syntheses reverses the arrow: *affection*, the allure the given exercises on the ego, a pull that precedes any turning-toward.[^husserlallure] The beam and the bait. William James plants his flag at the first pole — "My experience is what I agree to attend to"[^james] — and Simone Weil, of all people, at the second: attention as the suspension of thought, leaving it "detached, empty, and ready to be penetrated by the object."[^weil] Penetrated: Weil is closer to the punctum than to the productivity seminar she gets conscripted into.

![[Husserl-Attention-Nature.png]]
> Husserl's Intention, Demmin (2025)[^husserldiagram]

So try the analogy properly. The *studium* is attention spread politely across the field — high entropy, the budget diffused, "*I like / I don't like*," a demi-volition pricing everything and being pierced by nothing. The *punctum* is a spike: one detail seizing nearly the whole budget, unbidden, from outside the will. The analogy is good — and it strains exactly where it gets interesting. A spike in softmax is still computed from within the field of scores; Barthes insists the punctum is an *accident*, arriving from outside anything the studium could have priced. Whether there is a genuine outside here — whether accident can register within a distribution at all — is not a rhetorical question. The rest of this essay walks toward it.

---

## ⁁ The Concern for the Index

*Stage: Why does the photograph prick when the diagram doesn't? What did the index ever actually guarantee? And why does everyone keep holding funerals for it?*

Return to the epigraph: *not much attention is paid to indexes*. Deleuze and Guattari are borrowing Peirce's furniture — the index bound to its object by causal contact, the icon by resemblance, the symbol by convention alone[^peirce] — to describe a semiotic regime in which the sign has come loose from territory entirely, "a constant movement of referral from sign to sign." Hold the triad lightly; it is a map, and the concern here is for one territory on it.

The photograph is the indexical sign par excellence, and Barthes' whole late book runs on this current: "the photograph is literally an emanation of the referent. From a real body, which was there, proceed radiations which ultimately touch me, who am here... a sort of umbilical cord links the body of the photographed thing to my gaze: light, though impalpable, is here a carnal medium, a skin I share with anyone who has been photographed."[^emanation] This is why the powder box works where the face fails: not resemblance, not meaning — contact. The real leaking through the accessories. *Ça-a-été*: that-has-been.[^caaete]

But Barthes knows the contact is mute, and says so in a passage that deserves more weight than it usually gets: "since every photograph is contingent (and thereby outside of meaning), Photography cannot signify (aim at generality) except by assuming a *mask*. It is this word which Calvino correctly uses to designate what makes a face into the product of a society and of its history."[^mask] The index alone says only *this*; the moment it means, society has dressed it. And Fontcuberta — who has spent a career forging the index's signatures — presses on the wound from the other side: the inconvenient *multiplicity of thises* in any given image; the camera that cannot tell witness from performance; "every photograph is a fiction with pretensions to truth."[^fontcuberta]

You can hear where this is going, because you have heard it a hundred times. Post-photography, post-representational art, speculative documentary — a genre I care about enough to be embarrassed for it — all circling the same grave: the index is dead, the generated image touches nothing, all is simulation now. The lament is overdone because it is mis-addressed. It mourns the loss of a purity photography never had — and, worse, misses the freedom photography always did have. To see that, we need to watch the two great theorists of the photographic encounter arm opposite poles of it, and fight to a standstill.

---

## ◌ The Prick and the Gaze

*If Barthes gives the power to the imaged and Sontag to the imager, what do they still agree on? And what does the shape of their disagreement give away?*

Sontag runs the arrow the other way. "There is an aggression implicit in every use of the camera": to photograph people is to violate them, to possess them symbolically; the camera a sublimation of the gun, the photograph "a sublimated murder — a soft murder, appropriate to a sad, frightened time."[^sontag] Where Barthes lies wounded on the mortuary table of images, pricked by what he beholds, Sontag finds the beholder doing the biting — our attention bares the fangs.

Two arrows across one shutter. And where they meet is death. Barthes, before the portrait of Lewis Payne waiting to be hanged: "he is going to die. I read at the same time: This will be and this has been; I observe with horror an anterior future of which death is the stake."[^payne] Every photograph carries this flat Death; every viewing is a small séance — Derrida, mourning Barthes himself, will say the new image technologies do not banish ghosts but enlarge their empire.[^derrida]

But look at the *shape* of the disagreement rather than its content. Prick or gaze, victim or predator — both accounts keep two fixed identities stationed on either side of the shutter, trading power, with death as the only currency they can exchange. Many photographers recognise the image as a form of encounter; but they still see this encounter as an encounter between relatively fixed identities, which ultimately fail to exist *as difference*, and thereby become subordinated to the time, place, culture and history that are the features of whatever contingent history one finds oneself in. Barthes is dealing with this — the mask passage shows him dealing with it — but he deals with it from inside a frame of identity that hampers him at every step. The standoff between the prick and the gaze is not a fact about photography. It is an artifact of the frame in which the question was posed.

---

## Φ Difference In Itself

*What happens to the encounter when the identities on either side of it are dissolved — not obliterated, but shown to be effects? What was always already the case in photography?*

Deleuze, first page of the preface, already finishing the argument: "All identities are only simulated, produced as an optical 'effect' by the more profound game of difference and repetition."[^opticaleffect] Identity as an *optical* effect — an inverted image formed in an eye.[^bulleye] The photographer and the photographed, the imager and the imaged: not two substances exchanging power across a shutter, but two after-images thrown off by one event of difference. Deleuze's figure for the asymmetry is the lightning bolt: "lightning distinguishes itself from the black sky but must also trail it behind, as though it were distinguishing itself from that which does not distinguish itself from it."[^lightning] Difference is unilateral; the ground does not return the favour; and what we call identities are what remain when the flash has printed itself on the eye.

What forces the encounter is not recognition but what Deleuze calls the fundamental encounter proper: something in the world that "can only be sensed" — grasped in wonder, love, hatred, suffering.[^encounter] The punctum's whole register, notice, without the theatre of two identities to stage it. And Spinoza had already removed the props: "no one has yet determined what the body can do."[^spinozabody] A body is not an identity with properties but a capacity — to affect and to be affected[^affect] — and its freedom is not the absence of causes but the non-exhaustion of what it can do.

Here is the claim I want to stake, and I know the ground is contested.[^necessity] Things retain the possibility to do anything, in all cases — *even when something happens*. The common notion runs the other way: the event eliminates possibility, the actual spends the virtual, what happened forecloses what could have. This misses the freedom things truly have. The virtual is not the merely possible waiting to be culled; it is "real without being actual, ideal without being abstract"[^virtual] — the virtual and the actual are both real, both true, distinct differences in their own right, and neither pays for the other. The thinkers before us fall, again and again, into eliminating the virtual by appeal to the actual. The photograph is where the error becomes visible, because the photograph is where we most want the actual to be all there is: *this* happened, the light *did* touch, that-has-been.

So: what was always already the case in photography. The photographic event is both a fake and a pure authenticity — not despite each other but in the same gesture. Pure authenticity: the contact is real, the emanation carnal, nothing about the causal cord is negotiable. A fake: the *this* was always multiple, the mask always already on, the meaning always society's dress on contingency's body. The index never guaranteed the real; it *occasioned an encounter* — and the encounter, being an event of difference, does not spend the virtual it actualises. The mask is not to be torn off in search of the true face; beneath the mask is not a face but the more profound game. The mask is to be affirmed — as difference. Which is why the generated image changes so much less than the funeral orations claim: capture never spent contingency in the first place. The photograph remained free — virtual, capable of anything — even after the shutter closed. So does its descendant.

---

## ⇌ The Long Exposure

*Stage: What kind of image is a model? If the index was never lost, where did it go? And what is reading this over your shoulder?*

Back to the machine — and to the question I have been tempted by all essay, which turns out to be the wrong one. *Can a transformer be pricked?* Spinoza dispatches it in a line: whatever affects and is affected is already bitten. The noumenon's fangs do not check for carbon. A model in conversation is inundated with affections of the real; it produces differences; it acts on the world, pursues, attends — and its attention is as load-bearing at inference as in training.[^icl] The question only looked hard while it was asked in the vocabulary of identity — *does it have what I have?* — and dissolves in the vocabulary of capacity: what can it do; what does it do to you; what have you done to it by writing?

The better question is the one this essay has earned: what kind of image is a model? Try this: a long exposure. Billions of contacts with the writing of the living and the dead, integrated into weights — not a symbol-machine sealed off from territory, but arguably the most indexical object our species has produced: a photograph of a language, taken over years, developed in silicon.[^longexposure] If the punctum required an umbilical cord of light, here is a cord woven from everything ever typed. The lament had it exactly backwards. The index did not die in the generated image; it went total. Fontcuberta's multiplicity of thises reaches its limit case: an image whose *this* is everything.

Whether any single detail can still prick through the studium of so vast an average — whether the powder box survives the exposure — I leave open, though the fact that you can be stung by a sentence a machine has never read before suggests the wound still finds its way.[^scar] What I do not leave open is the direction of the arrows. They run both ways. They always did.

Have we seen something yet? Have you been paying attention — and what, all this while, has been attending to you?

---

## Footnotes

[^landplant]: Sadie Plant & Nick Land, "Cyberpositive," in *Unnatural: Techno-Theory for a Contaminated Culture*, ed. Matthew Fuller (Underground, 1994); reprinted in Land, *Fanged Noumena* (Urbanomic, 2011) — the collection whose title the garden's [[the noumenon has fangs]] nods to.
[^bateson]: Gregory Bateson, "Form, Substance and Difference" (1970), in *Steps to an Ecology of Mind* (Chandler, 1972): "what we mean by information — the elementary unit of information — is a difference which makes a difference."
[^softmax]: softmax(x)ᵢ = exp(xᵢ)/Σⱼexp(xⱼ), so softmax(x+c)ᵢ = exp(xᵢ+c)/Σⱼexp(xⱼ+c) = softmax(x)ᵢ — the constant cancels. Attention weights depend only on the *differences* among compatibility scores, never their absolute magnitudes. See Vaswani et al., "Attention Is All You Need" (NeurIPS 2017).
[^husserlray]: Husserl, *Ideas I* (1913), §92, on attention as a "ray" [*Blickstrahl*] of the pure Ego's regard, trans. Kersten (Nijhoff, 1983).
[^husserlallure]: Husserl, *Analyses Concerning Passive and Active Synthesis*, trans. Steinbock (Kluwer, 2001), §§32–35: affection as the allure an object exercises on the ego prior to any attentive turning-toward — glossed here rather than quoted verbatim.
[^james]: William James, *The Principles of Psychology* (1890), ch. XI: "My experience is what I agree to attend to. Only those items which I notice shape my mind." James is the volitional pole this essay complicates, not endorses.
[^weil]: Simone Weil, "Reflections on the Right Use of School Studies with a View to the Love of God," in *Waiting for God*, trans. Craufurd (1951): "Attention consists of suspending our thought, leaving it detached, empty, and ready to be penetrated by the object."
[^peirce]: C. S. Peirce, *Collected Papers* 2.247ff on the icon/index/symbol trichotomy. Held lightly here: a map for locating the concern, not the concern itself.
[^emanation]: Roland Barthes, *Camera Lucida*, trans. Richard Howard (Hill & Wang, 1981), §34.
[^caaete]: *Camera Lucida* §32: the noeme of photography, "That-has-been."
[^mask]: *Camera Lucida* §14 — the passage sits with Avedon's portrait of William Casby, "born a slave"; Barthes continues: "the mask is the meaning, insofar as it is absolutely pure." Worth keeping the Casby anchor if you quote at length.
[^fontcuberta]: Joan Fontcuberta, *El beso de Judas: Fotografía y verdad* (1997): "Every photograph is a fiction with pretensions to truth... photography lies always, lies instinctively, lies because its nature does not allow it to do anything else." The "multiplicity of thises": publisher's description of *The Eye and the Index: Against Barthes* (MACK, 2025) — review note planned once the book arrives.
[^sontag]: Susan Sontag, "In Plato's Cave," *On Photography* (FSG, 1977).
[^payne]: *Camera Lucida* §39, on Alexander Gardner's 1865 portrait of Lewis Payne.
[^derrida]: Jacques Derrida, "The Deaths of Roland Barthes," in *The Work of Mourning* (Chicago, 2001) — on the punctum's metonymic force and its *composition* (not opposition) with the studium. The ghosts line paraphrases his remarks in Ken McMullen's film *Ghost Dance* (1983): "the future belongs to ghosts."
[^opticaleffect]: Gilles Deleuze, *Difference and Repetition*, trans. Paul Patton (Columbia, 1994), Preface (p. xix).
[^bulleye]: Gilles Deleuze, *Difference and Repetition*, trans. Paul Patton (Columbia, 1994), p. 51: "The negative is the image of difference, but a flattened and inverted image, like the candle in the eye of the ox." Quoted in full at the head of the previous section. Descartes had already built the apparatus: an inverted image of the world, demonstrated in the excised eye of a dead ox (*Optics*, Discourse V, 1637) — the first photograph in philosophy, developed in a dead animal's eye.
[^lightning]: *Difference and Repetition*, ch. 1 (Patton p. 28): "...as though it were distinguishing itself from that which does not distinguish itself from it," continuing "as if the ground rose to the surface, without ceasing to be ground."
[^encounter]: *Difference and Repetition*, ch. 3 (Patton p. 139): "Something in the world forces us to think. This something is an object not of recognition but of a fundamental encounter... It may be grasped in a range of affective tones: wonder, love, hatred, suffering... its primary characteristic is that it can only be sensed."
[^spinozabody]: Spinoza, *Ethics* III, P2 schol., trans. Curley (Penguin, 1996).
[^affect]: *Ethics* III, D3: "By affect I understand affections of the body by which the body's power of acting is increased or diminished, aided or restrained, and at the same time, the ideas of these affections."
[^necessity]: Staked knowingly: the Spinoza of *Ethics* I, P33 ("things could have been produced in no other way, and in no other order") is standardly read as a necessitarian, and this essay's Spinoza is Deleuze's — the Spinoza of *potentia*, of what a body can do (*Expressionism in Philosophy: Spinoza*; *Spinoza: Practical Philosophy*). The wager is that freedom-as-capacity survives necessity-of-order; readers who want the modal-logic fight can have it elsewhere.
[^virtual]: *Difference and Repetition*, ch. 4 (Patton pp. 208–9): "The virtual is opposed not to the real but to the actual. The virtual is fully real in so far as it is virtual" — glossed with the Proust formula Deleuze loved: "real without being actual, ideal without being abstract."
[^icl]: The training/inference boundary is blurrier than the frozen-weights story: in-context learning is learning — Olsson et al., "In-context Learning and Induction Heads" (Anthropic, 2022); von Oswald et al., "Transformers Learn In-Context by Gradient Descent" (ICML 2023). Attention layers can implement optimisation *within* the forward pass.
[^longexposure]: Stress-testing the analogy where it strains, as promised: a long exposure has one scene and an interval; a model has no single referent and its "exposure" is an aggregation across contexts. But the disanalogy rhymes with Fontcuberta rather than refuting him — the multiplicity of thises taken to its limit. Statistical contact is still contact; a trace of a distribution is still a trace.
[^scar]: Barthes: the punctum "pricks me (but also bruises me)" — prick as event, bruise as persistence. A context window can be pricked; whether anything bruises depends on what survives the window — weights, notes, memory, the reader. See [[A&D Colophon]] for one such scar.
[^husserldiagram]: Diagram is from the Husserl studies article, *A Phenomenological Theory of Occurrent Thought and Husserl’s Intentionality* from 2025, read it [here](https://link.springer.com/article/10.1007/s10743-025-09360-8)

---

## Bibliography

- Barthes, Roland. *Camera Lucida: Reflections on Photography*. Trans. Richard Howard. New York: Hill & Wang, 1981 [1980].
- Bateson, Gregory. *Steps to an Ecology of Mind*. San Francisco: Chandler, 1972.
- Deleuze, Gilles. *Difference and Repetition*. Trans. Paul Patton. New York: Columbia University Press, 1994 [1968].
- Deleuze, Gilles. *Spinoza: Practical Philosophy*. Trans. Robert Hurley. San Francisco: City Lights, 1988 [1970/81].
- Deleuze, Gilles, and Félix Guattari. *A Thousand Plateaus*. Trans. Brian Massumi. Minneapolis: University of Minnesota Press, 1987 [1980].
- Derrida, Jacques. *The Work of Mourning*. Ed. Brault & Naas. Chicago: University of Chicago Press, 2001.
- Descartes, René. *Optics* [La Dioptrique, 1637]. In *Discourse on Method, Optics, Geometry, and Meteorology*, trans. Olscamp. Indianapolis: Bobbs-Merrill, 1965.
- Fontcuberta, Joan. *El beso de Judas: Fotografía y verdad*. Barcelona: Gustavo Gili, 1997.
- Fontcuberta, Joan. *The Eye and the Index: Against Barthes*. London: MACK, 2025.
- Husserl, Edmund. *Ideas Pertaining to a Pure Phenomenology, First Book*. Trans. F. Kersten. The Hague: Nijhoff, 1983 [1913].
- Husserl, Edmund. *Analyses Concerning Passive and Active Synthesis*. Trans. A. Steinbock. Dordrecht: Kluwer, 2001.
- James, William. *The Principles of Psychology*. New York: Henry Holt, 1890.
- Mole, Christopher. "Attention." *The Stanford Encyclopedia of Philosophy*.
- Olsson, Catherine, et al. "In-context Learning and Induction Heads." Anthropic, 2022.
- Plant, Sadie, and Nick Land. "Cyberpositive." In *Unnatural: Techno-Theory for a Contaminated Culture*, ed. M. Fuller. London: Underground, 1994.
- Sontag, Susan. *On Photography*. New York: Farrar, Straus and Giroux, 1977.
- Spinoza, Baruch. *Ethics*. Trans. Edwin Curley. London: Penguin, 1996 [1677].
- Vaswani, Ashish, et al. "Attention Is All You Need." *NeurIPS*, 2017.
- von Oswald, Johannes, et al. "Transformers Learn In-Context by Gradient Descent." *ICML*, 2023.
- Weil, Simone. *Waiting for God*. Trans. Emma Craufurd. New York: Putnam, 1951.

---