import { createFileRoute } from '@tanstack/react-router'
import { setupProPix } from '@/lib/setup-propix.functions'

export const Route = createFileRoute('/api/public/setup-propix')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { requireAdminFromRequest } = await import('@/lib/api-auth.server')
          if (!(await requireAdminFromRequest(request))) {
            return Response.json({ error: 'Não autorizado.' }, { status: 401 })
          }
          const result = await setupProPix({ data: undefined });
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }
})
