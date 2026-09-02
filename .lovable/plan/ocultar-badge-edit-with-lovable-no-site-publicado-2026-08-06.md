# Ocultar badge "Edit with Lovable" no site publicado

## Objetivo
Remover o logo/botão "Edit with Lovable" do canto inferior direito da versão publicada do site.

## Alteração
Definir a configuração de publicação `hide_badge` como `true` via `publish_settings--set_badge_visibility`.

## Estado atual
Badge visível (`hide_badge: false`).

## Resultado esperado
O logo de edição não será mais exibido no canto inferior direito de `https://clarofatura.app` e domínios publicados.

## Escopo
Apenas configuração de publicação. Nenhuma alteração de código, design ou banco de dados.
