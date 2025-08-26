import { RouteController } from "../types/pages";
import { PongApi } from "../tools/PongApi";
import { GameState, GameStatus } from "../types/pongTypes";

export class PongController extends RouteController {
  state: GameStatus | null = null;
  pollId: any = null;
  rafId: number | null = null;
  inputId: any = null;
  keyDown: Record<string, boolean> = {};

  async preRender() {
    this.state = await PongApi.getState();
  }

  async render() {
    return /*html*/`
      <div class="flex flex-col gap-3">
        <div class="flex gap-2">
          <button id="pong-start" class="btn">Start</button>
          <button id="pong-pause" class="btn">Pause</button>
          <button id="pong-resume" class="btn">Resume</button>
        </div>
        <canvas id="pong-canvas" width="640" height="400" class="border rounded bg-black"></canvas>
        <div class="text-sm opacity-70">
          <span>State: ${this.state?.state}</span>
          <span class="ml-4">Score L:${this.state?.scores.left} - R:${this.state?.scores.right}</span>
        </div>
      </div>
    `;
  }

  async postRender() {
    const refresh = async () => { this.state = await PongApi.getState(); };

    document.getElementById("pong-start")?.addEventListener("click", async () => { await PongApi.start(); await refresh(); });
    document.getElementById("pong-pause")?.addEventListener("click", async () => { await PongApi.pause(); await refresh(); });
    document.getElementById("pong-resume")?.addEventListener("click", async () => { await PongApi.resume(); await refresh(); });

    if (!this.pollId) {
      this.pollId = setInterval(async () => {
        try { await refresh(); } catch (e) { console.error("Polling error:", e); }
      }, 150); // ~6-7 FPS network to reduce traffic
    }

    if (!this.rafId) {
      const loop = () => { this.draw(); this.rafId = requestAnimationFrame(loop); };
      this.rafId = requestAnimationFrame(loop);
    }

    const onKeyDown = (e: KeyboardEvent) => { this.keyDown[e.key] = true; };
    const onKeyUp = (e: KeyboardEvent) => { this.keyDown[e.key] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    if (!this.inputId) {
      this.inputId = setInterval(async () => {
        try {
          const moves: Array<Promise<any>> = [];
          if (this.keyDown["w"]) moves.push(PongApi.move("left", "up"));
          else if (this.keyDown["s"]) moves.push(PongApi.move("left", "down"));
          if (this.keyDown["ArrowUp"]) moves.push(PongApi.move("right", "up"));
          else if (this.keyDown["ArrowDown"]) moves.push(PongApi.move("right", "down"));
          if (moves.length) await Promise.all(moves);
        } catch (e) { /* ignore bursts */ }
      }, 80); // fewer network calls
    }

    // Store removers on instance for destroy
    (this as any)._onKeyDown = onKeyDown;
    (this as any)._onKeyUp = onKeyUp;
  }

  private draw() {
    const canvas = document.getElementById("pong-canvas") as HTMLCanvasElement | null;
    if (!canvas || !this.state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { ball, paddles, scores, state } = this.state;
    const sx = (v: number) => (v / 100) * canvas.width;
    const sy = (v: number) => (v / 100) * canvas.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#333";
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    const paddleH = sy(20);
    const paddleW = 10;
    ctx.fillStyle = "#fff";
    ctx.fillRect(sx(2), sy(paddles.left) - paddleH / 2, paddleW, paddleH);
    ctx.fillRect(canvas.width - paddleW - sx(2), sy(paddles.right) - paddleH / 2, paddleW, paddleH);

    const r = Math.max(2, Math.floor(Math.min(canvas.width, canvas.height) * 0.015));
    ctx.beginPath();
    ctx.arc(sx(ball.x), sy(ball.y), r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "20px monospace";
    ctx.fillText(String(scores.left), canvas.width * 0.25, 30);
    ctx.fillText(String(scores.right), canvas.width * 0.75, 30);

    if (state === GameState.PAUSE) this.overlay(ctx, "PAUSE");
    if (state === GameState.TOSTART) this.overlay(ctx, "PRESS START");
    if (state === GameState.FINISH) this.overlay(ctx, "GAME OVER");
  }

  private overlay(ctx: CanvasRenderingContext2D, text: string) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, ctx.canvas.width / 2, ctx.canvas.height / 2);
    ctx.restore();
  }

  async destroy() {
    if (this.pollId) { clearInterval(this.pollId); this.pollId = null; }
    if (this.inputId) { clearInterval(this.inputId); this.inputId = null; }
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if ((this as any)._onKeyDown) window.removeEventListener("keydown", (this as any)._onKeyDown);
    if ((this as any)._onKeyUp) window.removeEventListener("keyup", (this as any)._onKeyUp);
  }
}