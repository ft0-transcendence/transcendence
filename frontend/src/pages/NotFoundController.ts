import { RouteController } from '../types/pages';
import { notSuspiciousSvg } from '../assets/good_soup';
import toast from '../tools/Toast';

export class NotFoundController extends RouteController {
	constructor() {
		super();
		this.titleSuffix = 'Page Not Found';
	}
	#circle: HTMLDivElement | null = null;
	#easterDiv: HTMLDivElement | null = null;



	async render() {
		return /*html*/`
			<div class="flex flex-col items-center justify-center text-center w-full h-full text-white">

				<div class="text-5xl font-bold relative z-10 h-24">
					<h1>404</h1>

					<div class="opacity-10 hidden_easter w-60 h-60 absolute pointer-events-none z-20 hidden items-center justify-center bottom-full left-1/2 -translate-x-1/2">
						${notSuspiciousSvg}
					</div>
				</div>

				<p class="mt-4 text-lg italic">The page you are <span class="font-bold font-serif">looking</span> for does not exist.</p>
				<button data-route="/" class="route-link mt-6 rounded text-gray-400 hover:underline">Go back to Home</button>
				<div id="circle" class="mouse_circle fixed top-full left-full w-40 h-40 rounded-full  pointer-events-none"></div>
			</div>
		`;
	}

	async postRender() {
		this.#circle = document.getElementById('circle') as HTMLDivElement | null;
		this.#easterDiv = document.querySelector('.hidden_easter') as HTMLDivElement | null;

		if (!this.#circle || !this.#easterDiv) {
			toast.error('Initialization Error', 'The page is broken. Check console for more details.');
			if (!this.#circle) {
				console.error('no `#circle` div found');
			}
			if (!this.#easterDiv) {
				console.error('no `.hidden_easter` div found');
			}
			return;
		}
		document.addEventListener('mousemove', this.#handleMouseMove.bind(this));
		document.addEventListener('touchmove', this.#handleTouchMove.bind(this));
	}

	protected async destroy() {

		document.removeEventListener('mousemove', this.#handleMouseMove.bind(this));
		document.removeEventListener('touchmove', this.#handleTouchMove.bind(this));
	}

	#handleTouchMove = (event: TouchEvent) => {

		const touch = event.touches[0];
		if (!touch || !this.#circle || !this.#easterDiv) return;

		const x = touch.clientX;
		const y = touch.clientY;

		this.#updateCircle(x, y);
		event.preventDefault();
		event.stopPropagation();
	}

	#handleMouseMove(event: MouseEvent) {
		if (!this.#circle) return;
		if (!this.#easterDiv) return;

		const x = event.clientX;
		const y = event.clientY;
		this.#updateCircle(x, y);
		event.preventDefault();
		event.stopPropagation();
	}

	#updateCircle(x: number, y: number) {
		if (!this.#circle || !this.#easterDiv) return;


		const circleSize = this.#circle.clientWidth / 2;

		// Move the visual circle
		this.#circle.style.top = `${y}px`;
		this.#circle.style.left = `${x}px`;
		this.#circle.style.transform = 'translate(-50%, -50%)';

		// Calculate position relative to altText
		const rect = this.#easterDiv.getBoundingClientRect();
		const relX = x - rect.left;
		const relY = y - rect.top;

		// Show alt text with circular mask
		this.#easterDiv.classList.remove('hidden');
		this.#easterDiv.style.webkitMaskImage = `radial-gradient(circle ${circleSize}px at ${relX}px ${relY}px, black 100%, transparent 100%)`;
		this.#easterDiv.style.maskImage = `radial-gradient(circle ${circleSize}px at ${relX}px ${relY}px, black 100%, transparent 100%)`;
	}

}
