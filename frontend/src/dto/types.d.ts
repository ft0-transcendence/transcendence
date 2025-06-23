import {type Router} from "../router";

declare global {
	interface Window {
		router: Router
	}
}
