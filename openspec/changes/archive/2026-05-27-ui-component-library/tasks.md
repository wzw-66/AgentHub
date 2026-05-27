## 1. Package Foundation

- [x] 1.1 Create `packages/ui/package.json` with name `@agenthub/ui`, type `module`, dual output (ESM + CJS), peerDeps (react, react-dom), devDeps (tsup, vitest, typescript, @vitejs/plugin-react, prism-react-renderer, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom)
- [x] 1.2 Create `packages/ui/tsconfig.json` extending `tooling/tsconfig/nextjs.json`, with `jsx: "react-jsx"`, `types: ["node"]`, and `include: ["src"]`
- [x] 1.3 Create `packages/ui/tsup.config.ts` with entry `src/index.ts`, format `["esm", "cjs"]`, `dts: true`, `external: ["react", "react-dom"]`, `esbuildOptions.jsx: "automatic"`
- [x] 1.4 Create `packages/ui/vitest.config.ts` with `@vitejs/plugin-react`, `environment: "jsdom"`, `include: ["src/**/*.test.{ts,tsx}"]`, `setupFiles: ["src/test/setup.ts"]`
- [x] 1.5 Create `packages/ui/src/test/setup.ts` with `@testing-library/jest-dom/vitest` import for DOM matchers
- [x] 1.6 Create `packages/ui/src/styles/tokens.css` with CSS custom properties for colors (primary, bg-user, bg-contact, text, border), spacing scale (--ui-space-1/2/3/4), font stacks (mono, sans), border radius (sm/md/lg), and shadow tokens
- [x] 1.7 Create `packages/ui/src/index.ts` as barrel export (stub, filled per component)
- [x] 1.8 Run `pnpm install` and verify workspace resolution and build skeleton

## 2. AgentAvatar Component

- [x] 2.1 Define `AgentAvatarProps` interface in `src/types.ts` with `name: string`, `avatarUrl?: string`, `size?: 'sm' | 'md' | 'lg'`, `className?: string`
- [x] 2.2 Implement `AgentAvatar.tsx`: render `<img>` when `avatarUrl` provided, fallback to first-character initials with deterministic background color when no image
- [x] 2.3 Implement `AgentAvatar.module.css`: circular crop, size variants (32/40/48px), centered initials text, background color for fallback
- [x] 2.4 Export `AgentAvatar` from `src/index.ts`
- [x] 2.5 Write tests: renders image when avatarUrl provided, shows initials when no avatarUrl, applies correct size class, appends className to root element

## 3. MessageBubble Component

- [x] 3.1 Define `MessageBubbleProps` interface in `src/types.ts` with `message: Message` (from `@agenthub/shared`), `variant: 'user' | 'contact' | 'system'`, `children?: ReactNode`, `className?: string`
- [x] 3.2 Implement `MessageBubble.tsx`: render message content text, apply variant-specific styling (user=left+primary, contact=right+neutral, system=center+small), display formatted timestamp from `createdAt`
- [x] 3.3 Implement `MessageBubble` inline styles and CSS variable references
- [x] 3.4 Export `MessageBubble` from `src/index.ts`
- [x] 3.5 Write tests: renders text content, user variant has left-aligned styling, contact variant has right-aligned styling, system variant is centered, displays formatted timestamp

## 4. CodeBlock Component

- [x] 4.1 Define `CodeBlockProps` interface in `src/types.ts` with `code: string`, `language?: string`, `showLineNumbers?: boolean`, `maxHeight?: string`, `className?: string`
- [x] 4.2 Implement `CodeBlock.tsx`: use `prism-react-renderer` `Highlight` component for syntax highlighting, render language label, add copy-to-clipboard button with "Copied!" feedback state
- [x] 4.3 Implement `CodeBlock` inline styles and CSS variable references
- [x] 4.4 Export `CodeBlock` from `src/index.ts`
- [x] 4.5 Write tests: renders code content with syntax highlighting, copy button visible on render, clipboard API called on click, copy feedback shows briefly, language label displayed, scrollable when content exceeds maxHeight

## 5. DiffCard Component

- [x] 5.1 Define `DiffCardProps` interface in `src/types.ts` with `diff: string`, `title?: string`, `className?: string`
- [x] 5.2 Implement `DiffCard.tsx`: parse unified diff lines, render added lines (`+`) with green, removed lines (`-`) with red, context lines neutral, show title bar, handle empty diff with placeholder message
- [x] 5.3 Implement `DiffCard` inline styles and CSS variable references
- [x] 5.4 Export `DiffCard` from `src/index.ts`
- [x] 5.5 Write tests: renders added lines in green, renders removed lines in red, renders context lines without highlight, displays title, handles empty diff with placeholder

## 6. PreviewCard Component

- [x] 6.1 Define `PreviewCardProps` interface in `src/types.ts` with `url: string`, `title?: string`, `className?: string`
- [x] 6.2 Implement `PreviewCard.tsx`: render `<iframe>` with `src={url}`, add `sandbox` attribute for security, show title header, display loading skeleton until iframe `onLoad`
- [x] 6.3 Implement `PreviewCard` inline styles and CSS variable references
- [x] 6.4 Export `PreviewCard` from `src/index.ts`
- [x] 6.5 Write tests: renders iframe with correct URL, sandbox attribute present, title displayed, loading state shown before iframe loads

## 7. ArtifactCard Component

- [x] 7.1 Define `ArtifactCardProps` interface in `src/types.ts` with `artifact: Artifact` (from `@agenthub/shared`), `className?: string`
- [x] 7.2 Implement `ArtifactCard.tsx`: three states based on `artifact.status`: `building` (spinner + "Building..."), `completed` (title + content preview), `failed` (error icon + "Build failed"), supports `className` pass-through
- [x] 7.3 Implement `ArtifactCard` inline styles and CSS variable references
- [x] 7.4 Export `ArtifactCard` from `src/index.ts`
- [x] 7.5 Write tests: building state shows loading indicator, completed state shows content, failed state shows error message, appends className to root element

## 8. Integration and Verification

- [x] 8.1 Verify all 6 components are exported from `src/index.ts` with their TypeScript types
- [x] 8.2 Run `pnpm --filter @agenthub/ui lint` (tsc --noEmit) and fix any type errors
- [x] 8.3 Run `pnpm --filter @agenthub/ui test` (vitest run) — all tests passing
- [x] 8.4 Run `pnpm --filter @agenthub/ui build` (tsup) — verify ESM, CJS, and .d.ts outputs in dist/
- [x] 8.5 Run `pnpm build` at root to verify turbo.json pipeline includes the new package correctly
