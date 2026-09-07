# Rules Core 1: supported boundary

This layer implements turn navigation, basic timing, LIFO stack ordering,
selected state-based actions, loss states, and the Commander-zone decisions
needed by the local tabletop model.

Explicitly outside this core are combat and damage, summoning sickness,
multi-player/APNAP priority, universal layer ordering, uncommon mana symbols
and costs, maximum hand size, and Commander deck validation. Known-object
targeting centralizes zone/type/color/controller restrictions plus hexproof,
shroud and protection. Direct top-level targets of spells and activated
abilities are chosen during declaration, before costs are paid, stored on the
stack object, and rechecked at resolution. Kopala-style additional targeting
costs are included in the declaration cost and Ward creates a real triggered
ability above the declared spell/ability. Targets whose clause depends on an
earlier mode/conditional choice, plus triggered-ability targets, remain
resolution-time assisted until those declaration choices are moved earlier too.

`COMBAT_NOT_IMPLEMENTED` is returned for combat declarations. The data model
reserves commander damage by source, but Combat Core is responsible for
recording and enforcing it. Physical-table corrections continue to bypass
declared-action legality, then pass through objective state-based checks.
