# poc-flue

POCs de sistemas agênticos com [Flue](https://flueframework.com).
Cada POC explora uma **primitiva do design de agentes** num domínio aplicado — a ideia é que cada pasta seja uma referência estudável de "como isso fica em código real, rodando em produção".

## POCs

| POC | Primitiva explorada | O que aprender | Status |
|---|---|---|---|
| [auditor](./pocs/auditor/) | Agente que avalia outro agente (meta-agente) | Decision Log + classificação de ground truth, propostas via PR no GitHub, defesa PII em camadas | v0.3 |

> Novas POCs entram aqui à medida que primitivas novas forem materializadas. Cada uma é self-contained: próprio Worker, `package.json`, `wrangler.toml` e roteiro de leitura no `README.md` da POC.

## Pré-requisitos

- Node 22+ e npm
- Conta [Cloudflare](https://dash.cloudflare.com/) (free tier serve) — para Workers, D1, R2 e Workers AI
- Conta [AI Gateway](https://developers.cloudflare.com/ai-gateway/) na Cloudflare — centraliza tráfego LLM com observabilidade
- Familiaridade básica com TypeScript

## Setup inicial

```bash
git clone https://github.com/<owner>/poc-flue.git
cd poc-flue
cp .dev.vars.example .dev.vars   # preencha as variáveis (comentários explicam cada uma)
cd pocs/<nome>/
npm install
npm run dev
```

Secrets ficam centralizados em `.dev.vars` na raiz e são referenciados por cada POC via `flue dev --env ../../.dev.vars`. Veja `.dev.vars.example` pra lista completa e por que cada secret existe.

## Estrutura

```
poc-flue/
├── pocs/                     # cada POC self-contained, com seu próprio Worker
│   └── <nome>/
│       ├── README.md         # TL;DR + roteiro de leitura (start here)
│       ├── docs/             # ARCHITECTURE, evolução, showcase
│       ├── wrangler.toml
│       ├── package.json
│       ├── .flue/            # agents, roles, skills
│       └── src/
├── docs/superpowers/         # specs e plans cross-POC
│   ├── specs/                # designs (o "porquê" e "o quê")
│   └── plans/                # implementações executáveis (o "como")
└── .github/workflows/        # CI compartilhado (deploy roteado por POC)
```

## Como estudar este repo

1. Escolha uma POC na tabela acima — comece pela que casa com a primitiva que você quer entender.
2. Leia o `README.md` da POC — ele aponta o roteiro (TL;DR → showcase → ARCHITECTURE → spec → código).
3. Rode local (`npm run dev`) e mexa nos fixtures pra ver o comportamento mudar.
4. Specs em `docs/superpowers/specs/` explicam **por que** o design é assim; plans em `docs/superpowers/plans/` mostram **como** foi implementado passo-a-passo.

## Licença

[MIT](./LICENSE).
