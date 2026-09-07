# Combat Core 2: supported boundary

Combat Core 2 supports known creatures, one local player plus a lightweight
opponent reference, attack/block declarations, the listed combat keywords,
marked damage and the associated state-based actions.

An opponent permanent that is not digitally known is represented only as a
temporary assisted combat participant explicitly declared by the player. It
does not create a card definition or a permanent opponent board.

Still outside this core: full multiplayer/APNAP, attack taxes and restrictions,
goad, defender, planeswalker/battle combat, prevention/replacement effects,
protection/ward, regenerate, infect/poison, control-change, and full layers.
When an unrepresented interaction changes a damage assignment, MagicJarvis
asks for a decision or leaves the physical result assisted rather than guessing.
