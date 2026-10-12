import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: () => <main className="p-8">Không tìm thấy trang.</main>,
    defaultErrorComponent: () => <main className="p-8">Đã có lỗi xảy ra. Vui lòng tải lại trang.</main>,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
