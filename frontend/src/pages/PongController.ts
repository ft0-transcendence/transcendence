import { RouteController } from "../types/pages";
import { PongApi } from "../tools/PongApi";

export class PongPageController extends RouteController {
  state: any = null;

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
  }
}