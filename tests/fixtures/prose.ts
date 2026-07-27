/**
 * Prose fixtures for the segmentation harness (#24).
 *
 * Written for this repository rather than taken from a real book: the sandbox
 * cannot download from Project Gutenberg, and committing copyrighted text would
 * be worse. It is shaped to exercise the cases the scoring rules exist for —
 * dialogue exchanges, scene breaks, cliffhanger beats, an over-long paragraph,
 * verse, and non-fiction with a table.
 *
 * **These are not a substitute for real books.** Real prose has rhythms no
 * hand-written fixture reproduces, and the weights in `segment.ts` should be
 * re-tuned against actual public-domain EPUBs before anyone trusts the numbers.
 * Genre baselines are kept separate here for exactly that reason.
 */

/** Novel prose: narration, an exchange of dialogue, a scene break. */
export const NOVEL_CHAPTER = `<h1>An Arrival</h1>
<p>The house had been empty for eleven years, and it had the particular smell of a place that has been closed rather than abandoned — dust that had settled slowly, without wind to move it, in rooms where the shutters had been drawn by someone who intended to come back.</p>
<p>Ilse set her case down in the hall and did not take off her coat. The cold in the house was not the cold of the street; it had a still, patient quality, as though it had been waiting rather than merely accumulating. Somewhere above her, quite distinctly, a door moved on its hinges.</p>
<p>"Hello?" she called.</p>
<p>Nothing answered.</p>
<p>"I'm from the estate agent," she added, which was not true, and which she regretted immediately, because a lie told to an empty house is a lie told to yourself.</p>
<p>She climbed the stairs. The seventh tread gave under her weight with a sound like a held breath released, and she stopped, one hand on the banister, and listened for a long moment to a silence that had changed shape.</p>
<hr/>
<p>By the time she reached the landing the light had gone from grey to the particular blue that means the day has ended without anyone announcing it. Three doors stood closed. The fourth, at the end, stood open on darkness.</p>
<p>She had told herself on the train that she would be methodical: every room, every cupboard, the attic if there was one, and then out before dark with the inventory done. It had seemed reasonable in a lit carriage among strangers.</p>
<p>What was the point, she thought, of coming all this way to stand on a landing?</p>
<p>She went in.</p>`;

/** Dialogue-dominant: the case the anti-splitting rule exists for. */
export const DIALOGUE_CHAPTER = `<h1>What the Neighbour Said</h1>
<p>The neighbour was watering a window box that did not need watering.</p>
<p>"You'll be the niece," she said.</p>
<p>"I'm the executor."</p>
<p>"Same thing, in the end." She moved the watering can to her other hand. "You've been inside, then."</p>
<p>"This morning."</p>
<p>"And?"</p>
<p>"And it's a house," Ilse said. "It needs a roof and it needs airing and somebody should have been in it years ago."</p>
<p>"Somebody was." The neighbour said this without emphasis, the way people deliver the sentence they have been waiting weeks to say. "Most nights, for a while. You'd see the light go on in the back bedroom about nine and off again about eleven, regular as anything, for a whole winter."</p>
<p>Ilse said nothing.</p>
<p>"The house has been empty eleven years," the neighbour said. "I'm only telling you what the window did."</p>`;

/** Non-fiction: a long paragraph, a table, a list, a blockquote. */
export const NONFICTION_CHAPTER = `<h1>The Cost of Closing a House</h1>
<p>Between 1908 and 1935 the practice of closing a house rather than selling it was common enough among a certain class of owner that the trade developed its own vocabulary for it, and the distinction mattered a great deal to the people who did the work: a closed house was one that had been prepared for a return, whereas an abandoned house was one that had not, and the difference showed itself in a hundred small decisions about shutters, water, chimneys and furniture that a surveyor arriving decades later could still read as clearly as handwriting, which is why the inventories of the period are so unexpectedly useful to historians of domestic life, and why the surviving records of the firms who performed the work — most of which were small, local and family-held — have become a minor but genuine source for the social history of the interwar period in a way that their compilers, who were interested chiefly in being paid, would have found very surprising indeed.</p>
<p>Three costs recurred:</p>
<ul><li>Draining and refilling the system, annually.</li><li>Sweeping chimneys that carried no smoke.</li><li>A caretaker's retainer, usually quarterly.</li></ul>
<table><thead><tr><th>Year</th><th>Houses closed</th><th>Median duration</th></tr></thead><tbody><tr><td>1908</td><td>41</td><td>3 years</td></tr><tr><td>1919</td><td>112</td><td>7 years</td></tr><tr><td>1935</td><td>28</td><td>2 years</td></tr></tbody></table>
<p>One caretaker's account book records the reasoning plainly:</p>
<blockquote><p>A house that is closed is a house that is expected. A house that is expected must be warm enough that the expectation is not a lie.</p></blockquote>
<p>The firm that employed him closed in 1938.</p>`;

/** Verse: short lines, no sentence-ending punctuation to lean on. */
export const POETRY_CHAPTER = `<h1>Three Poems for an Empty House</h1>
<p class="verse">The shutters were drawn by a careful hand<br/>and the water was let from the pipes<br/>and the ash was taken out of the grate<br/>and the door was locked twice</p>
<p class="verse">Nobody said for how long<br/>Nobody ever says for how long</p>
<p class="verse">Eleven winters of nobody<br/>and the seventh stair still knows<br/>the weight of a particular foot<br/>and gives, and gives, and gives</p>`;

/** One paragraph past the hard budget, to exercise sentence splitting (#22). */
export const LONG_PARAGRAPH_CHAPTER = `<h1>The Inventory</h1>
<p>${Array.from(
  { length: 14 },
  (_, index) =>
    `In the ${ordinal(index + 1)} room she found what the inventory had promised and rather more besides, which is the way of inventories written by people who are being paid by the room rather than by the object. There was furniture under sheets, and the sheets themselves had become part of the furniture. She wrote down what she saw.`,
).join(' ')}</p>`;

function ordinal(value: number): string {
  const words = [
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
    'thirteenth',
    'fourteenth',
  ];
  return words[value - 1] ?? `${value}th`;
}
