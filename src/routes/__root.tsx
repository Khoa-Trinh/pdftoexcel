import type { ReactNode } from 'react'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import appCss from '@/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Trích xuất hóa đơn' },
      { name: 'description', content: 'Chọn hóa đơn PDF, xem lại dữ liệu và xuất Excel.' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return <html lang="vi"><head><HeadContent /></head><body><TooltipProvider>{children}</TooltipProvider><Scripts /></body></html>
}
