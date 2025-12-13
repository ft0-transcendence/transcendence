import {type AppRouter} from "./src/pages/_router";
import {type AuthManager} from "@tools/AuthManager";
import {Toast} from "@tools/Toast";

declare global {
	interface Window {
		router: AppRouter,
		authManager: AuthManager,
		toast: Toast,

	}

}

declare const LeaderLine: any;
