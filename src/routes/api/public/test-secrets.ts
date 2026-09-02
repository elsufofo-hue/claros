import { createFileRoute } from '@tanstack/react-router'
import { testSecrets } from '@/lib/test-secrets.functions'

export const Route = createFileRoute('/api/public/test-secrets')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdminFromRequest } = await import('@/lib/api-auth.server')
        if (!(await requireAdminFromRequest(request))) {
          return Response.json({ error: 'Não autorizado.' }, { status: 401 })
        }
        const result = await testSecrets({ data: undefined });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
