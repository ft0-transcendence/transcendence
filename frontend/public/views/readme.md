# Views

Views are used to render the content of the page.

The view is a HTML file that is rendered inside the `APP_CONTAINER_ID` or `APP_LAYOUT_CONTENT_ID` if the route has a layout specified.

The view can be specified in the route object:

```ts
const routes: Route[] = [
	{
		path: '/',
		view: '/views/LandingPageView.html',
		newController: () => new LandingPageController(),
		layout: '/layouts/BaseLayout.html',
	},
	//...
];
```

The logic of the view is implemented in the [controllers](../../src/controllers/readme.md).
