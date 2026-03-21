# OnionCraft

A Guild Wars 2 planning tool for crafting profit analysis and skin collection tracking.

**Stack:** Next.js · Azure Static Web Apps · Azure Table Storage · TypeScript

**Hosted at:** geekyonion.com _(coming soon)_

---

## Features

- **Crafting Profit Calculator** — finds the most profitable items to craft given your current TP prices, learned recipes, crafting disciplines, and material overages after reserving for a legendary ring goal
- **Skin Collection Tracker** — shows unowned weapon/armor skins ranked by user-defined priority rules (acquisition method, cost, skin type)

## Design

Full spec: [`docs/superpowers/specs/2026-03-21-gw2-planner-design.md`](docs/superpowers/specs/2026-03-21-gw2-planner-design.md)

## Local Development

> Prerequisites: Node.js, npm, [Azurite](https://github.com/Azure/Azurite), [SWA CLI](https://github.com/Azure/static-web-apps-cli)

```bash
# Install dependencies
npm install

# Start Azurite (Table Storage emulator)
azurite --silent --tableHost 127.0.0.1

# Start local dev server (use swa start, not next dev)
swa start
```

Copy `.env.local.example` to `.env.local` and fill in your values before starting.

## Project Structure

```
/app              Next.js App Router pages and API routes (/api/v1/)
/lib              Shared utilities (auth stub, Table Storage client, GW2 client)
/data             Static JSON data files (Mystic Forge recipes, craft limits, etc.)
/fixtures/gw2     GW2 API response snapshots for unit testing
/docs             Design specs and project documentation
staticwebapp.config.json  Required SWA routing configuration
```

## Contributing

This is a personal project. Issues and PRs welcome.

> **OnionCraft is an unofficial fan project and is not affiliated with, endorsed by, or approved by ArenaNet or NCSOFT.**
>
> ©2010–present ArenaNet, LLC. All Rights Reserved. NCSOFT, the interlocking NC logo, ArenaNet, Guild Wars, Guild Wars 2, Heart of Thorns, Path of Fire, End of Dragons, Secrets of the Obscure, and all associated logos and designs are trademarks or registered trademarks of NCSOFT Corporation. All other trademarks are the property of their respective owners.
