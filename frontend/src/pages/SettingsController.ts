import { api } from "@main";
import { authManager } from "@src/tools/AuthManager";
import { RouteController } from "@tools/ViewController";
import { router } from "./_router";
import { k, t } from "@src/tools/i18n";
import { TRPCClientError } from "@trpc/client";
import toast from "@src/tools/Toast";

export class SettingsController extends RouteController {

	#currentAvatarData: string | null = null;

	#previewAvatar: HTMLImageElement | null = null;
	#avatarInput: HTMLInputElement | null = null;
	#usernameInput: HTMLInputElement | null = null;
	#saveAvatarButton: HTMLButtonElement | null = null;
	#saveUsernameButton: HTMLButtonElement | null = null;

	#onAvatarUpload = this.onAvatarUpload.bind(this);
	#onSaveAvatar = this.onSaveAvatar.bind(this);
	#onSaveUsername = this.onSaveUsername.bind(this);


	constructor() {
		super();
		this.titleSuffix = 'Settings';
	}

	protected async preRender() {
		const loggedIn = await authManager.isUserLoggedIn();
		if (!loggedIn) {
			router.navigate('/');
		}
	}
	async render() {
		const userData = authManager.user;
		const avatarUrl = authManager.userImageUrl;

		return /*html*/`
		<div class="flex flex-col grow w-full items-center justify-center p-4">
			<div class="flex flex-col w-full max-w-2xl p-6 bg-zinc-800/50 rounded-lg shadow-md space-y-8">
				<h1 class="text-3xl font-bold text-gray-100" data-i18n="${k('settings.title')}">Profile Settings</h1>

				<!-- Profile Image -->
				<div class="p-6 bg-zinc-700 rounded-lg">
					<h2 class="text-lg font-semibold text-gray-300 mb-4" data-i18n="${k('generic.profile_picture')}">Profile Picture</h2>
					<div class="flex flex-col sm:flex-row justify-center gap-2 items-center">
						<div class="w-24 h-24 aspect-square shrink-0 rounded-full bg-gray-700 overflow-hidden">
							<img id="preview-avatar" src="${avatarUrl ?? ''}" alt="Profile Picture"
									class="w-full h-full object-cover aspect-square">
						</div>
						<div class="flex flex-col grow">
							<label class="relative cursor-pointer flex justify-center sm:justify-start text-center">
								<span class="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg
											transition duration-300 inline-block">
									Upload New Picture
								</span>
								<input type="file" class="hidden" accept="image/*" id="avatar-input">
							</label>
							<p class="text-sm text-gray-400 mt-2" data-i18n="${k('settings.profile_picture_instructions')}">
								Recommended: Square image, max 2MB
							</p>
						</div>
					</div>
					<button id="save-avatar"
							class="cursor-pointer mt-4 w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold
									py-2 px-4 rounded-lg transition duration-300 transform hover:scale-[1.01]
									disabled:opacity-50 disabled:cursor-not-allowed">
						Update Profile Picture
					</button>
				</div>

				<!-- Username -->
				<div class="p-6 bg-zinc-700 rounded-lg">
					<h2 class="text-lg font-semibold text-gray-300 mb-4" data-i18n="${k('generic.username')}">Username</h2>
					<div class="flex flex-col space-y-2">
						<input value="${userData?.username ?? ''}"
								type="text"
								id="username-input"
								minlength="3"
								maxlength="24"
								placeholder="E.g. Pippo"
								class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg
										text-gray-100 placeholder-gray-400 focus:outline-none
										focus:border-amber-500 transition duration-300">
						<p class="text-sm text-gray-400" data-i18n="${k('settings.username_instructions')}">
							Username must be unique and at least 3 characters
						</p>
					</div>
					<button id="save-username"
							class="mt-4 w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold
									py-2 px-4 rounded-lg transition duration-300 transform hover:scale-[1.01]">
						Update Username
					</button>
				</div>
			</div>
		</div>
	`;
	}

	async postRender() {
		this.#previewAvatar = document.getElementById('preview-avatar') as HTMLImageElement;
		this.#avatarInput = document.getElementById('avatar-input') as HTMLInputElement;
		this.#usernameInput = document.getElementById('username-input') as HTMLInputElement;
		this.#saveAvatarButton = document.getElementById('save-avatar') as HTMLButtonElement;
		this.#saveUsernameButton = document.getElementById('save-username') as HTMLButtonElement;

		this.#avatarInput?.addEventListener('change', this.#onAvatarUpload);
		this.#saveAvatarButton?.addEventListener('click', this.#onSaveAvatar);
		this.#saveUsernameButton?.addEventListener('click', this.#onSaveUsername);

		this.#saveAvatarButton!.disabled = true;
	}

	private onAvatarUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (re) => {
				const result = re.target?.result;
				if (result instanceof ArrayBuffer) {
					this.#currentAvatarData = URL.createObjectURL(new Blob([result], { type: file.type ?? 'image/png' }));
				} else if (result) {
					this.#currentAvatarData = result;
				}
				this.#previewAvatar!.src = this.#currentAvatarData!;
				this.#saveAvatarButton!.disabled = false;
				console.debug('Uploaded avatar. Size:', file.size / 1024 / 1024, 'MB', 'type:', file.type);
			};
			reader.readAsDataURL(file);
		}
	}

	private async onSaveAvatar() {
		if (!this.#currentAvatarData) return;

		try {
			const response = await api.user.uploadAvatar.mutate({ dataUrl: this.#currentAvatarData });
			authManager.refreshUser();
			this.#saveAvatarButton!.disabled = true;
			toast.success(t('settings.update.avatar.title'), t('settings.update.avatar.success') ?? "");
		} catch (err) {
			if (err instanceof TRPCClientError) {
				console.debug('Error saving avatar', { err });
				const meta = err.meta;
				const msg = (meta?.errorJSON as any)?.message ?? err.message;
				toast.error(t('settings.update.avatar.title'), msg);
			}
		}
	}

	private async onSaveUsername() {
		const newUsername = this.#usernameInput?.value?.trim();
		if (!newUsername) return;
		try {
			const response = await api.user.updateUsername.mutate({ username: newUsername });
			authManager.refreshUser();
			toast.success(t('settings.update.username.title'), t('settings.update.username.success') ?? "");
			this.#usernameInput!.value = response.username;
		} catch (err) {
			if (err instanceof TRPCClientError) {
				console.debug('Error saving username', { err });
				toast.error(t('settings.update.username.title'), err.message);
			}
		}
	}

}
