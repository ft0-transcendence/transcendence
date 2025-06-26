import {type AppRouter} from "./src/pages/_router";

declare global {
	interface Window {
		router: AppRouter
	}
}
