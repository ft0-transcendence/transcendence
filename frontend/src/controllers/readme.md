# Controllers

Controllers are responsible for the logic of a [view](../../public/views/readme.md).

A controller is a class that extends the `RouteController` class.

There are two methods that must be implemented:

- `init()`: This method is called when the controller is initialized. It is called after the view is loaded.
- `destroy()`: This method is called when the controller is destroyed. It is called before the view is unloaded. Useful for cleaning up resources.

See the [`HomeController`](./HomeController.ts) and [`LandingPageController`](./LandingPageController.ts) for examples.
