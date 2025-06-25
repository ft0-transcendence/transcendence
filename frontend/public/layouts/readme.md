# Layouts

Layouts are used to wrap the pages. They are optional.

The layout is a HTML file that is rendered before the view.

The layout can be specified in the route object:

```ts
const routes: Route[] = [
	{
		path: '/',
		newController: () => new LandingPageController(),
		layout: '/layouts/BaseLayout.html',
	},
	//...
];
```

The layout must have an element with the same ID as `APP_LAYOUT_CONTENT_ID`.

If no layout is specified, an error is thrown.
