import { Game, GameUserInfo, GameStatus, MovePaddleAction, GameState, GameConfig } from "./game";
import { Game as PrismaGame } from "@prisma/client";
import { TypedSocket, TypedSocketNamespace } from "../src/socket-io";
import { app } from "../main";
import { STANDARD_GAME_CONFIG } from "../constants";

type FinishCallback = (state: GameStatus) => Promise<void> | void;

export class OnlineGame extends Game {
	protected gameDto: PrismaGame | null = null;
	protected gameId: string;

	get currentGameId() { return this.gameId; }

	protected socketNamespace: TypedSocketNamespace | null;

	protected updateGameActivity?: (gameInstance?: OnlineGame) => Promise<void>;

	protected unsubscribeTick: (() => void) | null = null;
	protected unsubscribeScore: (() => void) | null = null;
	protected finished = false;
	protected onFinish?: FinishCallback;
	public wasForfeited = false;

	private readonly GRACE_MS = 15000; // 15s
	private readonly ABORT_WARNING_AT_MS = 5000; // Warning quando rimangono 5s
	private disconnectedUntil: Map<string, number> = new Map();
	private abortWarningsSent: Set<string> = new Set();
	protected warningIntervals: Map<string, NodeJS.Timeout> = new Map();

	private _playerLeft: GameUserInfo | null = null;
	private _playerRight: GameUserInfo | null = null;
	private connectedUsers: GameUserInfo[] = [];

	// userId -> GameUserInfo
	#connectedUsersMap: Map<string, GameUserInfo> = new Map();
	// socketId -> count of user sockets connected to this game
	#connectedUserSockets: Map<string, number> = new Map();

	constructor(
		gameId: string,
		socketNamespace: TypedSocketNamespace | null,
		config?: Partial<GameConfig>,
		onFinish?: FinishCallback,
		updateGameActivity?: (gameInstance?: OnlineGame) => Promise<void>,
		gameDto?: PrismaGame
	) {
		super(config);
		this.gameId = gameId;
		this.socketNamespace = socketNamespace;
		this.onFinish = onFinish;
		this.updateGameActivity = updateGameActivity;
		this.unsubscribeTick = this.onTick((state, now) => {
			if (this.disconnectedUntil.size > 0) {
				this.checkGraceAndForfeit(now);
			} else if (this.socketNamespace) {
				this.socketNamespace.to(this.gameId).emit("game-state", state);
			}
			if (this.state === GameState.FINISH && !this.finished) {
				app.log.debug(`Game ${this.gameId} ended naturally with score ${this.scores.left}-${this.scores.right}`);
				this.finish();
			}
		});

		this.unsubscribeScore = this.onScore(async (scores) => {
			if (this.updateGameActivity) {
				await this.updateGameActivity(this);
			}
		});
		this.gameDto = gameDto ?? null;
	}

	public onPlayerJoin(_player: GameUserInfo): void { }
	public onPlayerLeave(_playerId: GameUserInfo['id']): void { }
	public onStateRequested(): GameStatus { return this.getState(); }
	public onPlayerAction(playerId: GameUserInfo['id'], action: MovePaddleAction): void {
		this.movePlayerPaddle(playerId, action);
	}

	public setSocketNamespace(socketNamespace: TypedSocketNamespace): void {
		this.socketNamespace = socketNamespace;
	}

	public setPlayers(player1: GameUserInfo, player2: GameUserInfo) {
		this._playerLeft = player1;
		this._playerRight = player2;
	}

	public playerReady(player: GameUserInfo) {
		if (this.leftPlayer?.id === player.id || (this.leftPlayer?.isPlayer === false)) {
			this.leftPlayerReady = true;
		}
		if (this.rightPlayer?.id === player.id || (this.rightPlayer?.isPlayer === false)) {
			this.rightPlayerReady = true;
		}
		app.log.debug('Players ready: left[%s], right[%s]', this.leftPlayerReady, this.rightPlayerReady);
		if (this.leftPlayerReady && this.rightPlayerReady) {

			this.start();
			if (this.socketNamespace) {
				this.socketNamespace.to(this.gameId).emit("game-state", this.getState());
			}
		}
	}


	public isPlayerInGame(id: GameUserInfo['id']) {
		return id === this._playerLeft?.id || id === this._playerRight?.id;
	}

	public getPlayerConnectionCount(playerId: GameUserInfo['id']) {
		if (!playerId) return 0;
		return this.#connectedUserSockets.get(playerId) ?? 0;
	}

	public movePlayerPaddle(playerId: GameUserInfo['id'], direction: MovePaddleAction) {
		if (playerId === this._playerLeft?.id) {
			this.movePaddle("left", direction);
		} else if (playerId === this._playerRight?.id) {
			this.movePaddle("right", direction);
		}
		this.updateGameActivity?.(this);
	}

	public addConnectedUser(user: GameUserInfo): void {
		if (!user.id) return;
		if (!this.#connectedUserSockets.has(user.id)) {
			this.#connectedUserSockets.set(user.id, 0);
		}
		this.#connectedUserSockets.set(user.id, this.#connectedUserSockets.get(user.id)! + 1);

		this.#connectedUsersMap.set(user.id, user);
	}

	public removeConnectedUser(user: GameUserInfo): boolean {
		if (!user.id) return false;
		if (!this.#connectedUserSockets.has(user.id)) return false;

		const newSocketCount = this.#connectedUserSockets.get(user.id)! - 1;
		this.#connectedUserSockets.set(user.id, newSocketCount);

		if (newSocketCount <= 0) {
			this.#connectedUsersMap.delete(user.id);
			this.#connectedUserSockets.delete(user.id);
		}
		return true;
	}

	public getConnectedPlayers(): GameUserInfo[] {
		return [...this.#connectedUsersMap.values()];
	}

	public get leftPlayer(): GameUserInfo | null { return this._playerLeft; }
	public get rightPlayer(): GameUserInfo | null { return this._playerRight; }

	public markPlayerDisconnected(playerId: string) {
		const deadline = Date.now() + this.GRACE_MS;
		const hadNoDisconnections = this.disconnectedUntil.size === 0;
		this.disconnectedUntil.set(playerId, deadline);
		this.abortWarningsSent.delete(playerId); // Reset warning flag

		const playerName = this.getPlayerName(playerId);

		if (this.socketNamespace) {
			this.socketNamespace.to(this.gameId).emit("player-disconnected", {
				userId: playerId,
				playerName: playerName,
				expiresAt: deadline,
				gracePeriodMs: this.GRACE_MS,
				timeLeftMs: this.GRACE_MS,
			});
		}

		// warning periodici 1s
		const warningInterval = setInterval(() => {
			const timeLeft = deadline - Date.now();
			if (timeLeft <= 0 || !this.disconnectedUntil.has(playerId)) {
				clearInterval(warningInterval);
				this.warningIntervals.delete(playerId);
				return;
			}

			if (this.socketNamespace) {
				this.socketNamespace.to(this.gameId).emit("disconnection-timer-update", {
					userId: playerId,
					playerName: playerName,
					timeLeftMs: timeLeft,
					expiresAt: deadline,
				});
			}
		}, 1000);

		this.warningIntervals.set(playerId, warningInterval);

		if (hadNoDisconnections) {
			this.pause();
		}
	}

	public markPlayerReconnected(playerId: string) {
		if (!this.disconnectedUntil.has(playerId)) return;
		this.disconnectedUntil.delete(playerId);
		this.abortWarningsSent.delete(playerId);

		const interval = this.warningIntervals.get(playerId);
		if (interval) {
			clearInterval(interval);
			this.warningIntervals.delete(playerId);
		}

		const playerName = this.getPlayerName(playerId);
		if (this.socketNamespace) {
			this.socketNamespace.to(this.gameId).emit("player-reconnected", {
				userId: playerId,
				playerName: playerName,
			});
		}
		if (this.disconnectedUntil.size === 0 && this.state !== GameState.FINISH) {
			this.resume();
		}
	}

	private getOpponentPlayerId(playerId: string): string | null {
		const left = this.leftPlayer?.id;
		const right = this.rightPlayer?.id;
		if (left === playerId) return right ?? null;
		if (right === playerId) return left ?? null;
		return null;
	}

	private getPlayerName(playerId: string): string | null {
		if (this.leftPlayer?.id === playerId) return this.leftPlayer.username;
		if (this.rightPlayer?.id === playerId) return this.rightPlayer.username;
		return null;
	}


	private checkGraceAndForfeit(now: number) {
		if (!this.finished && this.disconnectedUntil.size > 0) {
			for (const [playerId, until] of this.disconnectedUntil.entries()) {
				const timeLeft = until - now;

				if (now >= until) {
					const opponentId = this.getOpponentPlayerId(playerId);
					const playerName = this.getPlayerName(playerId);
					const opponentName = this.getPlayerName(opponentId ?? '');

					// Assign forfeit scores (works even if opponentId is null for AI players)
					const FORFEIT_WIN = (this.config.maxScore ?? STANDARD_GAME_CONFIG.maxScore)!;
					const FORFEIT_LOSS = 0;
					if (this.leftPlayer && this.rightPlayer) {
						// The disconnected player loses, opponent wins
						if (playerId === this.leftPlayer.id) {
							this.scores.left = FORFEIT_LOSS;
							this.scores.right = FORFEIT_WIN;
						} else if (playerId === this.rightPlayer.id) {
							this.scores.left = FORFEIT_WIN;
							this.scores.right = FORFEIT_LOSS;
						}
					}
					this.wasForfeited = true;

					this.disconnectedUntil.delete(playerId);
					this.abortWarningsSent.delete(playerId);
					this.state = GameState.FINISH;

					if (this.socketNamespace) {
						this.socketNamespace.to(this.gameId).emit("game-aborted", {
							reason: "player-disconnection-timeout",
							disconnectedPlayerId: playerId,
							disconnectedPlayerName: playerName,
							winnerName: opponentName,
							message: `Il gioco è terminato perché ${playerName} non si è riconnesso in tempo`
						});
						this.socketNamespace.to(this.gameId).emit("game-state", this.getState());
					}
					this.finish();
					break;
				}
			}
		}
	}

	public async finish() {
		if (this.finished) return;
		this.finished = true;

		console.debug(`🏁 Game ${this.gameId} finishing with scores: ${this.scores.left}-${this.scores.right}`);

		for (const [playerId, interval] of this.warningIntervals) {
			clearInterval(interval);
		}
		this.warningIntervals.clear();

		if (this.unsubscribeTick) {
			this.unsubscribeTick();
			this.unsubscribeTick = null;
		}

		if (this.unsubscribeScore) {
			this.unsubscribeScore();
			this.unsubscribeScore = null;
		}

		const state = this.getState();
		if (this.socketNamespace && !this.wasForfeited) {
			this.socketNamespace.to(this.gameId).emit("game-finished", state);
		}

		if (this.onFinish) {
			try {
				console.debug(`🎮 Game ${this.gameId} calling onFinish callback with state:`, {
					scores: state.scores,
					leftPlayer: this.leftPlayer?.username,
					rightPlayer: this.rightPlayer?.username,
					wasForfeited: this.wasForfeited
				});
				await this.onFinish(state);
				console.debug(`✅ Game ${this.gameId} onFinish callback completed`);
			} catch (error) {
				console.error(`❌ Game ${this.gameId} onFinish callback failed:`, error);
			}
		} else {
			console.debug(`⚠️ Game ${this.gameId} has no onFinish callback!`);
		}
	}

}
