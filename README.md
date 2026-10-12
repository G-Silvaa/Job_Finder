# Radar de Vagas Dev

Agregador pessoal de vagas de **desenvolvimento** (fullstack, front-end, back-end, mobile, DevOps, dados). Mostra vagas do **Brasil** em qualquer modalidade e, fora dele (**Portugal**, **EUA**, América Latina, Europa e mundo), **só vagas remotas**. Tudo aparece numa tela só, com filtros.

Tem também uma aba **"IA & Vibe coding"**. Ela mostra as vagas que pedem gente que programa com IA (Cursor, GitHub Copilot, Claude Code, Windsurf, vibe coding, agentes de código…) e as vagas para construir produtos com IA (LLMs, RAG, agentes, MCP…).

![arquitetura](https://img.shields.io/badge/backend-Node%20%2B%20Fastify%20%2B%20SQLite-0f766e) ![frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite%20%2B%20Tailwind-4f46e5)

## Como rodar

Você precisa do **Node.js 20.19 ou mais novo** (o 22 ou o 24 LTS são os recomendados).

```bash
npm install        # instala backend e frontend
npm run dev        # sobe a API (porta 3001) e a tela (porta 5173)
```

Abra **http://localhost:5173**. Na primeira vez o servidor busca as vagas em todas as fontes; isso leva de 2 a 5 minutos, e as vagas vão aparecendo na tela conforme chegam.

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm start` | Compila a tela e serve tudo em **http://localhost:3001** (um processo só) |
| `npm run collect` | Busca vagas pelo terminal, sem abrir a tela |
| `npm run collect -- gupy himalayas` | Busca só nas fontes indicadas |
| `npm run typecheck` | Checa os tipos do TypeScript |
| `npm test` | Roda os testes das regras de classificação |

### Atualização automática

Enquanto o servidor estiver ligado, o radar confere as fontes **a cada 1 hora**. Cada fonte só é consultada de novo depois do intervalo mínimo dela, que vai de 30 minutos (GitHub) até 20 horas (Himalayas, que pede no máximo uma consulta por dia), para não sobrecarregar ninguém.

- A tela percebe sozinha quando uma coleta termina e mostra as vagas novas.
- O aviso **"X vagas novas desde sua última visita"** tem o botão **Ver só as novas**.
- O selo **Nova** marca vagas publicadas nas últimas 48 h.
- Vagas que somem da fonte são marcadas como encerradas.

O botão **Atualizar** respeita esses intervalos. Na tela de **Fontes** (ícone de banco de dados) você pode forçar uma fonte específica. Para mudar a frequência, use `COLLECT_INTERVAL_HOURS` no `server/.env`.

## Fontes

| Região | Fontes |
|---|---|
| 🇧🇷 Brasil | Gupy (portal público, ~25 buscas de tecnologia), repositórios de vagas do GitHub (backend-br, frontendbr, react-brasil, soujava, DevOps-Brasil e mais 11), Remotar, ProgramaThor, Nerdin, GeekHunter, Workable Jobs |
| 🇵🇹 Portugal | ITJobs.pt, Landing.jobs, Teamlyzer, Workable Jobs, Net-Empregos |
| 🇺🇸 EUA / 🌍 remoto | Himalayas, We Work Remotely, 4 Day Week, Jobicy, Remote OK, Hacker News "Who is hiring?", Y Combinator, Remotive, Working Nomads |
| ✨ Foco em IA | AI Dev Jobs (aidevboard), Remote Vibe Coding Jobs |
| 🏢 Sites de carreira | 95 empresas via Greenhouse, Ashby, Lever, Workable, SmartRecruiters, Recruitee, Teamtailor e Gem. Entre elas: Anthropic, OpenAI, Cursor, Replit, Vercel, Lovable, Supabase, Cognition, Nubank, iFood, QuintoAndar, CI&T, Stone, Talkdesk, Feedzai, Farfetch, Cloudflare… |
| 🔑 Com chave grátis | Adzuna (BR/EUA), Jooble (BR/PT/EUA); a ITJobs.pt pega tudo com chave |

Para seguir mais empresas, edite `server/src/sources/companies.ts`. Descubra o ATS pela URL da página de vagas da empresa, por exemplo `boards.greenhouse.io/<slug>`, `jobs.ashbyhq.com/<slug>` ou `jobs.lever.co/<slug>`.

**Fora de propósito:** LinkedIn, Indeed, Glassdoor e Catho. Os termos de uso deles proíbem coleta automática e eles bloqueiam robôs. Para cobrir vagas parecidas, ative a Adzuna e o Jooble. As fontes usam APIs públicas, feeds RSS ou páginas permitidas pelo `robots.txt`, sempre com intervalos educados.

### Chaves opcionais

Copie `server/.env.example` para `server/.env` e preencha o que quiser:

- `GITHUB_TOKEN`: aumenta o limite da API do GitHub. Crie um token sem nenhuma permissão.
- `ITJOBS_API_KEY`: com ela, a ITJobs.pt entrega todas as vagas de TI de Portugal. Peça em https://www.itjobs.pt/api.
- `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`: liga a Adzuna (Brasil e EUA).
- `JOOBLE_API_KEY`: liga o Jooble (Brasil, Portugal e EUA).

## Como a classificação funciona

Cada vaga passa por regras (em `server/src/classify/`) que olham o título, as tags e a descrição:

- **Área**: fullstack, front-end, back-end, mobile, DevOps/cloud, dados & ML, QA. O título manda. Se ele for genérico ("Software Engineer"), a área sai das tecnologias pedidas na descrição.
- **Nível**: estágio, júnior, pleno, sênior, lead/staff/especialista. Vem do título, das tags ou dos anos de experiência pedidos.
- **Onde**: Brasil, Portugal, EUA, remoto América Latina, remoto Europa ou remoto global. Fora do Brasil só entram vagas **remotas**; uma vaga presencial em Lisboa ou Nova York fica de fora. Para desligar essa regra, use `REMOTE_ONLY_OUTSIDE_BR=false` no `server/.env`. Vagas só de outros países (ex.: "Remote – Germany") também ficam de fora.
- **Modelo**: remoto, híbrido ou presencial.
- **IA**: termos com pesos. "Vibe coding", "Claude Code", "Cursor", "GitHub Copilot", "desenvolvimento assistido por IA" e "agentes de código" contam para **IA para programar**. "LLM", "RAG", "LangChain", "IA generativa" e "agentes de IA" contam para **Engenharia de IA**. Termos no título valem o dobro. No detalhe da vaga, os termos encontrados aparecem destacados.
- **Duplicadas**: a mesma vaga (mesma empresa e mesmo título) em várias fontes aparece uma vez só, com "também em…".

Quando você mudar uma regra, aumente `CLASSIFIER_VERSION` em `server/src/classify/index.ts`. O servidor reclassifica tudo o que está no banco sem buscar de novo.

## Estrutura

```
server/                 API (Fastify) + coleta + SQLite
  src/sources/          uma integração por site (brazil.ts, portugal.ts, global.ts, ats.ts…)
  src/classify/         regras de área, nível, local, tecnologias e IA
  src/collector.ts      roda as fontes, classifica, grava e encerra vagas que sumiram
  src/store.ts          busca e filtros em memória (rápido para dezenas de milhares de vagas)
  data/vagas.db         banco local (criado sozinho)
web/                    tela em React + Tailwind
```

### API

- `GET /api/jobs`: lista com filtros. Parâmetros: `q`, `regions`, `stack`, `seniority`, `workMode`, `ai` (`any` | `vibe` | `llm`), `techs`, `sources`, `days`, `salary`, `view` (`all` | `favorites` | `applied` | `hidden`), `sort` (`recent` | `ai` | `relevance`), `page` e `pageSize`.
- `GET /api/jobs/:id`: vaga com a descrição completa.
- `POST /api/jobs/:id/mark`: favorita, marca candidatura ou oculta a vaga. Corpo: `{ "favorite": true }`.
- `GET /api/stats` e `GET /api/sources`: números e status das fontes.
- `POST /api/collect`: dispara a coleta.

Favoritas, candidaturas e vagas ocultas ficam salvas no banco local.
