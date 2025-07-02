import {type AppRouter} from "./src/pages/_router";
import {type AuthManager} from "./src/tools/AuthManager";
import {Toast} from "./src/tools/Toast";

declare global {
	interface Window {
		router: AppRouter,
		authManager: AuthManager,
		toast: Toast,
	}
}
