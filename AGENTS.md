# AGENTS.md - Developer & Agent Instructions

This document provides guidance for AI Coding Agents and developers contributing to the **AI Sidebar Chat & Writing Assistant** codebase.

---

## 1. Project Overview & Architecture

- **Extension Manifest**: Chrome Manifest V3 (`manifest.json` / `manifest/`).
- **Source Code**: TypeScript under `src/` compiled via Vite (`vite.config.ts`, `vite.content.config.ts`).
- **Legacy Root Files**: `script.js` and `sidepanel.html` maintain legacy AI Tools features while integrating module entries.
- **Dual Tab Architecture**:
  - `写作助手` (Writing Assistant): DOM-free text domain, content-script editor discovery, background LLM transport, Shadow DOM annotation overlays (`[data-writing-assistant="overlay"]`).
  - `AI 工具` (AI Tools Chat): Multi-provider LLM chat, context management, streaming SSE responses, model configuration import/export.

---

## 2. Testing & UI Verification Guidelines

All UI testing, browser automation, error simulations, and visual inspection methods are defined in **[UI-test.md](./UI-test.md)**.

### Quick Test Commands:
```bash
# Build production bundle
npm run build

# Run Vitest unit & integration tests
npm run test:unit
npm run test:integration

# Run Playwright E2E tests
npx playwright test tests/e2e/user-api.spec.ts --project=chromium
npx playwright test tests/e2e/user-writing-assistant.spec.ts --project=chromium
npx playwright test tests/e2e/test-all-english-errors.spec.ts --project=chromium

# Generate visual UI screenshots
node scripts/take-screenshot.mjs
```

Refer to **[UI-test.md](./UI-test.md)** for detailed specifications on error categories (`spelling`, `grammar`, `word_choice`, `non_english`, `protectedSpans`), Playwright CDP extension loading, and screenshot verification procedures.

---

## 3. Important Coding Rules & Constraints

1. **Non-Localhost HTTP Context Safety**:
   - Web Crypto `crypto.randomUUID()` is disabled by browsers on non-localhost HTTP origins (e.g. `http://192.168.31.233:8080`).
   - Always use `generateUUID()` from `src/shared/uuid.ts` instead of calling `crypto.randomUUID()` directly in content scripts.

2. **Build Before Running E2E Tests**:
   - Always run `npm run build` before executing Playwright tests to ensure `dist/` contains the latest background, content, and sidepanel assets.

3. **DOM & Styling Integrity**:
   - Maintain clean CSS shapes (`border-radius: 50%` / `border-radius: 2px`) for status indicators and count buttons instead of relying on OS-dependent text glyphs.
   - Modal dialogs must include backdrop overlay blurs for proper visual focus.

4. **Mandatory Real LLM API Execution for E2E Tests**:
   - All E2E tests validating AI writing assistant & chat features must invoke real LLM APIs (`REAL_LLM_BASE_URL` & `REAL_LLM_API_KEY`).
   - Using Mock API responses (`fixture-server`) or swallowing API errors for E2E acceptance is strictly forbidden. Tests must fail explicitly if the real LLM API fails or is unavailable.
