# Post-M13 notes and suggestions

## Increase detail
- Draw out an actual cannon/launcher that responds to dragging inputs and animates the launch.  Suggestions: spiral spring in an cannon-like barrel that tilts and compresses the spring in response to player dragging/aiming.
- More detailed/varied backgrounds and scenery features.
- Pigs and birds should be drawn as such rather than using plain circles.  Stylized representation is fine.  Keep them on theme.
- Motion trail behind moving pigs.
- Title screen
- Options screen (optional; only needed if we have actual user-selectable options)
- Audio soundtrack
	- Tron-inspired
	- Procedurally generated so we don't hear it constantly loop.
	- Multiple tracks so that each level can sound different.
	- Library options to consider (not locked, just suggestions to look at):
		- Tone.js + Tonal
		- Strudel
			
## Materials and physics
- Are there multiple material types, like glass, wood, and stone?
- Whatever the primary material in the levels is now (glass?), it breaks a bit too easily.
- Make materials visually distinct.
- Use stronger materials for some structures.  Knocking down towers and watching them fall down into heaps of objects is fun and visually appealing.  Currently, everything gets destroyed on almost any impact.
- Add more visual appeal to destroyed objects.  Like they could crumble into a bunch of physically modeled particles that fall into a heap and then fade away.  These could be rendered on a background layer so they don't interact with other physics objects.
	
## Level design and gameplay
- Some objects fall slightly when the level is first drawn, causing them to start already partly damaged.  Make sure elements start already settled and/or pause damage when generating/loading the level objects and resume once the player is given control.
- Levels should have much more structure within them.  We want the fun of knocking down large precarious structures and having to blast through to get to the birds.
- Lean into the pigs vs birds theme.  Maybe some levels have static platforms up in trees (background layer) with object structures protecting birds.
- The game should support different pig types.  Examples: bomb pig that explodes on impact, heavy pig that can more easily break through and topple large/heavy structures, cluster of smaller pigs launched together that spread out like a shotgun blast.