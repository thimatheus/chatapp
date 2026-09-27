# ChatApp — Discord + WhatsApp

Chat em tempo real com contas por e-mail + número de acesso (estilo WhatsApp), contatos, grupos, canais públicos (estilo Discord/rádio) e chamadas de voz/vídeo em grupo (WebRTC).

## Stack
- **server/**: Node.js + Express + Socket.IO + SQLite (`node:sqlite` embutido) + JWT
- **client/**: React + Vite

## Como rodar

Em dois terminais:

```bash
cd server
npm install
npm run dev
```

```bash
cd client
npm install
npm run dev
```

Abra http://localhost:5173 e crie uma conta (nome, e-mail, senha). Ao criar a conta, você recebe um **número de acesso de 7 dígitos** — é ele que as outras pessoas usam para te adicionar como contato ou a um grupo, do jeito que usariam um número do WhatsApp.

Para testar com duas contas ao mesmo tempo no mesmo navegador, abra uma aba em `http://localhost:5173` e outra em `http://127.0.0.1:5173` (contam como origens separadas, então cada uma guarda seu próprio login).

## Funcionalidades
- Cadastro com nome + e-mail + senha; login por e-mail **ou** número de acesso
- Número de acesso único de 7 dígitos por conta (gerado automaticamente)
- Contatos: adicione qualquer pessoa pelo número de acesso dela
- Conversas diretas 1-a-1 em tempo real
- Grupos: crie grupos e adicione pessoas pelo número de acesso
- Canais públicos (estilo "rádio"): qualquer um cria, qualquer um encontra e entra
- Notificação do navegador + som configurável (liga/desliga por pessoa) quando chega mensagem
- Chamadas de voz e vídeo em grupo (até 7 pessoas), via WebRTC direto entre os participantes (sem servidor de mídia)
- Foto de perfil (clique no seu nome no rodapé da barra lateral)
- Indicador de "digitando..." e status online / "visto por último em..."
- Confirmação de leitura (✓ enviado, ✓✓ azul quando a outra pessoa lê) nas conversas diretas
- Editar e apagar mensagens enviadas
- Responder a uma mensagem específica (aparece citada acima da resposta)
- Reações rápidas com emoji (👍❤️😂😮😢🙏) — passe o mouse sobre a mensagem
- Bloquear/desbloquear contato (impede o envio de novas mensagens entre os dois lados)
- Instalável como PWA — no Chrome/Android aparece a opção "Instalar app" / "Adicionar à tela inicial"

## Limitações conhecidas
- E-mail é só guardado no perfil — não há envio real de confirmação por e-mail.
- Chamadas usam apenas um servidor STUN público (sem TURN), então funcionam bem na mesma rede/localhost; atrás de NATs mais restritivos em redes diferentes pode falhar. Se isso for um problema no uso real, dá pra adicionar um servidor TURN (ex: Twilio, Cloudflare, coturn próprio).
- A senha do JWT (`server/src/auth.js`) está fixa no código — antes de usar isso além de teste local, troque por uma variável de ambiente.
- O ícone do PWA é um SVG simples; funciona bem para instalar no Android/Chrome, mas o iOS/Safari prefere ícones PNG — se for importante no iPhone, troque `client/public/icon.svg` por um PNG 192x192 e 512x512 e ajuste o `manifest.json`.
- Reações usam um conjunto fixo de 6 emojis (não um seletor completo de emojis).
