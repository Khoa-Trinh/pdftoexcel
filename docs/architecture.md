# Architecture and integration decisions

The browser runs React with TanStack Router file-based routes. TanStack Start
renders the document on the server and strips server route handlers from the
client build. Nitro's Vite integration serves Start and builds a Node serverless
function with the `netlify` preset. There is no Vinxi configuration and no
`@netlify/vite-plugin-tanstack-start` dependency.

`src/routes/api/health.ts` is a Start server route served by Nitro. Its GET handler
returns JSON. `src/server/extraction-service.server.ts` is guarded with Start's
`server-only` import; future credentials and adapters belong in that directory,
never in routes' client components or `VITE_*` variables. Shared data-only types
live in `src/types/invoice.ts`. Invoice numbers, series and tax IDs are strings.
Dates are ISO calendar dates, missing fields are null, VAT rates are percentage
values, and line items reference `Invoice.id` with one-based PDF page numbers.
The TypeScript parser uses `decimal.js` internally for exact decimal arithmetic;
JSON-facing amounts remain numbers. Downstream editing/export must still agree
on currency rounding and precision rules.

## Native TypeScript extraction

The supplied Python parser has been ported into server-only modules. There is no
Python process, Python dependency or remote parser. `invoice-parser.server.ts`
reads PDF bytes, `invoice-fields.server.ts` applies field/table/validation rules,
and `extraction-service.server.ts` maps the original snake_case result to shared
application types. The source attachment is retained outside this project; no
Python file existed in the workspace to replace.

`POST /api/extract` accepts one multipart `file` and calls the real adapter. It
bounds the received body, validates the PDF signature, limits files to 4 MiB and
documents to 100 pages, returns safe errors and does not persist uploads. This is
a synchronous parser endpoint, not a batch queue or storage service. The browser
homepage is not yet connected to it; selected files there remain local.

[Parser details and known differences](parser.md) describe the PDF engines,
worker packaging, review rules and test coverage.

## Next implementation work

- Validate real customer invoice layouts and connect the multi-file homepage to the adapter.
- Add upload limits and clear per-file failure/retry feedback.
- Build review/edit controls and show validation issues before export.
- Choose an Excel library and generate a workbook with invoice and item sheets;
  preserve identifiers as text and agree on dates, currency and VAT formatting.
