import { createFileRoute, redirect } from "@tanstack/react-router";

// Clientes e Faturas agora vivem em uma única tela.
export const Route = createFileRoute("/_authenticated/admin/clientes")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/faturas", replace: true });
  },
});
