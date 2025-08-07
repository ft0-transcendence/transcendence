import { RouteController } from "../types/pages";
import { PongApi } from "../tools/PongApi";
import { PongResponse } from "../types/pongResponse";
import { GameStatus } from "../types/pongTypes";

export class PongController extends RouteController {
  state: GameStatus | null = null;
  pollingInterval: any = null;

  async preRender() {
    this.state = await PongApi.getState();
  }

  async render() {
    return /*html*/`
      <div>
        <h1>Pong</h1>
        <pre>${JSON.stringify(this.state, null, 2)}</pre>
        <button id="pong-start">Start</button>
      </div>
    `;
  }

  async postRender() {
    document.getElementById("pong-start")?.addEventListener("click", async () => {
      await PongApi.start();
      this.state = await PongApi.getState();
      await this.renderView();
    });

    if (!this.pollingInterval) {
      this.pollingInterval = setInterval(async () => {
        try {
          this.state = await PongApi.getState();
          await this.renderView();
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 500); // 500ms
    }
  }

  async destroy() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}