# Finance Premium — versão web dinâmica

Aplicação web financeira com dashboard reativo, armazenamento local, backup em JSON e integração opcional com Google Drive.

## Executar no Windows

1. Extraia a pasta.
2. Execute `iniciar.bat`.
3. Acesse `http://localhost:8080`.

Para usar o Google Drive, execute obrigatoriamente pelo servidor local. A autenticação OAuth não deve ser configurada para uso direto por `file://`.

## Atualizações implementadas

- Dashboard recalculado automaticamente após inclusões, edições e exclusões.
- Gráficos de fluxo, categorias e relatórios derivados dos registros atuais.
- Saudação por horário com ícone de sol ou lua.
- Relógio digital em tempo real e relógio analógico com ponteiros de hora e minuto.
- Histórico de transações atualizado imediatamente e sincronizado entre abas.
- Cartões com limite restante calculado pelas compras vinculadas.
- Resumo de limites individual e consolidado.
- Terceiros vinculados a cartões, datas e parcelas.
- Totais de terceiros e relatórios recalculados automaticamente.
- Foto, nome e e-mail personalizáveis.
- Salvamento local opcional.
- Exportação e importação de backup completo em JSON.
- Backup e restauração no Google Drive.

## Configurar Google Drive

1. Crie um projeto no Google Cloud Console.
2. Ative a Google Drive API.
3. Configure a tela de consentimento OAuth.
4. Crie um ID de cliente OAuth do tipo Aplicativo da Web.
5. Adicione `http://localhost:8080` como origem JavaScript autorizada.
6. Cole o ID do cliente na tela Configurações do Finance Premium.
7. Use “Salvar no Drive” ou “Restaurar do Drive”.

A integração solicita apenas o escopo `https://www.googleapis.com/auth/drive.file`, limitado aos arquivos criados ou abertos pelo próprio aplicativo.

## Estrutura

- `index.html`: telas e ícones SVG.
- `css/tokens.css`: cores e variáveis.
- `css/app.css`: layout, componentes e novos controles.
- `css/responsive.css`: adaptação para desktop, tablet e celular.
- `js/config.js`: identidade, armazenamento e integração.
- `js/mock-data.js`: dados fictícios iniciais.
- `js/app.js`: cálculos, gráficos, cadastros, relógio, backups e persistência.

## Publicar no Render

Depois que este projeto estiver no repositório `mcalixto-lt/finance-premium-web`, use o botão abaixo para criar o serviço no Render a partir do `render.yaml`:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mcalixto-lt/finance-premium-web)

O Blueprint cria um site estático e ativa redeploy automático a cada commit na branch conectada.
