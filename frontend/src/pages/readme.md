# Pages

This folder is responsible for the logic of all the pages in the application.

## Overview

The main file is [`_router.ts`](./_router.ts), which is responsible for routing the pages.
To add a new page, create a new controller class that extends the `RouteController` class and add it to the `routes` array in the [`_router.ts`](./_router.ts) file.
Each route has a `path` property, which is the URL path of the page, and a `newController` property, which is a function that returns an instance of the controller class.
There are also optional properties for `authRequired` and `layout`, which are used to determine if the page requires authentication and which layout to use.

E.g., to add a new page at `/home`, create a new controller class that extends the `RouteController` class and add it to the `routes` array in the [`_router.ts`](./_router.ts) file.
```ts
export const routes: Route[] = [
	{
		path: '/home',
		newController: () => new HomeController(),
		authRequired: true,
	},
];
```

## Controllers

A controller is a class that extends the `RouteController` class (see [types/pages.ts](./types/pages.ts) for the default implementations).

A Controller has 3 lifecycle methods:

- `preRender()`: @Optional. Called before the `render()` method. Useful for initializing the data needed for the view (e.g., fetching data from the server).
- `render()`: This method returns the HTML of the view. It can use the class' data fetched in `preRender` function.
- `postRender()`: @Optional. Called after the `render()` method. Useful for binding event listeners and other post-render operations.

See the [`HomeController`](./HomeController.ts) and [`LandingPageController`](./LandingPageController.ts) for examples.


## Router usage

The router is a singleton class that is accessible globally via the `window.router` variable or from the exported `router` variable.

The methods available on the router are:

- [`init()`](./_router.ts): This method should be called only once, when the application is ready to start routing.
- `currentController`: You can use this property to access the current controller instance.
- `navigate(path: string)`: Navigate to the specified page. This method updates the URL if not already on the target page and renders the new page (all 3 lifecycle methods are called).
- `changeLoadingState(isLoading: boolean)`: This method is used internally by the router to update the loading state of the application. If you want to manually update the loading state, you can call this method. It's functionality works as follows:
  - The class keeps track of the number of active `true` loading requests. Until there is at least one `true` request, the loading state is `true` (the loading spinner is shown).
  - If the function has been called with `false`, the `true` loading requests counter is decremented.
  - If the `true` loading requests counter is 0, the loading state is `false` (the loading spinner is hidden).
