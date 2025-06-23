# Layouts

Layouts are used to wrap the views. They are optional.

The layout is a HTML file that is rendered before the view.

The layout can be specified in the route object:

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

The layout must have an element with the same ID as `APP_LAYOUT_CONTENT_ID`.

If no layout is specified, the view is rendered directly in the `APP_CONTAINER_ID`.
