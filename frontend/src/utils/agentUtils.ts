export const isMobile = () => {

	const isAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (navigator as any).msMaxTouchPoints > 0;
	return isAgentMobile || hasTouch;
}

export const isIos = () => {
		var isIOS = /ipad|iphone|ipod/.test(navigator.userAgent?.toLowerCase()) && !(window as any).MSStream;
		return isIOS;
}
