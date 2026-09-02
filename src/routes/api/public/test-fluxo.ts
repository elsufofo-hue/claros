import { createFileRoute } from '@tanstack/react-router'
import { testarFluxoCompleto } from '@/lib/test-fluxo.functions'

export const Route = createFileRoute('/api/public/test-fluxo')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdminFromRequest } = await import('@/lib/api-auth.server')
        if (!(await requireAdminFromRequest(request))) {
          return Response.json({ error: 'Não autorizado.' }, { status: 401 })
        }
        const result = await testarFluxoCompleto({ data: undefined });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
