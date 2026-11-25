/**
 * Entry point. M1 acceptance requires only a blank canvas served over http;
 * wiring (physics, loop, renderer, input) is added by M4-M7.
 */

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;

if (canvas) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

console.log('angry-pigs: scaffold loaded (M1)');
