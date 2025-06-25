import {type AppRouter} from "../pages/_router";

declare global {
	interface Window {
		router: AppRouter
	}
}
