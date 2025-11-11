import { api } from "@main";
import { RouterOutputs } from "@shared";
import { k, t } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { TRPCClientError } from "@trpc/client";

export class OnlineTournamentDetailsController extends RouteController {
	#tournamentId: string = "";

	#tournamentDto: RouterOutputs['tournament']['getTournamentDetails'] | null = null;

	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);

		this.#tournamentId = this.params.tournamentId;
		this.updateTitleSuffix();
	}

	override updateTitleSuffix() {
		if (this.#tournamentDto) {
			this.titleSuffix = `${this.#tournamentDto.name} - ${t('generic.tournament')}`;
		} else {
			this.titleSuffix = `#${this.#tournamentId}`;
		}
	}

	protected async preRender() {
		try {
			this.#tournamentDto = await api.tournament.getTournamentDetails.query({tournamentId: this.#tournamentId});
			console.log(this.#tournamentDto);
		} catch(err){
			if (err instanceof TRPCClientError) {
				const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
				toast.error(t('generic.join_tournament'), msg);
				console.warn(err);
			} else {
				toast.error(t('generic.join_tournament'), t('error.generic_server_error') ?? "");
				console.error(err);
			}
		}
		this.updateTitleSuffix();
	}


	#renderNotFound(){
		return /*html*/`
		<div class="flex flex-col items-center justify-center text-3xl grow">
			<h1 class="text-2xl uppercase font-mono font-bold" data-i18n="${k('generic.tournament_not_found')}">Tournament not found</h1>
			<a data-route="/play/online/tournaments" href="/play/online/tournaments" class="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-400 transition-colors">
				<i class="fa fa-arrow-left"></i>
				<span class="ml-1" data-i18n="${k('generic.go_back')}">Go back</span>
			</a>
		</div>
		`;
	}

	protected async render() {
		if (!this.#tournamentDto) {
			return this.#renderNotFound();
		}

		return /*html*/`
			<div class="flex flex-col">
				<h1 class="text-2xl">TOURNAMENT GAME</h1>
				<div>
					TOURNAMENT ID: ${this.#tournamentId}
				</div>
			</div>
		`;
	}

	protected async postRender() {
		if (!this.#tournamentDto) {
			return;
		}


	}
}
