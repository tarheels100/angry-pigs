# Developer Notes

Todo list and other notes to map out work still needed to be done.  

> [!IMPORTANT]
> Edited and owned by the developer, but agent is allowed to check "Agent" boxes when they believe the line has been implemented or resolved.  If a line is thought to be resolved, the agent should check the associated box and add a footnote reference to the checkbox (e.g., `☑[^1]`) and a footnote text below in the containing subsection to note which commit the change was added in and where the change is implemented and/or documented (e.g., referencing a specific milestone and the file it's in or referencing line(s) of code in a specific file where change is implemented).  Agent edits other than those specifically stated as allowed in this document are prohibited.

<!-- Template:
| Developer | Agent | Description |
| :---: | :---: | --- |
| ☐ | ☐ |  |
-->

☐ open  ☑ closed

## Audio

| Developer | Agent | Description |
| :---: | :---: | --- |
| ☐ | ☑[^audio-1] | Current **music systems** looks to use only vanilla Web Audio without any helper library.  The result is very poor music composition.  The agent should try using Tone.js + Tonal libraries together to form a more competent music system. |

[^audio-1]: Implemented in commit `426190b` (milestone M22, docs/adr.md D40). Pitch grammar is
    `src/audio/composition.ts` (Tonal: scale, four-chord progression, chord-tone melody, seeded
    from the stage name); playback is `src/audio/playback.ts` (Tone.js synths on Tone's
    transport, lead + bass + hat, loop length from the composition). Wired in `src/main.ts`
    (`announceTrack` on stage load/restart, HUD track label). Tests: `tests/audio.test.ts`
    (deterministic composition, six distinct tracks, real pitches, silence before unlock) and
    `tests/browser/game.browser.mjs` (track named in HUD, track changes per stage, music off
    stops the transport). Music still defaults to off (docs/adr.md D32).

## Visuals

| Developer | Agent | Description |
| :---: | :---: | --- |
| ☐ | ☐ | **Object destruction animation.**  When an physical object in the level is destroyed (birds/pigs are exempted), it should appear to crumble/shatter into many tiny pieces that initially collectively retain the shape of the object before destruction.  The pieces should then fall/move under the force of gravity and should respond physically to impacts with the pig and level floor (other level objects should probably be excluded from physics interactions since this will greatly complicate the simulation and would cause issues once the pieces fade out (object laying on pieces would shift/fall, etc).  For example, if a pig impacts a piece of glass such that it breaks/gets destroyed, the glass should crack into about a dozen pieces (collectively forming the pre-destruction shape of the glass object) and then fall due to gravity and get pushed/sprayed outward due to the continued motion of the pig through the crushed glass particles.  After things settle, the particles can fade out to prevent build up of too many physics objects. |
