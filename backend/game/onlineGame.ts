import { Game, GameUserInfo, GameStatus, MovePaddleAction, GameState, STANDARD_GAME_CONFIG, GameConfig } from "./game";
import { Game as PrismaGame } from "@prisma/client";
import { TypedSocketNamespace } from "../src/socket-io";

type FinishCallback = (state: GameStatus) => Promise<void> | void;

export class OnlineGame extends Game {
	protected gameId: string;
	protected socketNamespace: TypedSocketNamespace | null;

	public pendingDbCreation: PrismaGame | null = null;

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
	private playerLeftReady = false;
	private playerRightReady = false;

	constructor(
		gameId: string,
		socketNamespace: TypedSocketNamespace | null,
		config?: Partial<GameConfig>,
		onFinish?: FinishCallback,
		updateGameActivity?: (gameInstance?: OnlineGame) => Promise<void>,
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
				console.log(`Game ${this.gameId} ended naturally with score ${this.scores.left}-${this.scores.right}`);
				this.finish();
			}
		});

		this.unsubscribeScore = this.onScore(async (scores) => {
			if (this.updateGameActivity) {
				await this.updateGameActivity(this);
			}
		});
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
		if (player.id === this._playerLeft?.id) {
			this.playerLeftReady = true;
		} else if (player.id === this._playerRight?.id) {
			this.playerRightReady = true;
		}
		if (this.playerLeftReady && this.playerRightReady) {

			this.start();
			if (this.socketNamespace) {
				this.socketNamespace.to(this.gameId).emit("game-state", this.getState());
			}
		}
	}


	public isPlayerInGame(id: GameUserInfo['id']) {
		return id === this._playerLeft?.id || id === this._playerRight?.id;
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
		const existingUserIndex = this.connectedUsers.findIndex(u => u.id === user.id);
		if (existingUserIndex >= 0) {
			this.connectedUsers[existingUserIndex] = user;
		} else {
			this.connectedUsers.push(user);
		}
	}

	public removeConnectedUser(user: GameUserInfo): boolean {
		const initialLength = this.connectedUsers.length;
		this.connectedUsers = this.connectedUsers.filter(u => u.id !== user.id);
		return this.connectedUsers.length < initialLength;
	}

	public getConnectedPlayers(): GameUserInfo[] {
		return [...this.connectedUsers];
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

					if (opponentId) {
						const FORFEIT_WIN = (this.config.maxScore ?? STANDARD_GAME_CONFIG.maxScore)!;
						const FORFEIT_LOSS = 0;
						if (this.leftPlayer && this.rightPlayer) {
							if (opponentId === this.leftPlayer.id) {
								this.scores.left = FORFEIT_WIN;
								this.scores.right = FORFEIT_LOSS;
							} else if (opponentId === this.rightPlayer.id) {
								this.scores.left = FORFEIT_LOSS;
								this.scores.right = FORFEIT_WIN;
							}
						}
						this.wasForfeited = true;
					}

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

		console.log(`🏁 Game ${this.gameId} finishing with scores: ${this.scores.left}-${this.scores.right}`);

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
				console.log(`🎮 Game ${this.gameId} calling onFinish callback with state:`, {
					scores: state.scores,
					leftPlayer: this.leftPlayer?.username,
					rightPlayer: this.rightPlayer?.username,
					wasForfeited: this.wasForfeited
				});
				await this.onFinish(state);
				console.log(`✅ Game ${this.gameId} onFinish callback completed`);
			} catch (error) {
				console.error(`❌ Game ${this.gameId} onFinish callback failed:`, error);
			}
		} else {
			console.log(`⚠️ Game ${this.gameId} has no onFinish callback!`);
		}
	}

}
