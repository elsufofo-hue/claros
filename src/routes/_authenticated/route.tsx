import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { verificarSessao } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { autenticado } = await verificarSessao();
    if (!autenticado) throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
