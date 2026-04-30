# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development

- `rushx dev` - Start development server (runs ttastra dev on port 3002)
- `rushx build` - Production build using ttastra
- `rushx serve` - Serve built application
- `rushx setup` - Full project setup (rush update + rush build)

### Code Quality

- `rushx lint` - Run ESLint on all files
- `rushx lint:fix` - Auto-fix ESLint issues and report unused disable directives
- `rushx _phase:type-check` - TypeScript type checking (tsc --noEmit)

### Service Generation

- `rushx idl` - Regenerate service definitions from BAM (clears src/service/bam-auto-generate/*)
- `rushx update-idl` - Same as idl command
- `bam update` - Update service definitions

### Testing

- `rushx test` - Run Jest tests
- `rushx test:watch` - Run Jest tests in watch mode
- `rushx _phase:test` - Run tests with coverage in CI mode

## Architecture Overview

### Framework & Build System

This is a **TikTok Local Services Operation Alliance Platform** built with:

- **TTAstra** - Internal ByteDance React framework for micro-frontend architecture
- **VMOK** - Module federation system for sharing components across micro-frontends
- **EdenX** - Internal build tooling and developer experience platform
- **Rush** - Monorepo management (part of larger ttls-repository monorepo)

### Project Structure

#### Core Directories

- `src/pages/` - Page components organized by business domain
- `src/components/` - Shared UI components (error-boundary, count-input, batch-task, Authentication, sortable-table)
- `src/service/` - API service layer and auto-generated BAM clients
- `src/utils/` - Utility functions
- `src/hooks/` - Custom React hooks
- `src/model/` - Data models and business logic
- `src/constants/` - Constants and enums
- `src/transform/` - Data transformation functions
- `src/i18n/` - Internationalization files
- `src/runtime/` - Application runtime initialization
- `src/assets/` - Static assets (icons, images)

#### Key Business Domains

The application focuses on creator alliance and matchmaking features:

- **creator-package/** - Creator package management and configuration
- **creator-task/** - Creator task management and assignment
- **creator-package-task/** - Integration of creator packages with tasks
- **creator-learning-config/** - Creator learning and training configuration
- **ranking/** - Creator and merchant ranking systems

### Service Layer (BAM Integration)

- Services defined in `bam.config.js` generate TypeScript clients in `src/service/bam-auto-generate/`
- Main services:
  - `agw` - API Gateway: apigateway.bff.agw_bff_mid_ls_op@master
  - `bff` - Backend for Frontend: tiktok.local_service.op_platform_server@master
  - `alliance_merchant_matchmaking` - Alliance matchmaking service: tiktok.local.alliance_merchant_matchmaking@master
- Run `rushx idl` after service definition changes
- BAM config includes runtime validators and field name transformations (camelCase API names, snake_case fields)

### State Management & Libraries

- **Jotai** - Primary state management (v2.8.4)
- **ahooks** - React hooks library (v3.8.0)
- **Semi Design** (@douyinfe/semi-ui v2.33.0) - Primary UI component library
- **Semi Icons** (@douyinfe/semi-icons v2.33.0) - Icon library
- **Semi Illustrations** - Illustration assets
- **@dnd-kit** - Drag and drop functionality (core, sortable, modifiers, utilities)
- **React Router** - Client-side routing via @ttastra/core/runtime/router
- **axios** - HTTP client (v1.7.9)
- **dayjs** - Date manipulation (v1.11.0)
- **lodash** - Utility functions (v4.17.21)
- **number-precision** - Precise number calculations

### Development Environment

- TypeScript 5.0.4 with strict configuration
- ESLint with TikTok internal config (@tiktok-arch/eslint-config)
- Tailwind CSS for styling (v3.3.3)
- Dev server runs on **port 3002** with `/main/alliance` base URL
- Module federation enabled for sharing with other micro-frontends
- Source build plugin enabled (@rsbuild/plugin-source-build)

### Import Paths

- Use `@/*` alias for src/ directory imports
- Use `@api/*` for api/ directory imports
- Use `@alliance/shared/*` for shared alliance components from `../../alliance_shared/src/*`
- TypeScript baseUrl set to "./"

### Testing & Quality

- Jest testing framework with React Testing Library
- Test config in `jest.config.json`
- Use existing lint configuration - do not modify ESLint rules
- Type checking via `rushx _phase:type-check`
- Integration test SDK available (@tiktok-arch/integration-test-sdk)

### Monitoring & Analytics

- **Slardar** - Frontend monitoring (bid: 'operation_backend_alliance')
- **TEA** - ByteDance analytics and event tracking enabled
- Environment variables for build info: BUILD_TYPE, BUILD_VERSION, BUILD_REGION

### Authentication & Security

- **BDSSO** (ByteDance Single Sign-On) with CAS integration
- AID: 549257 for authentication
- Internal app deployment to 'row' and 'us' regions

### Shared Dependencies

- Uses workspace packages:
  - `@tiktok-fe/alliance_shared` - Shared alliance components
  - `@tiktok-fe/ls_operation_app_shared` - Local service operation shared utilities
- Shared components include: collapse-card, cooperation-data

### File Upload

- Uses `@byted/uploader-oversea` (v2.1.7) for file upload functionality

### Form Validation

- Uses `@byted-arch-fe/v-json-validator` (v0.3.1) for JSON schema validation

## Best Practices

- Follow existing code patterns and conventions
- Use Semi Design components for UI consistency
- Leverage Jotai atoms for state management
- Use ahooks for common React hook patterns
- Keep service layer separate from UI components
- Use transformation layer for data mapping between API and UI
- Place business logic in model/ directory
- Use TypeScript strict mode - ensure proper typing
- Leverage Tailwind CSS utilities for styling
- Test with Jest and React Testing Library

## Common Tasks

### Adding a New Page

1. Create page component in `src/pages/[domain]/`
2. Add route configuration in `src/router.tsx`
3. Add i18n strings if needed in `src/i18n/`
4. Create corresponding models in `src/model/` if needed
5. Add data transformation logic in `src/transform/` if needed

### Adding New API Service

1. Update `bam.config.js` with new service endpoints
2. Run `rushx idl` to generate TypeScript client
3. Create service wrapper in `src/service/` if needed
4. Add transformation logic in `src/transform/` for data mapping

### Adding Shared Components

1. Create component in `src/components/`
2. Export from component index file
3. Add tests if needed
4. Document props and usage

## Deployment

- Internal ByteDance application
- Deployed to regions: row (rest of world), us (United States)
- Base URL: `/main/alliance`
- Uses TTAstra deployment pipeline