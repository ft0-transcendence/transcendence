import {type AppRouter} from "./src/pages/_router";
import {type AuthManager} from "./src/tools/AuthManager";

declare global {
	interface Window {
		router: AppRouter,
		authManager: AuthManager
	}
}
