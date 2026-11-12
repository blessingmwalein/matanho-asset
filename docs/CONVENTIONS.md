# Matanho Nexus: build conventions

Read this before writing code. The approved plan is `C:\Users\bless\.claude\plans\federated-dreaming-pillow.md` (domain rules, state machines, UAT mapping). The four reference HTML files in the repo root (`client-portal.html`, `company-portal.html`, `custodian-portal.html`, `public-onboarding.html`) are the visual source of truth for the external portals.

**Standing instruction: do NOT write tests and do NOT run tests. Implement features only.** The only verification allowed is a compile check (commands below).

## 1. What already exists (do not rebuild)

### Monorepo
- `packages/shared` (`@nexus/shared`): enums + label/tone maps (`enums.ts`), permissions & roles (`permissions.ts`), formatters (`format.ts`), constants, and zod schemas: `schemas/onboarding.ts` (six-step application, `computeReadiness`, `DOCUMENT_SLOTS`, `deriveRiskFlags`), `schemas/investment.ts` (portfolio/holding/transaction/list query), `schemas/custodian.ts`, `schemas/review.ts` (notes, approve/reject, recon resolve, company questions, statement generation, capital ack, service request, auth/admin), `schemas/reporting-pack.ts` (`REPORTING_PACK`, `computePackCompletion`, `validatePackValues`, `certificateStatus`). **Do not edit this package** (a rebuild would break the other agents). Put extra zod schemas next to your own code.
- `apps/api` (NestJS 11, Prisma 6, PostgreSQL/Neon). Schema: `apps/api/prisma/schema.prisma` (read it fully; it is the data model). Enums mirror `@nexus/shared`.
- `apps/web` (Next 15 App Router, Tailwind 4, TanStack Query/Table, RHF + zod, Recharts).

### API foundation (`apps/api/src/common`, global modules; just inject)
| Need | Use |
|---|---|
| DB | `PrismaService` (`common/prisma`) |
| Auth/permissions | Global `AccessGuard` is **deny-by-default**: every route MUST have `@Public()`, `@Authenticated()` or `@Perms(P.X, …)` / `@AnyPerm(...)` (`common/auth/decorators`). `@OrgTypes('INVESTOR')` restricts by org type. |
| Caller identity | `@Ctx() ctx: RequestContext` (`common/auth/request-context`): `userId, name, email, orgId, orgType, roleKey, permissions, investorId?, companyId?`. `isStaff(ctx)`. |
| Validation | `@Body(new ZodPipe(schema))`, `@Query(new ZodPipe(listQuerySchema.extend({...})))` (`common/zod/zod.pipe`). `@ApiZodBody(schema)` and `@ApiListQuery()` document it in Swagger. Validation errors → 400 `{message, errors:{path:msg}}`. |
| Pagination | `pageArgs(q)`, `paged(rows, total, q)`, `buildOrderBy(q, {sortKey: dir => orderBy}, fallback)` (`common/pagination`). List response shape `{ data, meta:{page,pageSize,total,totalPages} }`. |
| Money | `common/decimal.ts`: `D`, `money`, `marketValue`, `sum`, `dateOnly('YYYY-MM-DD')`, `todayUtc()`, `toISODate`. Money/qty are `Prisma.Decimal`; JSON serialises them as strings. **Never use JS floats for money.** |
| Audit | `AuditService.record({ctx, entityType, entityId, action, before, after, metadata}, tx?)`. Call it for every state change (status transitions, approvals, resolutions, publishes). Pass `tx` inside `$transaction`. The table is append-only. |
| References | `ReferenceService`: `investor() application() document() transaction() execution() dayEnd() reconBatch() companySubmission() generic(prefix,width)`. |
| Documents | `DocumentsService` (global): `create(file, meta, {ctx|name})`, `addVersion`, `getDetail`, `getContent`, `list`, `canAccess`. Controller `/documents` already exists (list, detail, `GET :id/content?disposition=inline|attachment`, upload, `:id/versions`, `:id/approve` (maker–checker), `:id/publish`). Create files via `docs.create({buffer, originalname, mimetype, size}, {...})`. Real bytes + SHA-256 are stored; never store only a filename. |
| Notifications | `NotificationsService.notify({organisationId|userId, type, title, body, link})`, `notifyStaff({...})`. Endpoints `/notifications` exist. |
| Idempotency | Mutating requests honour an `Idempotency-Key` header automatically (interceptor). The web sends one via `useIdempotencyKey()`. |
| Errors | Throw Nest `HttpException`s (`NotFoundException`, `ConflictException`, `ForbiddenException`, `BadRequestException`). 403/401 are audited automatically. |

### Scoping rules (security-critical, enforce in the QUERY not the UI)
- Investor user → only rows with `investorId === ctx.investorId` (portfolios, holdings, transactions, documents that are `PUBLISHED` + `audience INVESTOR`, commitments, capital calls).
- Custodian user → only `CustodianAccount.custodianOrgId === ctx.orgId` and the submissions of those accounts.
- Company user → only `companyId === ctx.companyId`.
- Out-of-scope id → respond **404** (never reveal existence). Cross-org write attempt → 403.
- Staff reads/writes are gated by permission strings (`P.*`), not by org.

### Web foundation (`apps/web/src`)
- Data: `api()`, `ApiError`, `documentUrl(id,{inline,version})`, `applyFieldErrors`, `Paged<T>` (`lib/api`); `useSession()`, `useCan()` (`lib/session`); `useListState()` for server-driven registers (`lib/use-list-state`); `useIdempotencyKey()` (`lib/idempotency`). All calls go to same-origin `/api/*` (proxy → NestJS; cookie auth is automatic). **Never put tokens in localStorage; never use localStorage as a data store.**
- Layout: `PageHeader, Panel, PanelHeader, PanelBody, InfoRow/InfoList, FinancialSummary, KpiStrip, EmptyState, ErrorState, PanelSkeleton, Breadcrumbs` (`components/nx/layout`). Trailing breadcrumbs: `useCrumbs([{label}])` (`components/shell/crumbs`).
- Tables/filters: `DataTable` (+ `RowAction`), `SearchInput`, `FilterSelect`, `FilterBar`, `Segmented`.
- Status: `StatusIndicator`, `Tag`, `ApplicationStatus`, `KycStatus`, `ReconStatusLabel`, `CompanySubmissionStatus`, `DocumentStatus`, `TransactionStatus`, `SimpleStatus` (`components/nx/status`). Prefer dot+label over filled pills.
- Blocks: `ActivityTimeline, DetailSection, DetailKpis, FileDropzone, FileChip, DocumentPreviewPanel, ReviewPanel` (`components/nx/blocks`).
- Charts: `PerformanceChart, AllocationDonut, AllocationBars, CommitmentVsCalled, StatusBars/ReconStatusChart, Sparkline, ASSET_CLASS_COLORS, sliceForPeriod` (`components/nx/charts`).
- Overlays: `Dialog/DialogContent/DialogFooter/ConfirmDialog` (`ui/dialog`), `Sheet/SheetContent` side drawer (`ui/sheet`), `DropdownMenu*`, `Popover*`, `Tooltip` (`ui/menus`), `Tabs*`, `Select*`, `Checkbox`, `Switch`, `Skeleton` (`ui/controls`), `Button/IconButton` (`ui/button`: variants primary|secondary|tertiary|destructive|dark|link, sizes sm|md|lg|icon|icon-sm, `loading` prop). Toasts: `import { toast } from 'sonner'`.
- Forms (RHF, wrap in `<FormProvider {...form}>`; fields default to the context control): `TextField, TextareaField, NumberField, CurrencyField, PercentField, DateField, SelectField, SearchableSelectField, ComboboxField, MultiSelectField, CheckboxField, RadioGroupField, SwitchField, FileField, RepeaterField, FormSection, FullWidth` (`components/form/fields`).
- Shells already wired by route-group layouts (do not re-create): `(internal)` → `InternalShell`; `(investor)` → `PortalShell` (use `usePortal()` for `{accountId, currency, fxRate}`); `(custodian)`, `(company)` → `SimpleShell`; `(public)` → `SimpleShell` (no auth). Middleware redirects unauthenticated users to `/login` and wrong-portal users to their own portal.

## 2. API module pattern

```ts
// apps/api/src/modules/<name>/<name>.controller.ts
@ApiTags('Investors') @Controller('investors')
export class InvestorsController {
  constructor(private readonly svc: InvestorsService) {}
  @Get() @Perms(P.INVESTORS_READ) @ApiListQuery()
  list(@Query(new ZodPipe(listSchema)) q: ListQuery & {...}) { return this.svc.list(q); }
  @Get(':id') @Perms(P.INVESTORS_READ)
  detail(@Param('id') id: string) { return this.svc.detail(id); }
  @Post() @Perms(P.INVESTORS_MANAGE) @ApiZodBody(schema)
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(schema)) body: z.infer<typeof schema>) {...}
}
```
- Module file already exists as a stub (`modules/<name>/<name>.module.ts`) and is **already registered** in `app.module.ts`. Replace the stub body with `controllers`/`providers`; do not touch `app.module.ts` (add new modules inside the existing stub module folders).
- Services use `PrismaService` directly; wrap multi-write workflows in `prisma.$transaction` and write the audit event inside it.
- Multipart: `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMITS.maxBytes } }))` + `@UploadedFile() file: Express.Multer.File`.
- Response bodies are plain objects (Decimals become strings, Dates become ISO strings). Include the display fields the UI needs so pages don't make N+1 calls.

## 3. Web page pattern

```tsx
'use client';
const list = useListState({ sort: 'createdAt' });
const q = useQuery({ queryKey: ['investors', list.params], queryFn: () => api<Paged<Row>>('/investors', { query: list.params }), placeholderData: keepPreviousData });
<PageHeader eyebrow="Investors" title="Investor Register" actions={<Button variant="primary">…</Button>} />
<Panel>
  <FilterBar><SearchInput value={list.state.q} onChange={list.setQ} /><FilterSelect … /></FilterBar>
  <DataTable columns={columns} data={q.data?.data} loading={q.isFetching} meta={q.data?.meta} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} sort={list.state.sort} order={list.state.order} onSort={list.onSort} onRowClick={open} />
</Panel>
```
- Mutations: `useMutation` + `useIdempotencyKey()` for create/submit actions; on success `toast.success`, invalidate query keys, `key.reset()`. Show `ApiError.message`; map `errors` onto fields with `applyFieldErrors(err, form.setError)`.
- Detail views open in a `Sheet` (side drawer) or a dedicated `[id]` page as specified per module. Document previews use `DocumentPreviewPanel` with the real stored file.
- Every visible button/filter/tab/dropdown must work. Provide loading (skeleton), empty and error states.
- Money/quantities/dates: only via `formatMoney, formatCompactMoney, formatQuantity, formatPrice, formatPercent, formatDate, formatDateTime` from `@nexus/shared`. Wrap numbers in the `num` class (tabular numerals); right-align financial columns (`meta: { align: 'right' }`).
- Charts only where they communicate something. Show the simplified-valuation notice (`SIMPLIFIED_VALUATION_NOTICE`) wherever MVP valuations are displayed.

## 4. Design rules (strict)
Light, compact, enterprise. Warm off-white canvas, white surfaces, navy ink, Matanho blue `#2457d6` for interaction, muted green/amber/red for meaning only. **No gradients, glow, glassmorphism, giant radii, heavy shadows, decorative blobs.** Radii 6–10px, hairline borders. Buttons: one primary per view; most actions secondary/tertiary. Use different compositions for different workflows (do not make every page "4 cards + table"). External portals must stay recognisable against their reference HTML (see the plan's reference table). Responsive: tables scroll horizontally, grids stack, forms stay usable at 390px.

## 5. Seed conventions (`apps/api/src/seed/*.ts`)
- Each seed file exports `async function seedX(ctx: SeedContext)` and is called in order by `seed/index.ts`: identity → investors → **portfolios → capital → applications → custodian → companies → documents** → support. The DB is empty when seeds run (index.ts wipes it with `--reset`).
- Register created ids with `ctx.set('portfolio.bgf', id)` and read others with `ctx.get(...)`. Keys that already exist: `org.{am,horizon,cedar,custodianA,custodianB,africapay,lakeside}`, `user.{admin,am,ops,compliance,readonly,horizon1,horizon2,horizon3,cedar1,custodianA,custodianB,africapay,lakeside}`, `role.<ROLEKEY>`, `investor.{horizon,cedar}`, `application.{horizon,cedar}`.
- Deterministic data only: use `ctx.rng()` (seeded), never `Math.random()`. Dates relative to `ctx.today` via `ctx.daysAgo(n)`, `ctx.daysFromNow(n)`, `ctx.businessDaysAgo(n)`. Synthetic names only (`.example` domains).
- Files: create real documents through `ctx.docs.create(...)` (HTML statements, and PDFs generated with `pdf-lib` via `seed/pdf.ts`). Use `{ name: 'Seed' }` as actor.
- Use `ctx.refs.*` for references.

### Cross-agent data contract (so seeds line up)
**Agent 1 (`seed/portfolios.ts`) MUST create and register:**
- Securities (key `security.<TICKER>`), ASSET classes incl. cash lines (`CASH-USD`): equities `DLTA.ZW, ECO.ZW, INN.ZW, OMU.ZW, SEED.ZW, NPN.JO, ANG.JO`, global ETF `VOO`/`ACWI`, fixed income (`ZW-TB-2027`, `UST-2030`, `RSA-R186`), plus `CASH-USD`.
- Investment accounts + portfolios (keys `portfolio.bgf`, `portfolio.arf`, `portfolio.inc`, `portfolio.cedar1`), refs `BGF-001, ARF-001, INC-001, CED-001`; Horizon owns bgf/arf/inc; Cedar owns cedar1. Values to match `client-portal.html`: Balanced Growth ≈ 11,860,000; Absolute Return ≈ 3,120,000; Income Mandate ≈ 1,660,000 USD (cash is the plug so totals match; allocation roughly 49% equities, 22% fixed income, 14% cash for the public mandates). Portfolio manager = `user.am`. Holdings are `CONFIRMED`, source `SEED`, valuation date = last business day.
- Monthly `PortfolioValuation` series (3 years, deterministic walk, with `benchmarkIndex`) for every portfolio.
- Investment transactions (status COMPLETED unless noted) including these exact trade references used by the custodian seed: `TRD-DEMO-201` (BGF, BUY `DLTA.ZW` 10000 @ 0.184 USD, tradeDate = `ctx.businessDaysAgo(2)`), `TRD-DEMO-202` (BGF, SELL `INN.ZW` 5000 @ 0.412), `TRD-DEMO-203` (BGF, BUY `ECO.ZW` 20000 @ 0.095; deliberately has NO custodian record), `TRD-DEMO-301` (BGF, BUY `DLTA.ZW` 10000 @ 0.184, tradeDate = **today**; this is the one the live Flow-3 demo matches). Register them as `tx.<tradeReference>`. Plus ~25 other realistic transactions across portfolios in the last 90 days.
**Agent 3 (`seed/custodian.ts`)** creates `CustodianAccount`s for custodianA (BGF-001, ARF-001, INC-001) and custodianB (CED-001) linked to the portfolios by key, executions that exercise MATCHED (201), DIFFERENCE (202: custodian qty 4500 vs internal 5000), UNMATCHED custodian-only (`TRD-DEMO-299`), plus one fresh `NOT_STARTED` day-end and one `NOT_STARTED` execution awaiting reconciliation; a `ReconciliationBatch` with items/exceptions for the reconciled ones (one exception left OPEN, one RESOLVED with note + user).
**Agent 2 (`seed/capital.ts`)** creates funds `MGFI` (Matanho Growth Fund I, PE) and `PCFI` (Private Credit Fund I) and Horizon's commitments: MGFI commitment 2,500,000 / called 1,400,000 / NAV 1,760,000 / IRR 18.4 / TVPI 1.38 / DPI 0.24; PCFI commitment 1,850,000 / called 1,100,000 / NAV 1,080,000 / IRR 13.2 / TVPI 1.21 / DPI 0.31; capital events: open call `CC-<year>-03` (CALL, 250,000, issued ~3 days ago, due **in ~14 days**, status ISSUED), plus the history rows from `client-portal.html`. Register `fund.mgfi`, `fund.pcfi`, `commitment.horizon-mgfi`, `commitment.horizon-pcfi`.

## 6. Cross-cutting endpoints the SHELLS already call (owners implement)
| Endpoint | Owner | Contract |
|---|---|---|
| `GET /search?q=` (staff, `@Authenticated` + staff permission) | Agent 1 | `{ investors:[{id,ref,name}], portfolios:[{id,ref,name}], applications:[{id,reference,name}], companies:[{id,name}], documents:[{id,ref,title}] }` (max 5 each, case-insensitive contains) |
| `GET /dashboard/nav-counts` | Agent 1 | `{ applications, submissions, exceptions, reporting }`: open counts (applications SUBMITTED/RESUBMITTED/UNDER_REVIEW; custodian records NOT_STARTED; OPEN recon exceptions; company submissions SUBMITTED/RESUBMITTED) |
| `GET /investor-portal/accounts` | Agent 2 | `[{ id, name, ref, type }]` investment accounts of the caller's investor |
| `POST /investor-portal/service-requests` | Agent 2 | body `serviceRequestSchema`; stores a staff `Notification` (type `SERVICE_REQUEST`) + audit event; returns `{ ok: true }` |

## 7. Ownership (do not edit files outside your list)
- **Agent 1: Internal ERP.** API: `modules/{investors,applications,portfolios,dashboard}`. Web: `app/(internal)/internal/{dashboard,investors,onboarding,portfolios,holdings,activity}`, feature components in `components/features/{investors,onboarding-review,portfolios,dashboard}/`. Seed: `seed/portfolios.ts`.
- **Agent 2: External portals.** API: `modules/{public-onboarding,investor-portal}`. Web: `app/(public)/apply/**`, `app/(investor)/portal/**`, `components/features/{apply,portal}/`. Seed: `seed/{capital,applications,documents}.ts`, `seed/pdf.ts`; also `modules/investor-portal/statement-html.ts` (pure `renderStatementHtml(data)` used by seeds and by reports later).
- **Agent 3: Operations.** API: `modules/{custodian,reconciliation,companies}`. Web: `app/(custodian)/custodian/**`, `app/(company)/company/**`, `app/(internal)/internal/operations/**`, `app/(internal)/internal/companies/**`, `components/features/{custodian,reconciliation,company}/`. Seed: `seed/{custodian,companies}.ts`.
- **Lead (not agents):** `modules/{reports,admin}`, `(internal)/internal/{documents,reports,admin}`, `common/*`, shared UI (`components/ui|nx|form|shell`), `lib/*`, `packages/shared`, `app.module.ts`, `seed/{index,seed-context,identity,investors,support}.ts`, Prisma schema/migrations, docs, render/Docker config.
If you find a bug or gap in a lead-owned file, make the smallest possible fix and list it in your final report.

## 8. Compile checks (the only verification to run)
- API: `npx tsc --noEmit -p apps/api/tsconfig.json`
- Web: `cd apps/web && npx tsc --noEmit`
Other agents are editing concurrently: ignore errors in files you do not own; fix every error in your own files. Do not run `next build`, the seed, migrations, servers, Playwright or any test runner. Do not run `npm install` (ask the lead if you need a dependency; `pdf-lib` is already available).
