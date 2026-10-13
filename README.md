# Sistema de Planejamento

Base inicial para planejar tarefas, acompanhar o progresso por usuário e notificar administradores em tempo real.

## Arquitetura

- **Front-end:** React. `frontend/src/PlanningProgress.jsx` exibe as tarefas, calcula o progresso imediatamente e envia alterações pelo Socket.IO.
- **Back-end:** Node.js e Express. Cadastro/login validam usuários no PostgreSQL, armazenam hashes bcrypt e emitem JWT. O Socket.IO autentica conexões com o mesmo token.
- **Banco de dados:** PostgreSQL. O modelo relacional mantém usuários, planejamentos, tarefas, atribuições individuais e histórico de alterações.
- **Autorização:** JWT com `id` e `role` no payload. O cadastro público só cria usuários; o administrador inicial é criado pelo comando de bootstrap. Somente administradores entram na sala de notificações.

## Estrutura

```text
backend/
	db/schema.sql
	db/migrations/001_add_password_hash.sql
	src/auth.js
	src/server.js
	scripts/create-admin.js
	.env.example
	package.json
frontend/
	package.json
	vite.config.js
	index.html
	src/App.jsx
	src/main.jsx
	src/PlanningProgress.jsx
```

## Modelo de dados

- `users`: identidade, papel (`admin` ou `user`) e hash da senha (`password_hash`).
- `plans`: planejamentos e limite percentual usado no cálculo.
- `tasks`: etapas vinculadas a um planejamento, cada uma com peso.
- `plan_assignments`: vínculo entre planejamento e usuário.
- `task_progress`: estado de cada etapa para cada atribuição. Assim, usuários diferentes podem executar o mesmo planejamento sem compartilhar checkboxes.
- `progress_logs`: histórico das marcações e desmarcações, com o autor e horário; o fluxo da aplicação apenas insere registros.

O progresso é a soma dos pesos concluídos dividida pelo limite definido no planejamento, limitado a 100%. O administrador deve garantir que a soma dos pesos corresponda ao limite desejado e criar um registro em `task_progress` para cada tarefa da atribuição.

## Inicialização

1. Crie um banco PostgreSQL. Em uma instalação nova, aplique `backend/db/schema.sql`. Se o banco já existia, aplique uma vez `backend/db/migrations/001_add_password_hash.sql`.
2. Configure e inicialize o back-end:

```sh
cd backend
cp .env.example .env
# Preencha DATABASE_URL, JWT_SECRET (aleatório, mínimo de 32 bytes), ADMIN_NAME,
# ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres; máximo 72 bytes).
npm install
npm run admin:create
npm start
```

O comando `admin:create` cria o administrador uma vez; ele não altera contas já existentes. O cadastro público cria apenas contas com papel `user`.

3. Em outro terminal, inicie a interface:

```sh
cd frontend
npm install
npm run dev
```

Depois de iniciar os dois serviços e entrar com uma conta, as páginas ficam protegidas por sessão. Os planejamentos exibidos ainda são demonstrativos; as marcações na tela do usuário não persistem no banco.

O login e cadastro chamam `/api/auth/login` e `/api/auth/register`. O backend salva hashes bcrypt no PostgreSQL; a senha original nunca é salva. O token JWT fica apenas na sessão do navegador e expira em 8 horas. A rota `/admin` exige um token com papel `admin`; `/` exibe a visão de usuário. O cadastro público só cria usuários comuns.

O token JWT enviado na autenticação do Socket.IO tem `id` numérico e `role` igual a `admin` ou `user`. O front-end encaminha chamadas `/api` ao Express pelo proxy do Vite.

O evento de entrada é `task:toggle`, com `{ progressId, completed }`. A resposta de confirmação contém `{ ok, progressPercent, ... }`; após confirmar a transação, o servidor transmite `progress:updated` somente aos administradores conectados.

> O painel `/admin` e a visão `/` ainda exibem dados demonstrativos; APIs para criar planejamentos/atribuições e carregar dados reais, além de refresh/revogação de JWT, ainda precisam ser implementadas. Não aceite `userId` fornecido pelo cliente como identidade.