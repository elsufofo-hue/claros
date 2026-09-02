import { createFileRoute } from '@tanstack/react-router'
import { testarProPixDireto } from '@/lib/test-propix-direto.functions'

export const Route = createFileRoute('/api/public/test-propix-direto')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdminFromRequest } = await import('@/lib/api-auth.server')
        if (!(await requireAdminFromRequest(request))) {
          return Response.json({ error: 'Não autorizado.' }, { status: 401 })
        }
        const result = await testarProPixDireto({ data: undefined });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
