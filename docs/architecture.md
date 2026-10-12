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
Before implementing monetary calculations, decide decimal precision and rounding
rules; JavaScript numbers in this initial contract are not an accounting engine.

## Python extraction: pending decision

The inspected workspace did not contain `invoice_parser.py`. If supplied later,
keep its PDF-bytes-to-JSON contract intact. Do not assume a Python interpreter or
Python dependencies exist in Netlify's Nitro Node function. Choose and validate
an integration before implementing extraction: for example, a separately hosted
Python HTTP service, or an explicit port of the parser to a supported Node
implementation. Hosting, authentication, timeouts, PDF size limits, retention,
error mapping and schema validation remain undecided. A long-running parser may
need a job-based service rather than a synchronous serverless request.

The `ExtractionService` interface defines the future adapter boundary. There is
no adapter, extraction endpoint, upload request, storage or mock extraction data.
Files currently remain in browser memory until removed, refreshed or closed.

## Next implementation work

- Connect a real extraction adapter and validate returned invoice/item data.
- Add upload limits and clear per-file failure/retry feedback.
- Build review/edit controls and show validation issues before export.
- Choose an Excel library and generate a workbook with invoice and item sheets;
  preserve identifiers as text and agree on dates, currency and VAT formatting.
