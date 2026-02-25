# Development

## Requirements

- [Bun](https://bun.sh/)
- [Tmux](https://github.com/tmux/tmux)

## Setup

1. Clone the repository.
2. Run `bun install` to install dependencies.
3. Run the development environment.
   3.1 With Tmux: `./start.sh`
   3.2 Cd into `apps/client` and `apps/server` and run `bun dev` in both.

The development environment will use a data folder in `apps/server/data` to store everything, including the database and uploaded files. You can delete this folder to reset the development environment.

### Remote Image Caching

When messages include external images, the server now automatically downloads and caches them
under `data/public/remote`. URLs are rewritten to `/remote/<sha1>.<ext>` so clients can fetch
images without leaking the original referer. In development the Vite server proxies `/remote`
requests to the backend (see `apps/client/vite.config.ts`). The cache persists across restarts
and is shared with plugins using `ctx.actions.messages.create`.

## Testing

To run existing tests, navigate to the `apps/server` directory and run `bun test`. This will execute all tests in the server application.

## Roadmap

See [ROADMAP](/ROADMAP.md) for the project's roadmap and future plans.
